import { formatRange } from './notesMarkdown'
import { updateLecture } from './lectures'

export const DIFFICULTIES = ['easy', 'medium', 'hard']

// Revision progress is stored on the lecture as { [cardId]: 'known' | 'review' }.
export const STATUS_FILTERS = [
  { id: 'all', label: 'All cards' },
  { id: 'review', label: 'Needs revision' },
  { id: 'unmarked', label: 'Not yet marked' },
  { id: 'known', label: 'Known' },
]

const STATUS_LABELS = { known: 'known', review: 'needs revision' }

export function matchesStatus(status, filter) {
  if (filter === 'all') return true
  if (filter === 'unmarked') return !status
  return status === filter
}

/** Cards in study order (original or shuffled), filtered by difficulty and revision status. */
export function buildDeck(cards, { order, difficulty, status }, progress = {}) {
  const byId = new Map(cards.map((card) => [card.id, card]))
  return (order ?? cards.map((card) => card.id))
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((card) => difficulty === 'all' || card.difficulty === difficulty)
    .filter((card) => matchesStatus(progress[card.id], status))
}

/** Fisher–Yates shuffle that returns a new array. */
export function shuffled(items, random = Math.random) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function countProgress(cards, progress = {}) {
  const counts = { known: 0, review: 0, unmarked: 0 }
  cards.forEach((card) => {
    counts[progress[card.id] ?? 'unmarked'] += 1
  })
  return counts
}

/** Saves a card's revision status (or clears it with null). Returns false if browser storage failed. */
export function setCardStatus(lecture, cardId, status) {
  const progress = { ...lecture.flashcardProgress }
  if (status) progress[cardId] = status
  else delete progress[cardId]
  return updateLecture(lecture.id, { flashcardProgress: progress })
}

export function resetProgress(lecture) {
  return updateLecture(lecture.id, { flashcardProgress: {} })
}

export function flashcardsToJSON(lecture, flashcards, progress = {}) {
  const data = {
    lecture: lecture.title,
    model: flashcards.model,
    generated_at: flashcards.generated_at,
    cards: flashcards.cards.map((card) => ({
      question: card.question,
      answer: card.answer,
      difficulty: card.difficulty,
      topic: card.topic,
      sources: card.sources,
      status: progress[card.id] ?? null,
    })),
  }
  return JSON.stringify(data, null, 2)
}

function csvField(value) {
  let text = String(value ?? '')
  // Stop spreadsheet apps from treating text as a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function flashcardsToCSV(flashcards, progress = {}) {
  const header = ['question', 'answer', 'difficulty', 'topic', 'sources', 'status']
  const rows = flashcards.cards.map((card) => [
    card.question,
    card.answer,
    card.difficulty,
    card.topic,
    card.sources.map(formatRange).join('; '),
    STATUS_LABELS[progress[card.id]] ?? '',
  ])
  // The BOM makes Excel open the file as UTF-8.
  return '﻿' + [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')
}
