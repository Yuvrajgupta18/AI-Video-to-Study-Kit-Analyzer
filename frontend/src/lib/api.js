import axios from 'axios'

// In development requests go through the Vite proxy (see vite.config.js).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
})

const BACKEND_DOWN_MESSAGE =
  "Couldn't reach the transcription server. Make sure the FastAPI backend is running on http://127.0.0.1:8000."

export async function transcribeFile(file, { onUploadProgress, signal } = {}) {
  const form = new FormData()
  form.append('file', file)
  // No timeout: CPU transcription of a long lecture can take many minutes.
  const { data } = await api.post('/transcribe', form, { onUploadProgress, signal, timeout: 0 })
  return data
}

export async function checkHealth(signal) {
  const { data } = await api.get('/health', { signal, timeout: 5000 })
  return data?.status === 'ok'
}

// Gemini can take a minute or more on long lectures (plus a fallback retry).
const AI_TIMEOUT_MS = 6 * 60 * 1000

/** Sends a lecture's transcript to an AI endpoint. The Gemini key never leaves the backend. */
async function postTranscript(path, lecture, signal, extra = {}) {
  const { data } = await api.post(
    path,
    { title: lecture.title, language: lecture.language, segments: lecture.segments, ...extra },
    { signal, timeout: AI_TIMEOUT_MS },
  )
  return data
}

export function generateNotes(lecture, { signal } = {}) {
  return postTranscript('/notes', lecture, signal)
}

export function generateFlashcards(lecture, { signal } = {}) {
  return postTranscript('/flashcards', lecture, signal)
}

export function generateQuiz(lecture, { signal, numQuestions = 10 } = {}) {
  return postTranscript('/quiz', lecture, signal, { num_questions: numQuestions })
}

// --- Lecture assistant (RAG) ------------------------------------------------------

const lecturePath = (lectureId) => `/lectures/${encodeURIComponent(lectureId)}`

export async function getIndexStatus(lectureId, transcriptHash, { signal } = {}) {
  const { data } = await api.get(`${lecturePath(lectureId)}/index`, {
    params: transcriptHash ? { transcript_hash: transcriptHash } : {},
    signal,
    timeout: 30_000,
  })
  return data
}

/** Builds the lecture's search index. The backend skips the work if the transcript hasn't changed. */
export async function indexLecture(lecture, { force = false, signal } = {}) {
  const { data } = await api.post(
    `${lecturePath(lecture.id)}/index`,
    { title: lecture.title, language: lecture.language, segments: lecture.segments, force },
    { signal, timeout: AI_TIMEOUT_MS },
  )
  return data
}

export async function askLecture(lecture, { question, history = [], signal } = {}) {
  const { data } = await api.post(
    `${lecturePath(lecture.id)}/ask`,
    { question, history, transcript_hash: lecture.ragIndex?.transcript_hash ?? null },
    { signal, timeout: AI_TIMEOUT_MS },
  )
  return data
}

export async function deleteLectureIndex(lectureId) {
  await api.delete(`${lecturePath(lectureId)}/index`, { timeout: 30_000 })
}

/**
 * Turns an Axios error into a message for the user.
 * `serverErrorHint` is appended to unexpected 500 errors (e.g. a likely cause).
 */
export function getErrorMessage(error, { serverErrorHint } = {}) {
  if (axios.isCancel(error)) return 'The request was cancelled.'

  if (error.response) {
    const { status, data } = error.response
    const detail = data?.detail
    if (typeof detail === 'string') return detail
    // FastAPI validation errors (422) return a list of issues.
    if (Array.isArray(detail)) return detail.map((issue) => issue.msg).join('; ')
    // The dev proxy answers 502/503/504 when the backend is offline.
    if (status >= 502 && status <= 504) return BACKEND_DOWN_MESSAGE
    // An unhandled exception in the backend (e.g. FFmpeg missing from PATH).
    if (status === 500) {
      const message = 'The server hit an unexpected error. Check the backend terminal for details.'
      return serverErrorHint ? `${message} ${serverErrorHint}` : message
    }
    return `The server responded with an unexpected error (HTTP ${status}).`
  }

  if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  if (error.request) return BACKEND_DOWN_MESSAGE
  return error.message || 'Something went wrong.'
}
