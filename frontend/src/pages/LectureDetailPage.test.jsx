import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LectureDetailPage from './LectureDetailPage'
import { addLecture, deleteLecture } from '../lib/lectures'
import { askLecture, getIndexStatus } from '../lib/api'
import { ANSWER, FLASHCARDS, INDEX_RESULT, NOTES, QUIZ, makeLecture } from '../test/fixtures'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getIndexStatus: vi.fn(),
  indexLecture: vi.fn(),
  askLecture: vi.fn(),
}))

let lecture

function renderAt(search) {
  lecture = makeLecture({ notes: NOTES, flashcards: FLASHCARDS })
  addLecture(lecture)
  render(
    <MemoryRouter initialEntries={[`/lectures/${lecture.id}${search}`]}>
      <Routes>
        <Route path="/lectures/:lectureId" element={<LectureDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const highlighted = () => [...document.querySelectorAll('li[data-focused="true"]')].map((li) => li.textContent)
const tab = (name) => screen.getByRole('tab', { name: new RegExp(name, 'i') })

describe('LectureDetailPage', () => {
  afterEach(() => deleteLecture(lecture.id))

  it('moves between tabs with the arrow keys and keeps one tab in the tab order', () => {
    renderAt('')
    expect(tab('transcript').getAttribute('tabindex')).toBe('0')
    expect(tab('notes').getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(tab('transcript'), { key: 'ArrowRight' })
    expect(tab('notes').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('notes'))

    fireEvent.keyDown(tab('notes'), { key: 'End' })
    expect(tab('ask ai').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('ask ai'), { key: 'ArrowRight' }) // wraps around
    expect(tab('transcript').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('transcript'), { key: 'ArrowLeft' })
    expect(tab('ask ai').getAttribute('aria-selected')).toBe('true')
  })

  it('confirms before deleting the lecture', () => {
    renderAt('')
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Delete “ML Basics”?')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'ML Basics', level: 1 })).toBeTruthy()
  })

  it('opens a flashcard source in the transcript and returns to the same card', () => {
    renderAt('?tab=flashcards')
    expect(tab('flashcards').getAttribute('aria-selected')).toBe('true')
    expect(tab('flashcards').textContent).not.toMatch(/soon/i)

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Card 2 of 3')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent.includes('Click to')))
    fireEvent.click(screen.getByRole('button', { name: '0:07–0:13' }))

    expect(tab('transcript').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/Highlighting the source of a flashcard \(0:07–0:13\)/)).toBeTruthy()
    expect(highlighted()).toHaveLength(2)
    expect(highlighted()[0]).toContain('grade in descent')

    fireEvent.click(screen.getByRole('button', { name: /back to flashcards/i }))
    expect(tab('flashcards').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Card 2 of 3')).toBeTruthy()
  })

  it('still links note sources back to the notes tab', () => {
    renderAt('?tab=notes')
    fireEvent.click(screen.getAllByRole('button', { name: '0:03–0:07' })[0])
    expect(screen.getByText(/Highlighting the source of a note/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /back to notes/i }))
    expect(screen.getByText(NOTES.summary)).toBeTruthy()
  })

  it('opens a quiz question source and returns to the same results', () => {
    lecture = makeLecture({ quiz: QUIZ })
    addLecture(lecture)
    render(
      <MemoryRouter initialEntries={[`/lectures/${lecture.id}?tab=quiz`]}>
        <Routes>
          <Route path="/lectures/:lectureId" element={<LectureDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(tab('quiz').textContent).not.toMatch(/soon/i)

    fireEvent.click(screen.getByRole('button', { name: /start quiz/i }))
    fireEvent.click(screen.getByRole('button', { name: /^submit quiz$/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /submit quiz/i }))
    expect(screen.getByText('0/3')).toBeTruthy()

    const review = screen.getByText('What does gradient descent minimize?').closest('article')
    fireEvent.click(within(review).getByRole('button', { name: '0:07–0:13' }))
    expect(screen.getByText(/Highlighting the source of a quiz question/)).toBeTruthy()
    expect(highlighted()).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /back to quiz/i }))
    expect(tab('quiz').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('0/3')).toBeTruthy()
  })

  it('opens an Ask AI citation in the transcript and returns to the chat', async () => {
    askLecture.mockResolvedValue(ANSWER)
    lecture = makeLecture({ ragIndex: { transcript_hash: INDEX_RESULT.transcript_hash, chunk_count: 3 } })
    addLecture(lecture)
    getIndexStatus.mockResolvedValue({ ...INDEX_RESULT, reindexed: undefined })
    render(
      <MemoryRouter initialEntries={[`/lectures/${lecture.id}?tab=ask`]}>
        <Routes>
          <Route path="/lectures/:lectureId" element={<LectureDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(tab('ask ai').textContent).not.toMatch(/soon/i)
    expect(await screen.findByText(/Lecture indexed · 3 searchable passages/)).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: /your question/i }), { target: { value: 'What does gradient descent do?' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /send question/i })))
    fireEvent.click(screen.getAllByRole('button', { name: /source 1, 0:07–0:13/i })[0])

    expect(screen.getByText(/Highlighting the source of an answer \(0:07–0:13\)/)).toBeTruthy()
    expect(highlighted()).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /back to ask ai/i }))
    expect(screen.getByText('Gradient descent minimizes a loss function', { exact: false })).toBeTruthy()
  })
})
