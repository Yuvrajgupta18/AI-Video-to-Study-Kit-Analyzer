import { describe, expect, it } from 'vitest'
import { attemptStats, buildRecommendations, createAttempt, saveAttempt, scoreQuiz } from './quiz'
import { addLecture, deleteLecture } from './lectures'
import { FLASHCARDS, NOTES, QUIZ, makeLecture } from '../test/fixtures'

const ALL_CORRECT = { 'q-1': 1, 'q-2': 2, 'q-3': 0 }

describe('scoreQuiz', () => {
  it('scores a perfect attempt', () => {
    const score = scoreQuiz(QUIZ, ALL_CORRECT)
    expect(score).toMatchObject({ correct: 3, incorrect: 0, unanswered: 0, total: 3, percent: 100, weakTopics: [] })
  })

  it('counts wrong and unanswered questions as incorrect', () => {
    const score = scoreQuiz(QUIZ, { 'q-1': 0, 'q-2': 2 })
    expect(score).toMatchObject({ correct: 1, incorrect: 2, unanswered: 1, total: 3, percent: 33 })
    expect(score.results.map((r) => [r.selected, r.isCorrect])).toEqual([
      [0, false],
      [2, true],
      [null, false],
    ])
  })

  it('reports topic performance weakest first and flags weak topics', () => {
    const score = scoreQuiz(QUIZ, { 'q-1': 1, 'q-2': 0, 'q-3': 3 })
    expect(score.topics).toEqual([
      { topic: 'Optimization', correct: 0, total: 1, percent: 0 },
      { topic: 'Supervised learning', correct: 1, total: 2, percent: 50 },
    ])
    expect(score.weakTopics.map((t) => t.topic)).toEqual(['Optimization', 'Supervised learning'])
  })

  it('treats exactly 70% as not weak', () => {
    const quiz = {
      questions: Array.from({ length: 10 }, (_, i) => ({ ...QUIZ.questions[0], id: `x-${i}`, topic: 'T' })),
    }
    const answers = Object.fromEntries(quiz.questions.map((q, i) => [q.id, i < 7 ? 1 : 0]))
    expect(scoreQuiz(quiz, answers).weakTopics).toEqual([])
  })
})

describe('attempts', () => {
  it('creates an attempt record with score and topic results', () => {
    const attempt = createAttempt(QUIZ, { 'q-1': 1 }, new Date('2026-10-26T13:00:00Z'))
    expect(attempt).toMatchObject({
      id: `attempt-${Date.parse('2026-10-26T13:00:00Z')}`,
      quizId: QUIZ.generated_at,
      submittedAt: '2026-10-26T13:00:00.000Z',
      answers: { 'q-1': 1 },
      correct: 1,
      total: 3,
      percent: 33,
    })
    expect(attempt.topics).toHaveLength(2)
  })

  it('appends attempts to the right lecture in localStorage', () => {
    const lecture = makeLecture({ quiz: QUIZ, quizAttempts: [] })
    const other = makeLecture({ quiz: QUIZ, quizAttempts: [] })
    addLecture(lecture)
    addLecture(other)
    const stored = (id) => JSON.parse(localStorage.getItem('studykit.lectures.v1')).find((l) => l.id === id)

    const first = createAttempt(QUIZ, { 'q-1': 1 }, new Date(1))
    expect(saveAttempt(lecture, first)).toBe(true)
    const second = createAttempt(QUIZ, ALL_CORRECT, new Date(2))
    saveAttempt(stored(lecture.id), second)

    expect(stored(lecture.id).quizAttempts.map((a) => a.percent)).toEqual([33, 100])
    expect(stored(other.id).quizAttempts).toEqual([])
    deleteLecture(lecture.id)
    deleteLecture(other.id)
  })

  it('summarises attempts with change, best, and average', () => {
    expect(attemptStats([])).toBeNull()
    const attempts = [{ percent: 40 }, { percent: 80 }, { percent: 60 }]
    expect(attemptStats(attempts)).toMatchObject({ count: 3, best: 80, average: 60, change: -20, previous: { percent: 80 } })
    expect(attemptStats([{ percent: 50 }]).change).toBeNull()
  })
})

describe('buildRecommendations', () => {
  it('returns nothing for a perfect score', () => {
    expect(buildRecommendations(makeLecture(), QUIZ, ALL_CORRECT)).toEqual([])
  })

  it('builds a plan per missed topic, weakest first, with real source timestamps', () => {
    const lecture = makeLecture({ notes: NOTES, flashcards: FLASHCARDS })
    const recs = buildRecommendations(lecture, QUIZ, { 'q-1': 0, 'q-2': 0, 'q-3': 0 })

    expect(recs.map((r) => [r.topic, r.percent, r.priority])).toEqual([
      ['Optimization', 0, 'high'],
      ['Supervised learning', 50, 'medium'],
    ])
    const [optimization, supervised] = recs
    expect(optimization.missed.map((q) => q.id)).toEqual(['q-2'])
    expect(optimization.actions[0]).toEqual({
      type: 'rewatch',
      text: 'Rewatch 0:07–0:13 in the lecture, where this is explained.',
      sources: [{ start: 7.88, end: 13.44 }],
    })
    // "Gradient descent" concept matches words in the missed question.
    expect(optimization.actions.map((a) => a.text)).toContain('Review the definition of Gradient descent.')
    expect(optimization.actions.some((a) => a.text.includes('flashcard'))).toBe(true)

    expect(supervised.actions.map((a) => a.text)).toEqual(
      expect.arrayContaining([
        'Re-read “Supervised learning” in your notes.',
        'Practise the 2 flashcards on related topics and mark the ones you miss as Needs revision.',
        'You missed a basic recall question here, so start with the core definitions before moving on.',
      ]),
    )
  })

  it('suggests generating flashcards when the lecture has none, and an application tip for hard misses', () => {
    const recs = buildRecommendations(makeLecture(), QUIZ, { 'q-1': 1, 'q-2': 2, 'q-3': 1 })
    expect(recs).toHaveLength(1)
    const texts = recs[0].actions.map((a) => a.text)
    expect(texts).toContain('Generate flashcards for this lecture to drill these ideas with active recall.')
    expect(texts).toContain('You know the basics. Focus on applying the idea: explain why the correct answer follows from the lecture.')
    expect(texts.some((t) => t.includes('notes'))).toBe(false)
  })
})
