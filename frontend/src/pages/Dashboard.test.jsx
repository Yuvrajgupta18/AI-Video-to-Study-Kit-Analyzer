import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from './Dashboard'
import { addLecture, deleteLecture } from '../lib/lectures'
import { FLASHCARDS, NOTES, QUIZ, makeLecture } from '../test/fixtures'

let lectures = []

function setup(...overrides) {
  lectures = overrides.map((o) => makeLecture(o))
  lectures.forEach(addLecture)
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )
}

const stat = (label) => screen.getByText(label).closest('div').parentElement.textContent

describe('Dashboard', () => {
  afterEach(() => lectures.forEach((l) => deleteLecture(l.id)))

  it('guides new users and shows no invented numbers', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Welcome to StudyKit' })).toBeTruthy()
    expect(screen.getByText('Create your first study kit')).toBeTruthy()
    expect(screen.getByRole('link', { name: /upload your first lecture/i }).getAttribute('href')).toBe('/upload')

    expect(stat('Total lectures')).toContain('0')
    expect(stat('Total study time')).toContain('0 min')
    expect(stat('Study materials')).toContain('Nothing generated yet')
    expect(stat('Average quiz score')).toContain('–')
    expect(stat('Average quiz score')).toContain('No quizzes taken yet')
    expect(screen.queryByText('Recent lectures')).toBeNull()
  })

  it('derives its metrics from saved lectures', () => {
    setup(
      { title: 'Older', duration: 600, notes: NOTES, flashcards: FLASHCARDS, quiz: QUIZ, quizAttempts: [{ percent: 60, topics: [] }] },
      { title: 'Newest', duration: 300, notes: NOTES, quiz: QUIZ, quizAttempts: [{ percent: 40, topics: [] }, { percent: 80, topics: [] }] },
    )
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(stat('Total lectures')).toContain('2')
    expect(stat('Total study time')).toContain('15 min')
    expect(stat('Study materials')).toContain('5')
    expect(stat('Study materials')).toContain('2 note sets · 1 deck · 2 quizzes')
    expect(stat('Average quiz score')).toContain('70%') // latest per lecture: (60 + 80) / 2
    expect(stat('Average quiz score')).toContain('From 3 attempts')
  })

  it('links quick access to the most recent lecture, with its real status', () => {
    setup(
      { title: 'Older' },
      {
        title: 'Newest',
        notes: NOTES,
        flashcards: FLASHCARDS,
        flashcardProgress: { 'card-1': 'review' },
        quiz: QUIZ,
        quizAttempts: [{ percent: 80, topics: [] }],
        chat: [{ id: '1' }, { id: '2' }],
      },
    )
    const newest = lectures[1]
    expect(screen.getByText('Continue with Newest')).toBeTruthy()

    const expected = {
      Notes: ['notes', 'Ready to read'],
      Flashcards: ['flashcards', '3 cards · 1 to revise'],
      Quiz: ['quiz', 'Last score 80%'],
      'Ask AI': ['ask', '2 messages'],
    }
    const panel = screen.getByText('Quick access').closest('.rounded-2xl')
    Object.entries(expected).forEach(([label, [tab, status]]) => {
      const link = within(panel).getByRole('link', { name: new RegExp(`^${label}`) })
      expect(link.getAttribute('href')).toBe(`/lectures/${newest.id}?tab=${tab}`)
      expect(link.textContent).toContain(status)
    })
  })

  it('surfaces weak topics from the latest attempts, and says when there are none', () => {
    setup({ title: 'Weak', quiz: QUIZ, quizAttempts: [{ percent: 50, topics: [{ topic: 'Backprop', percent: 50 }] }] })
    const link = screen.getByRole('link', { name: /Backprop/ })
    expect(link.textContent).toContain('50%')
    expect(link.getAttribute('href')).toBe(`/lectures/${lectures[0].id}?tab=quiz`)
  })

  it('invites a first quiz when none has been taken', () => {
    setup({ title: 'Fresh' })
    expect(screen.getByText('Take a quiz and your weakest topics will appear here.')).toBeTruthy()
  })
})
