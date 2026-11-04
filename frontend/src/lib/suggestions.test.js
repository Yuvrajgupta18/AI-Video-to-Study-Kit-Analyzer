import { describe, expect, it } from 'vitest'
import { suggestedQuestions } from './suggestions'
import { FLASHCARDS, NOTES, QUIZ, makeLecture } from '../test/fixtures'

describe('suggestedQuestions', () => {
  it('falls back to general questions', () => {
    expect(suggestedQuestions(makeLecture())).toEqual([
      'What is this lecture about?',
      'What are the key terms the lecturer defines?',
      'What examples does the lecturer give?',
      'What should I remember most from this lecture?',
    ])
  })

  it('prioritises weak quiz topics and flashcards marked for revision', () => {
    const lecture = makeLecture({
      notes: NOTES,
      flashcards: FLASHCARDS,
      flashcardProgress: { 'card-2': 'review' },
      quiz: QUIZ,
      quizAttempts: [{ quizId: QUIZ.generated_at, answers: { 'q-1': 1, 'q-2': 0, 'q-3': 1 } }], // Optimization 0%, Supervised 50%
    })
    expect(suggestedQuestions(lecture, 5)).toEqual([
      'Can you explain Optimization again?',
      'Can you explain Supervised learning again?',
      'What does gradient descent minimize?',
      'What is Gradient descent?',
      'What does the lecture say about Supervised learning?',
    ])
  })
})
