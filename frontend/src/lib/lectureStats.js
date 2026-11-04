import { WEAK_TOPIC_THRESHOLD } from './quiz'

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'longest', label: 'Longest first' },
  { id: 'score', label: 'Best quiz score' },
]

/** Which study materials exist for a lecture. */
export function lectureMaterials(lecture) {
  return {
    notes: Boolean(lecture.notes),
    flashcards: Boolean(lecture.flashcards),
    quiz: Boolean(lecture.quiz),
    chat: (lecture.chat?.length ?? 0) > 0,
  }
}

/** The score of the lecture's most recent quiz attempt, or null if it has none. */
export function latestScore(lecture) {
  return lecture.quizAttempts?.at(-1)?.percent ?? null
}

/** Dashboard figures, computed only from what is actually saved. */
export function libraryStats(lectures) {
  const scores = lectures.map(latestScore).filter((score) => score !== null)
  const notes = lectures.filter((l) => l.notes).length
  const decks = lectures.filter((l) => l.flashcards).length
  const quizzes = lectures.filter((l) => l.quiz).length

  let knownCards = 0
  let reviewCards = 0
  lectures.forEach((lecture) => {
    Object.values(lecture.flashcardProgress ?? {}).forEach((status) => {
      if (status === 'known') knownCards += 1
      if (status === 'review') reviewCards += 1
    })
  })

  const weakTopics = lectures
    .flatMap((lecture) =>
      (lecture.quizAttempts?.at(-1)?.topics ?? [])
        .filter((topic) => topic.percent < WEAK_TOPIC_THRESHOLD)
        .map((topic) => ({ topic: topic.topic, percent: topic.percent, lectureId: lecture.id, lectureTitle: lecture.title })),
    )
    .sort((a, b) => a.percent - b.percent)

  return {
    lectureCount: lectures.length,
    totalSeconds: lectures.reduce((sum, l) => sum + (l.duration || 0), 0),
    notes,
    decks,
    quizzes,
    materialCount: notes + decks + quizzes,
    attemptCount: lectures.reduce((sum, l) => sum + (l.quizAttempts?.length ?? 0), 0),
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    knownCards,
    reviewCards,
    weakTopics,
  }
}

const SORTERS = {
  newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  oldest: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  title: (a, b) => a.title.localeCompare(b.title),
  longest: (a, b) => (b.duration || 0) - (a.duration || 0),
  // Lectures without a score go last.
  score: (a, b) => (latestScore(b) ?? -1) - (latestScore(a) ?? -1),
}

export function sortLectures(lectures, sortId) {
  return [...lectures].sort(SORTERS[sortId] ?? SORTERS.newest)
}
