import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AxiosError } from 'axios'
import NotesView from './NotesView'
import { generateNotes } from '../lib/api'
import { addLecture, deleteLecture, useLecture } from '../lib/lectures'
import { NOTES, makeLecture } from '../test/fixtures'

vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal()), generateNotes: vi.fn() }))

// Renders NotesView against the live lecture store, like LectureDetailPage does.
function Harness({ id, onJump = () => {} }) {
  const lecture = useLecture(id)
  return lecture ? <NotesView lecture={lecture} onJump={onJump} /> : null
}

function setup(overrides) {
  const lecture = makeLecture(overrides)
  addLecture(lecture)
  return lecture
}

describe('NotesView', () => {
  beforeEach(() => {
    generateNotes.mockReset()
  })

  it('generates notes, shows a loading state, and saves the result', async () => {
    const lecture = setup()
    let resolve
    generateNotes.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<Harness id={lecture.id} />)

    fireEvent.click(screen.getByRole('button', { name: /generate notes/i }))

    expect(await screen.findByText(/Generating notes/)).toBeTruthy()
    expect(generateNotes).toHaveBeenCalledWith(expect.objectContaining({ id: lecture.id, segments: lecture.segments }), expect.anything())

    resolve(NOTES)

    expect(await screen.findByText(NOTES.summary)).toBeTruthy()
    expect(screen.getByText('Supervised learning')).toBeTruthy()
    expect(screen.getAllByText('Gradient descent')).toHaveLength(2) // topic + concept
    expect(screen.getByText('Labeled data drives supervised learning.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /download \.md/i })).toBeTruthy()

    const saved = JSON.parse(localStorage.getItem('studykit.lectures.v1'))
    expect(saved[0].notes).toEqual(NOTES)
    deleteLecture(lecture.id)
  })

  it('shows the backend error and lets the user retry', async () => {
    const lecture = setup()
    const error = Object.assign(new AxiosError('fail'), {
      response: { status: 503, data: { detail: "AI notes aren't configured. Add GEMINI_API_KEY to backend/.env." } },
    })
    generateNotes.mockRejectedValueOnce(error).mockResolvedValueOnce(NOTES)
    render(<Harness id={lecture.id} />)

    fireEvent.click(screen.getByRole('button', { name: /generate notes/i }))
    expect(await screen.findByText(/Add GEMINI_API_KEY to backend\/\.env/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(NOTES.summary)).toBeTruthy()
    expect(screen.queryByText(/Couldn't generate notes/)).toBeNull()
    deleteLecture(lecture.id)
  })

  it('jumps to the cited transcript range when a timestamp is clicked', () => {
    const lecture = setup({ notes: NOTES })
    const onJump = vi.fn()
    render(<Harness id={lecture.id} onJump={onJump} />)

    fireEvent.click(screen.getAllByRole('button', { name: '0:03–0:07' })[0])
    expect(onJump).toHaveBeenCalledWith({ start: 3.08, end: 7.88 })
    deleteLecture(lecture.id)
  })

  it('disables generation when the transcript is empty', () => {
    const lecture = setup({ segments: [], transcript: '' })
    render(<Harness id={lecture.id} />)
    expect(screen.getByRole('button', { name: /generate notes/i }).disabled).toBe(true)
    deleteLecture(lecture.id)
  })
})
