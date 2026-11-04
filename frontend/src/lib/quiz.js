import { formatRange } from './notesMarkdown'
import { updateLecture } from './lectures'

export const QUESTION_COUNTS = [
  { count: 5, label: 'Quick check', minutes: 3 },
  { count: 10, label: 'Standard', minutes: 6 },
  { count: 20, label: 'Full review', minutes: 12 },
]

/** Topics scoring below this percentage are flagged as needing revision. */
export const WEAK_TOPIC_THRESHOLD = 70

const percentOf = (correct, total) => (total ? Math.round((correct / total) * 100) : 0)

/**
 * Scores answers ({ [questionId]: optionIndex }) locally. Unanswered questions
 * count as incorrect. Topics are sorted weakest first.
 */
export function scoreQuiz(quiz, answers = {}) {
  const results = quiz.questions.map((question) => {
    const selected = answers[question.id] ?? null
    return { question, selected, isCorrect: selected === question.correct_index }
  })
  const correct = results.filter((r) => r.isCorrect).length
  const total = results.length

  const byTopic = new Map()
  results.forEach(({ question, isCorrect }) => {
    const entry = byTopic.get(question.topic) ?? { topic: question.topic, correct: 0, total: 0 }
    entry.total += 1
    if (isCorrect) entry.correct += 1
    byTopic.set(question.topic, entry)
  })
  const topics = [...byTopic.values()]
    .map((t) => ({ ...t, percent: percentOf(t.correct, t.total) }))
    .sort((a, b) => a.percent - b.percent || b.total - a.total || a.topic.localeCompare(b.topic))

  return {
    results,
    correct,
    incorrect: total - correct,
    unanswered: results.filter((r) => r.selected === null).length,
    total,
    percent: percentOf(correct, total),
    topics,
    weakTopics: topics.filter((t) => t.percent < WEAK_TOPIC_THRESHOLD),
  }
}

export function createAttempt(quiz, answers, now = new Date()) {
  const score = scoreQuiz(quiz, answers)
  return {
    id: `attempt-${now.getTime()}`,
    quizId: quiz.generated_at,
    submittedAt: now.toISOString(),
    answers,
    correct: score.correct,
    total: score.total,
    percent: score.percent,
    topics: score.topics,
  }
}

/** Appends an attempt to the lecture's history. Returns false if browser storage failed. */
export function saveAttempt(lecture, attempt) {
  return updateLecture(lecture.id, { quizAttempts: [...(lecture.quizAttempts ?? []), attempt] })
}

/** Summary stats across a lecture's attempts (oldest first), plus the change since the previous attempt. */
export function attemptStats(attempts = []) {
  if (!attempts.length) return null
  const latest = attempts[attempts.length - 1]
  const previous = attempts.length > 1 ? attempts[attempts.length - 2] : null
  const percents = attempts.map((a) => a.percent)
  return {
    count: attempts.length,
    latest,
    previous,
    change: previous ? latest.percent - previous.percent : null,
    best: Math.max(...percents),
    average: Math.round(percents.reduce((sum, p) => sum + p, 0) / percents.length),
  }
}

// --- Revision recommendations (rule-based, no AI call) -----------------------

const STOPWORDS = new Set(['what', 'which', 'when', 'where', 'does', 'from', 'with', 'that', 'this', 'their', 'about', 'into', 'basics', 'general', 'overview', 'introduction'])

function keywords(text = '') {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
      .map((word) => word.replace(/(es|s)$/, '')),
  )
}

function related(a, b) {
  const words = keywords(b)
  return [...keywords(a)].some((word) => words.has(word))
}

function uniqueSources(sources) {
  const seen = new Map()
  sources.forEach((s) => seen.set(`${s.start}-${s.end}`, s))
  return [...seen.values()].sort((a, b) => a.start - b.start)
}

/**
 * Builds a study plan from the questions answered incorrectly. Uses only data
 * already in the browser: the quiz's source timestamps and explanations, plus
 * the lecture's notes and flashcards when they exist.
 */
export function buildRecommendations(lecture, quiz, answers) {
  const score = scoreQuiz(quiz, answers)
  const missed = score.results.filter((r) => !r.isCorrect)

  return score.topics
    .filter((topic) => missed.some((r) => r.question.topic === topic.topic))
    .map((topic) => {
      const missedHere = missed.filter((r) => r.question.topic === topic.topic)
      const questionText = missedHere.map((r) => r.question.question).join(' ')
      const sources = uniqueSources(missedHere.flatMap((r) => r.question.sources)).slice(0, 3)
      const sections = (lecture.notes?.sections ?? []).filter((s) => related(s.title, topic.topic))
      const concepts = (lecture.notes?.concepts ?? []).filter(
        (c) => related(c.term, topic.topic) || related(c.term, questionText),
      )
      const cards = (lecture.flashcards?.cards ?? []).filter((c) => related(c.topic, topic.topic))
      const missedEasy = missedHere.filter((r) => r.question.difficulty === 'easy').length
      const missedHard = missedHere.filter((r) => r.question.difficulty === 'hard').length

      const actions = [
        {
          type: 'rewatch',
          text: `Rewatch ${sources.map(formatRange).join(', ')} in the lecture, where this is explained.`,
          sources,
        },
      ]
      if (sections.length) {
        actions.push({ type: 'notes', text: `Re-read ${sections.map((s) => `“${s.title}”`).join(' and ')} in your notes.` })
      }
      if (concepts.length) {
        actions.push({
          type: 'notes',
          text: `Review the definition${concepts.length > 1 ? 's' : ''} of ${concepts.slice(0, 3).map((c) => c.term).join(', ')}.`,
        })
      }
      if (cards.length) {
        actions.push({
          type: 'flashcards',
          text: `Practise the ${cards.length} flashcard${cards.length > 1 ? 's' : ''} on related topics and mark the ones you miss as Needs revision.`,
        })
      } else if (!lecture.flashcards) {
        actions.push({ type: 'flashcards', text: 'Generate flashcards for this lecture to drill these ideas with active recall.' })
      }
      if (missedEasy > 0) {
        actions.push({ type: 'tip', text: 'You missed a basic recall question here, so start with the core definitions before moving on.' })
      } else if (missedHard === missedHere.length) {
        actions.push({ type: 'tip', text: 'You know the basics. Focus on applying the idea: explain why the correct answer follows from the lecture.' })
      }

      return {
        topic: topic.topic,
        correct: topic.correct,
        total: topic.total,
        percent: topic.percent,
        priority: topic.percent < 50 ? 'high' : 'medium',
        missed: missedHere.map((r) => r.question),
        actions,
      }
    })
}
