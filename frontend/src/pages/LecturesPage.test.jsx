import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LecturesPage from './LecturesPage'
import { deleteLectureIndex } from '../lib/api'
import { addLecture, deleteLecture, getLecture } from '../lib/lectures'
import { NOTES, QUIZ, makeLecture } from '../test/fixtures'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteLectureIndex: vi.fn(() => Promise.resolve()),
}))

let lectures = []

function setup(...overrides) {
  lectures = overrides.map((o) => makeLecture(o))
  lectures.forEach(addLecture)
  render(
    <MemoryRouter>
      <LecturesPage />
    </MemoryRouter>,
  )
}

const titles = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('LecturesPage', () => {
  beforeEach(() => deleteLectureIndex.mockClear())
  afterEach(() => lectures.forEach((l) => deleteLecture(l.id)))

  it('shows an empty state with a call to action', () => {
    setup()
    expect(screen.getByText('Your library is empty')).toBeTruthy()
    expect(screen.getByRole('link', { name: /upload your first lecture/i }).getAttribute('href')).toBe('/upload')
  })

  it('shows date, duration, language, materials, quiz score, and open action on each card', () => {
    setup({ title: 'Neural nets', duration: 125, notes: NOTES, quiz: QUIZ, quizAttempts: [{ percent: 80 }] })
    const card = screen.getByRole('heading', { name: 'Neural nets' }).closest('article')
    const text = card.textContent
    expect(text).toContain('2 min 5 s')
    expect(text).toContain('English')
    expect(text).toContain('2026')
    expect(text).toContain('80%')

    const materials = within(card).getByRole('list', { name: /available study materials/i })
    const links = within(materials).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Notes', 'Quiz'])
    expect(links[0].getAttribute('href')).toBe(`/lectures/${lectures[0].id}?tab=notes`)
    expect(within(card).getByRole('link', { name: /open lecture/i }).getAttribute('href')).toBe(`/lectures/${lectures[0].id}`)
  })

  it('says so when a lecture has no materials or quiz attempts', () => {
    setup({ title: 'Plain' })
    expect(screen.getByText('No study materials yet')).toBeTruthy()
    expect(screen.getByText('No quiz attempts yet')).toBeTruthy()
  })

  it('searches titles and transcripts, and offers to clear an empty result', () => {
    setup({ title: 'Alpha', transcript: 'neurons and weights' }, { title: 'Beta', transcript: 'the french revolution' })

    fireEvent.change(screen.getByRole('searchbox', { name: /search lectures/i }), { target: { value: 'FRENCH' } })
    expect(titles()).toEqual(['Beta'])
    expect(screen.getByText(/1 of 2 lectures match/)).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: /search lectures/i }), { target: { value: 'zzz' } })
    expect(screen.getByText('No lectures match your search')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /clear search/i })[1])
    expect(titles()).toHaveLength(2)
  })

  it('sorts, switches to list view, and remembers both', () => {
    setup(
      { title: 'Beta', createdAt: '2026-01-02T00:00:00Z' },
      { title: 'Alpha', createdAt: '2026-01-01T00:00:00Z' },
    )
    expect(titles()).toEqual(['Beta', 'Alpha'])

    fireEvent.change(screen.getByRole('combobox', { name: /sort lectures/i }), { target: { value: 'title' } })
    expect(titles()).toEqual(['Alpha', 'Beta'])
    expect(localStorage.getItem('studykit.lectures.sort')).toBe('title')

    expect(screen.getByRole('link', { name: /add a lecture/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.queryByRole('link', { name: /add a lecture/i })).toBeNull()
    expect(titles()).toEqual(['Alpha', 'Beta'])
    expect(localStorage.getItem('studykit.lectures.view')).toBe('list')
  })

  it('deletes only after confirmation and also clears the search index', () => {
    setup({ title: 'Keep me' }, { title: 'Delete me' })
    const [keep, remove] = lectures

    fireEvent.click(screen.getByRole('button', { name: 'Delete Delete me' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Delete “Delete me”?')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(getLecture(remove.id)).toBeTruthy()
    expect(deleteLectureIndex).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Delete me' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete lecture/i }))
    expect(getLecture(remove.id)).toBeUndefined()
    expect(getLecture(keep.id)).toBeTruthy()
    expect(deleteLectureIndex).toHaveBeenCalledWith(remove.id)
    expect(titles()).toEqual(['Keep me'])
  })
})
