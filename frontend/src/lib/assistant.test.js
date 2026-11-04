import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { askLecture, getIndexStatus, indexLecture } from './api'
import { HISTORY_LIMIT, askQuestion, clearChat, ensureIndexed, getAssistantState, retryQuestion } from './assistant'
import { addLecture, deleteLecture, getLecture } from './lectures'
import { ANSWER, INDEX_RESULT, makeLecture } from '../test/fixtures'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal()),
  getIndexStatus: vi.fn(),
  indexLecture: vi.fn(),
  askLecture: vi.fn(),
}))

const httpError = (status, detail) => Object.assign(new AxiosError('fail'), { response: { status, data: { detail } } })

let lecture
function setup(overrides = {}) {
  lecture = makeLecture(overrides)
  addLecture(lecture)
  return lecture
}

describe('ensureIndexed', () => {
  beforeEach(() => vi.resetAllMocks())

  it('only checks status when the saved index is still current', async () => {
    setup({ ragIndex: { transcript_hash: INDEX_RESULT.transcript_hash } })
    getIndexStatus.mockResolvedValue({ ...INDEX_RESULT, reindexed: undefined })

    expect(await ensureIndexed(lecture)).toBe(true)
    expect(getIndexStatus).toHaveBeenCalledWith(lecture.id, INDEX_RESULT.transcript_hash)
    expect(indexLecture).not.toHaveBeenCalled()
    expect(getAssistantState(lecture.id).index).toEqual({ status: 'ready', chunkCount: 3 })
    deleteLecture(lecture.id)
  })

  it('indexes a new lecture and saves the transcript hash locally', async () => {
    setup()
    indexLecture.mockResolvedValue(INDEX_RESULT)

    expect(await ensureIndexed(lecture)).toBe(true)
    expect(getIndexStatus).not.toHaveBeenCalled()
    expect(indexLecture).toHaveBeenCalledWith(lecture, { force: false })
    expect(getLecture(lecture.id).ragIndex).toEqual({
      transcript_hash: INDEX_RESULT.transcript_hash,
      chunk_count: 3,
      embedding_model: INDEX_RESULT.embedding_model,
      indexed_at: INDEX_RESULT.indexed_at,
    })
    deleteLecture(lecture.id)
  })

  it('re-indexes when the backend index is stale or missing', async () => {
    setup({ ragIndex: { transcript_hash: 'old' } })
    getIndexStatus.mockResolvedValue({ indexed: false, up_to_date: false })
    indexLecture.mockResolvedValue(INDEX_RESULT)
    expect(await ensureIndexed(lecture)).toBe(true)
    expect(indexLecture).toHaveBeenCalledTimes(1)
    deleteLecture(lecture.id)
  })

  it('reports indexing errors', async () => {
    setup()
    indexLecture.mockRejectedValue(httpError(503, "Couldn't load the embedding model."))
    expect(await ensureIndexed(lecture)).toBe(false)
    expect(getAssistantState(lecture.id).index).toEqual({ status: 'error', error: "Couldn't load the embedding model." })
    deleteLecture(lecture.id)
  })
})

describe('askQuestion', () => {
  beforeEach(() => vi.resetAllMocks())

  it('saves the question and the grounded answer to the lecture chat', async () => {
    setup({ ragIndex: { transcript_hash: 'h' } })
    askLecture.mockResolvedValue(ANSWER)

    await askQuestion(lecture.id, '  What does gradient descent do?  ')

    expect(askLecture).toHaveBeenCalledWith(expect.objectContaining({ id: lecture.id }), {
      question: 'What does gradient descent do?',
      history: [],
    })
    const chat = getLecture(lecture.id).chat
    expect(chat.map((m) => [m.role, m.content])).toEqual([
      ['user', 'What does gradient descent do?'],
      ['assistant', ANSWER.answer],
    ])
    expect(chat[1]).toMatchObject({ answerable: true, citations: ANSWER.citations, model: ANSWER.model })
    const stored = JSON.parse(localStorage.getItem('studykit.lectures.v1')).find((l) => l.id === lecture.id)
    expect(stored.chat).toHaveLength(2)
    deleteLecture(lecture.id)
  })

  it('sends only the most recent messages as history', async () => {
    const chat = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: `message ${i}`, citations: [] }))
    setup({ chat })
    askLecture.mockResolvedValue(ANSWER)

    await askQuestion(lecture.id, 'And what about that?')

    const { history } = askLecture.mock.calls[0][1]
    expect(history).toHaveLength(HISTORY_LIMIT)
    expect(history[0]).toEqual({ role: 'user', content: 'message 4' })
    expect(history.at(-1)).toEqual({ role: 'assistant', content: 'message 9' })
    deleteLecture(lecture.id)
  })

  it('rebuilds a missing index and retries once on 409', async () => {
    setup({ ragIndex: { transcript_hash: 'stale' } })
    askLecture.mockRejectedValueOnce(httpError(409, 'out of date')).mockResolvedValueOnce(ANSWER)
    getIndexStatus.mockResolvedValue({ indexed: true, up_to_date: false })
    indexLecture.mockResolvedValue(INDEX_RESULT)

    await askQuestion(lecture.id, 'What is a loss function?')

    expect(indexLecture).toHaveBeenCalledTimes(1)
    expect(askLecture).toHaveBeenCalledTimes(2)
    expect(askLecture.mock.calls[1][0].ragIndex.transcript_hash).toBe(INDEX_RESULT.transcript_hash)
    expect(getLecture(lecture.id).chat).toHaveLength(2)
    deleteLecture(lecture.id)
  })

  it('keeps the question and offers a retry when answering fails', async () => {
    setup()
    askLecture
      .mockRejectedValueOnce(httpError(429, "Gemini's rate limit or quota was reached. Wait a minute and try again."))
      .mockResolvedValueOnce(ANSWER)

    await askQuestion(lecture.id, 'What is gradient descent?')
    expect(getAssistantState(lecture.id).ask).toMatchObject({ status: 'error', error: expect.stringContaining('rate limit') })
    expect(getLecture(lecture.id).chat.map((m) => m.role)).toEqual(['user'])

    await retryQuestion(lecture.id)
    expect(askLecture.mock.calls[1][1].question).toBe('What is gradient descent?')
    expect(getLecture(lecture.id).chat.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(getAssistantState(lecture.id).ask.status).toBe('idle')
    deleteLecture(lecture.id)
  })

  it('ignores blank questions and clears the chat', async () => {
    setup({ chat: [{ id: '1', role: 'user', content: 'hi' }] })
    await askQuestion(lecture.id, '   ')
    expect(askLecture).not.toHaveBeenCalled()
    clearChat(lecture.id)
    expect(getLecture(lecture.id).chat).toEqual([])
    deleteLecture(lecture.id)
  })
})
