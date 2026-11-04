import { scoreQuiz, WEAK_TOPIC_THRESHOLD } from './quiz'

const GENERIC = [
  'What is this lecture about?',
  'What are the key terms the lecturer defines?',
  'What examples does the lecturer give?',
  'What should I remember most from this lecture?',
]

/**
 * Starter questions built locally from what the student already has: weak quiz
 * topics first, then flashcards marked for revision, notes concepts and sections.
 */
export function suggestedQuestions(lecture, limit = 4) {
  const suggestions = []

  const latest = lecture.quizAttempts?.at(-1)
  if (latest && lecture.quiz && latest.quizId === lecture.quiz.generated_at) {
    scoreQuiz(lecture.quiz, latest.answers)
      .topics.filter((t) => t.percent < WEAK_TOPIC_THRESHOLD)
      .forEach((t) => suggestions.push(`Can you explain ${t.topic} again?`))
  }

  const progress = lecture.flashcardProgress ?? {}
  ;(lecture.flashcards?.cards ?? [])
    .filter((card) => progress[card.id] === 'review')
    .forEach((card) => suggestions.push(card.question))

  ;(lecture.notes?.concepts ?? []).slice(0, 2).forEach((c) => suggestions.push(`What is ${c.term}?`))
  ;(lecture.notes?.sections ?? []).slice(0, 2).forEach((s) => suggestions.push(`What does the lecture say about ${s.title}?`))

  suggestions.push(...GENERIC)
  const seen = new Set()
  return suggestions.filter((q) => !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase())).slice(0, limit)
}
