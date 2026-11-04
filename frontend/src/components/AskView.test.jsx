import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import AskView from './AskView'
import { askLecture, getIndexStatus, indexLecture } from '../lib/api'
import { addLecture, deleteLecture, getLecture, useLecture } from '../lib/lectures'
import { ANSWER, INDEX_RESULT, makeLecture } from '../test/fixtures'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getIndexStatus: vi.fn(),
  indexLecture: vi.fn(),
  askLecture: vi.fn(),
}))

function Harness({ id, onJump = () => {} }) {
  const lecture = useLecture(id)
  return lecture ? <AskView lecture={lecture} onJump={onJump} /> : null
}

let lecture
async function setup(overrides = {}, onJump) {
  lecture = makeLecture(overrides)
  addLecture(lecture)
  await act(async () => {
    render(<Harness id={lecture.id} onJump={onJump} />)
  })
}

const input = () => screen.getByRole('textbox', { name: /your question/i })
async function type(text, key = 'Enter', extra = {}) {
  fireEvent.change(input(), { target: { value: text } })
  await act(async () => fireEvent.keyDown(input(), { key, ...extra }))
}

describe('AskView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    indexLecture.mockResolvedValue(INDEX_RESULT)
  })
  afterEach(() => deleteLecture(lecture.id))

  it('indexes the lecture on first open, then enables questions', async () => {
    let finish
    indexLecture.mockReturnValue(new Promise((r) => (finish = r)))
    lecture = makeLecture()
    addLecture(lecture)
    render(<Harness id={lecture.id} />)

    expect(await screen.findByText(/Indexing the lecture for search/)).toBeTruthy()
    expect(input().disabled).toBe(true)
    await act(async () => finish(INDEX_RESULT))

    expect(screen.getByText(/Lecture indexed · 3 searchable passages/)).toBeTruthy()
    expect(input().disabled).toBe(false)
    expect(getLecture(lecture.id).ragIndex.transcript_hash).toBe(INDEX_RESULT.transcript_hash)
  })

  it('shows suggested questions and sends one when clicked', async () => {
    askLecture.mockResolvedValue(ANSWER)
    await setup()
    expect(screen.getByText('Ask anything about this lecture')).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'What is this lecture about?' })))

    expect(askLecture.mock.calls[0][1].question).toBe('What is this lecture about?')
    const conversation = screen.getByRole('list', { name: 'Conversation' })
    expect(within(conversation).getByText('What is this lecture about?')).toBeTruthy()
  })

  it('renders answers with clickable inline citations and a sources list', async () => {
    askLecture.mockResolvedValue(ANSWER)
    const onJump = vi.fn()
    await setup({}, onJump)

    await type('What does gradient descent do?')

    expect(screen.getByText(/Gradient descent minimizes a loss function/)).toBeTruthy()
    const inline = screen.getAllByRole('button', { name: 'Source 1, 0:07–0:13' })
    expect(inline).toHaveLength(2)
    fireEvent.click(inline[0])
    expect(onJump).toHaveBeenCalledWith(ANSWER.citations[0])

    expect(screen.getByText('Sources from the lecture')).toBeTruthy()
    fireEvent.click(screen.getByText(/grade in descent an optimization method/).closest('button'))
    expect(onJump).toHaveBeenCalledTimes(2)
    expect(input().value).toBe('')
  })

  it('marks answers the lecture does not cover', async () => {
    askLecture.mockResolvedValue({ answer: "I couldn't find anything about that in this lecture.", answerable: false, citations: [], model: null, retrieved: 0 })
    await setup()
    await type('Who won the World Cup?')
    expect(screen.getByText('Not covered in this lecture')).toBeTruthy()
    expect(screen.queryByText('Sources from the lecture')).toBeNull()
  })

  it('shows a loading bubble while waiting and keeps Shift+Enter for new lines', async () => {
    let resolve
    askLecture.mockReturnValue(new Promise((r) => (resolve = r)))
    await setup()

    await type('first line', 'Enter', { shiftKey: true })
    expect(askLecture).not.toHaveBeenCalled()

    await type('What is a loss function?')
    expect(screen.getByText(/Searching the lecture and writing an answer/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /send question/i }).disabled).toBe(true)
    await act(async () => resolve(ANSWER))
    expect(screen.queryByText(/Searching the lecture/)).toBeNull()
  })

  it('shows errors with a retry button', async () => {
    const error = Object.assign(new AxiosError('fail'), { response: { status: 504, data: { detail: 'Gemini took too long to respond. Please try again.' } } })
    askLecture.mockRejectedValueOnce(error).mockResolvedValueOnce(ANSWER)
    await setup()

    await type('What is gradient descent?')
    expect(screen.getByRole('alert').textContent).toContain('Gemini took too long to respond')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /retry/i })))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Gradient descent minimizes a loss function/)).toBeTruthy()
  })

  it('restores saved conversation history and clears it after confirmation', async () => {
    const chat = [
      { id: '1', role: 'user', content: 'Saved question?' },
      { id: '2', role: 'assistant', content: 'Saved answer [1].', answerable: true, citations: ANSWER.citations },
    ]
    getIndexStatus.mockResolvedValue({ ...INDEX_RESULT, reindexed: undefined })
    await setup({ chat, ragIndex: { transcript_hash: INDEX_RESULT.transcript_hash } })
    expect(indexLecture).not.toHaveBeenCalled() // already indexed: status check only
    expect(screen.getByText('Saved question?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /clear chat/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /clear chat/i }))
    expect(screen.queryByText('Saved question?')).toBeNull()
    expect(getLecture(lecture.id).chat).toEqual([])
  })

  it('reports indexing failures and lets the user try again', async () => {
    indexLecture.mockRejectedValueOnce(
      Object.assign(new AxiosError('fail'), { response: { status: 503, data: { detail: "Couldn't open the vector database." } } }),
    )
    await setup()
    expect(screen.getByText(/Couldn't index this lecture: Couldn't open the vector database/)).toBeTruthy()

    indexLecture.mockResolvedValueOnce(INDEX_RESULT)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /try again/i })))
    expect(indexLecture).toHaveBeenLastCalledWith(expect.anything(), { force: true })
    expect(screen.getByText(/Lecture indexed/)).toBeTruthy()
  })

  it('does not offer the chat for a lecture without transcript text', async () => {
    await setup({ segments: [], transcript: '' })
    expect(screen.getByText(/no transcript text/)).toBeTruthy()
    expect(indexLecture).not.toHaveBeenCalled()
  })
})
