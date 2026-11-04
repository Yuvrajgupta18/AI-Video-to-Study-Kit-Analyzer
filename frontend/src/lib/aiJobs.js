import { useSyncExternalStore } from 'react'
import axios from 'axios'
import { generateFlashcards, generateNotes, generateQuiz, getErrorMessage } from './api'
import { updateLecture } from './lectures'
import { toast } from './toast'

// What each AI feature requests and how its result is stored on the lecture.
const KINDS = {
  notes: {
    request: (lecture, options) => generateNotes(lecture, options),
    toChanges: (notes) => ({ notes }),
    doneTitle: 'Study notes are ready',
  },
  flashcards: {
    request: (lecture, options) => generateFlashcards(lecture, options),
    // A new deck starts with fresh revision progress.
    toChanges: (flashcards) => ({ flashcards, flashcardProgress: {} }),
    doneTitle: 'Flashcards are ready',
  },
  quiz: {
    request: (lecture, options) => generateQuiz(lecture, options),
    // Past attempts are kept so scores can be compared across quizzes.
    toChanges: (quiz) => ({ quiz }),
    doneTitle: 'Your quiz is ready',
  },
}

// In-flight AI generation keyed by `${kind}:${lectureId}`. It lives outside React
// so a request keeps running, and its result is saved, when the user switches tabs.
//   { status: 'loading', startedAt } | { status: 'error', error } | { status: 'done', storageWarning }
let jobs = {}
const listeners = new Set()
const controllers = new Map()

const keyFor = (kind, lectureId) => `${kind}:${lectureId}`

function setJob(key, job) {
  jobs = { ...jobs }
  if (job) jobs[key] = job
  else delete jobs[key]
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** `params` are passed to the request (e.g. { numQuestions } for a quiz). */
export async function startAiJob(kind, lecture, params = {}) {
  const key = keyFor(kind, lecture.id)
  if (jobs[key]?.status === 'loading') return
  const controller = new AbortController()
  controllers.set(key, controller)
  setJob(key, { status: 'loading', startedAt: Date.now() })

  try {
    const result = await KINDS[kind].request(lecture, { ...params, signal: controller.signal })
    const saved = updateLecture(lecture.id, KINDS[kind].toChanges(result))
    setJob(key, saved ? null : { status: 'done', storageWarning: true })
    toast({ title: KINDS[kind].doneTitle, description: lecture.title })
  } catch (error) {
    setJob(key, axios.isCancel(error) ? null : { status: 'error', error: getErrorMessage(error) })
  } finally {
    controllers.delete(key)
  }
}

export function cancelAiJob(kind, lectureId) {
  controllers.get(keyFor(kind, lectureId))?.abort()
}

export function dismissAiJob(kind, lectureId) {
  setJob(keyFor(kind, lectureId), null)
}

export function useAiJob(kind, lectureId) {
  return useSyncExternalStore(subscribe, () => jobs[keyFor(kind, lectureId)])
}
