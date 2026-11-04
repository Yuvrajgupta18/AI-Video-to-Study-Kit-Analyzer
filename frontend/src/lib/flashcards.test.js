import { describe, expect, it } from 'vitest'
import {
  buildDeck,
  countProgress,
  flashcardsToCSV,
  flashcardsToJSON,
  resetProgress,
  setCardStatus,
  shuffled,
} from './flashcards'
import { addLecture, deleteLecture } from './lectures'
import { FLASHCARDS, makeLecture } from '../test/fixtures'

const { cards } = FLASHCARDS
const ids = (deck) => deck.map((card) => card.id)
const ALL = { order: null, difficulty: 'all', status: 'all' }

describe('buildDeck', () => {
  it('keeps the original order by default', () => {
    expect(ids(buildDeck(cards, ALL))).toEqual(['card-1', 'card-2', 'card-3'])
  })

  it('filters by difficulty and revision status', () => {
    const progress = { 'card-1': 'known', 'card-3': 'review' }
    expect(ids(buildDeck(cards, { ...ALL, difficulty: 'medium' }, progress))).toEqual(['card-2'])
    expect(ids(buildDeck(cards, { ...ALL, status: 'review' }, progress))).toEqual(['card-3'])
    expect(ids(buildDeck(cards, { ...ALL, status: 'unmarked' }, progress))).toEqual(['card-2'])
    expect(ids(buildDeck(cards, { ...ALL, status: 'known', difficulty: 'hard' }, progress))).toEqual([])
  })

  it('follows a shuffled order and ignores unknown ids', () => {
    expect(ids(buildDeck(cards, { ...ALL, order: ['card-3', 'gone', 'card-1', 'card-2'] }))).toEqual(['card-3', 'card-1', 'card-2'])
  })
})

describe('shuffled', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffled(input, () => 0)
    expect(output).toEqual([2, 3, 4, 5, 1])
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect([...shuffled(input)].sort()).toEqual(input)
  })
})

describe('countProgress', () => {
  it('counts known, needs revision, and unmarked cards', () => {
    expect(countProgress(cards, { 'card-1': 'known', 'card-2': 'review' })).toEqual({ known: 1, review: 1, unmarked: 1 })
  })
})

describe('exports', () => {
  const progress = { 'card-1': 'known', 'card-3': 'review' }

  it('writes CSV with a header, escaped fields, formula protection, and status labels', () => {
    const csv = flashcardsToCSV(FLASHCARDS, progress)
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('question,answer,difficulty,topic,sources,status')
    expect(lines[1]).toBe('What is supervised learning?,Learning from labeled examples.,easy,Supervised learning,0:03–0:07,known')
    expect(lines[2]).toBe('What does gradient descent minimize?,A loss function.,medium,Optimization,0:07–0:13,')
    expect(lines[3]).toBe(
      '"Why do models need labeled data, ""in general""?","\'=Labels provide the target, so the model can learn, check, and correct.",hard,Supervised learning,0:05–0:07,needs revision',
    )
  })

  it('writes JSON with lecture details, sources, and status', () => {
    const data = JSON.parse(flashcardsToJSON(makeLecture(), FLASHCARDS, progress))
    expect(data).toMatchObject({ lecture: 'ML Basics', model: 'gemini-3.6-flash', generated_at: FLASHCARDS.generated_at })
    expect(data.cards).toHaveLength(3)
    expect(data.cards[0]).toEqual({
      question: 'What is supervised learning?',
      answer: 'Learning from labeled examples.',
      difficulty: 'easy',
      topic: 'Supervised learning',
      sources: [{ start: 3.08, end: 7.88 }],
      status: 'known',
    })
    expect(data.cards[1].status).toBeNull()
  })
})

describe('progress persistence', () => {
  it('saves, clears, and resets card status on the right lecture', () => {
    const lecture = makeLecture({ flashcards: FLASHCARDS, flashcardProgress: {} })
    const other = makeLecture({ flashcards: FLASHCARDS, flashcardProgress: { 'card-1': 'review' } })
    addLecture(lecture)
    addLecture(other)
    const stored = (id) => JSON.parse(localStorage.getItem('studykit.lectures.v1')).find((l) => l.id === id)

    expect(setCardStatus(lecture, 'card-2', 'known')).toBe(true)
    expect(stored(lecture.id).flashcardProgress).toEqual({ 'card-2': 'known' })

    setCardStatus(stored(lecture.id), 'card-2', null)
    expect(stored(lecture.id).flashcardProgress).toEqual({})

    resetProgress(other)
    expect(stored(other.id).flashcardProgress).toEqual({})

    deleteLecture(lecture.id)
    deleteLecture(other.id)
  })
})
