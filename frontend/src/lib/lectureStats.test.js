import { describe, expect, it } from 'vitest'
import { latestScore, lectureMaterials, libraryStats, sortLectures } from './lectureStats'
import { FLASHCARDS, NOTES, QUIZ, makeLecture } from '../test/fixtures'

const attempt = (percent, topics = []) => ({ percent, topics })

describe('libraryStats', () => {
  it('reports zeros and no average for an empty library', () => {
    expect(libraryStats([])).toMatchObject({
      lectureCount: 0,
      totalSeconds: 0,
      materialCount: 0,
      attemptCount: 0,
      averageScore: null,
      knownCards: 0,
      reviewCards: 0,
      weakTopics: [],
    })
  })

  it('derives every figure from saved lecture data', () => {
    const stats = libraryStats([
      makeLecture({
        duration: 100,
        notes: NOTES,
        flashcards: FLASHCARDS,
        flashcardProgress: { 'card-1': 'known', 'card-2': 'review' },
        quiz: QUIZ,
        quizAttempts: [attempt(20), attempt(80, [{ topic: 'Backprop', percent: 50 }, { topic: 'Loss', percent: 100 }])],
      }),
      makeLecture({ title: 'Second', duration: 50, quiz: QUIZ, quizAttempts: [attempt(61, [{ topic: 'Sigmoid', percent: 0 }])] }),
      makeLecture({ duration: 25 }),
    ])

    expect(stats).toMatchObject({
      lectureCount: 3,
      totalSeconds: 175,
      notes: 1,
      decks: 1,
      quizzes: 2,
      materialCount: 4,
      attemptCount: 3,
      averageScore: 71, // latest attempt per lecture: (80 + 61) / 2, rounded
      knownCards: 1,
      reviewCards: 1,
    })
    // Weakest first, from each lecture's latest attempt only.
    expect(stats.weakTopics.map((t) => [t.topic, t.percent])).toEqual([
      ['Sigmoid', 0],
      ['Backprop', 50],
    ])
  })
})

describe('lectureMaterials and latestScore', () => {
  it('reports what a lecture actually has', () => {
    expect(lectureMaterials(makeLecture())).toEqual({ notes: false, flashcards: false, quiz: false, chat: false })
    expect(lectureMaterials(makeLecture({ notes: NOTES, chat: [{ id: '1' }] }))).toMatchObject({ notes: true, chat: true, quiz: false })
    expect(latestScore(makeLecture())).toBeNull()
    expect(latestScore(makeLecture({ quizAttempts: [attempt(10), attempt(0)] }))).toBe(0)
  })
})

describe('sortLectures', () => {
  const lectures = [
    makeLecture({ title: 'Beta', createdAt: '2026-01-02T00:00:00Z', duration: 10, quizAttempts: [attempt(50)] }),
    makeLecture({ title: 'Alpha', createdAt: '2026-01-03T00:00:00Z', duration: 5 }),
    makeLecture({ title: 'Gamma', createdAt: '2026-01-01T00:00:00Z', duration: 20, quizAttempts: [attempt(90)] }),
  ]
  const titles = (sort) => sortLectures(lectures, sort).map((l) => l.title)

  it('sorts by each option without mutating the input', () => {
    expect(titles('newest')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(titles('oldest')).toEqual(['Gamma', 'Beta', 'Alpha'])
    expect(titles('title')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(titles('longest')).toEqual(['Gamma', 'Beta', 'Alpha'])
    expect(titles('score')).toEqual(['Gamma', 'Beta', 'Alpha']) // no score goes last
    expect(lectures[0].title).toBe('Beta')
  })
})
