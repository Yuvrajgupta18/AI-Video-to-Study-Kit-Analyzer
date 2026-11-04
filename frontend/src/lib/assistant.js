import { useSyncExternalStore } from 'react'
import { askLecture, getErrorMessage, getIndexStatus, indexLecture } from './api'
import { getLecture, updateLecture } from './lectures'

/** Messages sent with a question so follow-ups ("what about it?") make sense. */
export const HISTORY_LIMIT = 6

// Per-lecture assistant state, outside React so indexing and pending answers
// survive tab switches:
//   index: { status: 'idle' | 'checking' | 'indexing' | 'ready' | 'error', error?, chunkCount? }
//   ask:   { status: 'idle' | 'loading' | 'error', error?, question?, history? }
let states = {}
const listeners = new Set()
const IDLE = { index: { status: 'idle' }, ask: { status: 'idle' } }

function patch(lectureId, changes) {
  states = { ...states, [lectureId]: { ...(states[lectureId] ?? IDLE), ...changes } }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAssistantState(lectureId) {
  return useSyncExternalStore(subscribe, () => states[lectureId] ?? IDLE)
}

export function getAssistantState(lectureId) {
  return states[lectureId] ?? IDLE
}

/**
 * Makes sure the backend has an up-to-date index for this lecture. Cheap when it
 * already does: a status check, or a POST the backend answers without re-embedding.
 * Returns true when the lecture is ready for questions.
 */
export async function ensureIndexed(lecture, { force = false } = {}) {
  const current = getAssistantState(lecture.id).index.status
  if (current === 'checking' || current === 'indexing') return false
  const savedHash = lecture.ragIndex?.transcript_hash

  try {
    if (!force && savedHash) {
      patch(lecture.id, { index: { status: 'checking' } })
      const status = await getIndexStatus(lecture.id, savedHash)
      if (status.indexed && status.up_to_date) {
        patch(lecture.id, { index: { status: 'ready', chunkCount: status.chunk_count } })
        return true
      }
    }
    patch(lecture.id, { index: { status: 'indexing' } })
    const result = await indexLecture(lecture, { force })
    updateLecture(lecture.id, {
      ragIndex: {
        transcript_hash: result.transcript_hash,
        chunk_count: result.chunk_count,
        embedding_model: result.embedding_model,
        indexed_at: result.indexed_at,
      },
    })
    patch(lecture.id, { index: { status: 'ready', chunkCount: result.chunk_count } })
    return true
  } catch (error) {
    patch(lecture.id, { index: { status: 'error', error: getErrorMessage(error) } })
    return false
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function appendMessage(lectureId, message) {
  const lecture = getLecture(lectureId)
  if (lecture) updateLecture(lectureId, { chat: [...(lecture.chat ?? []), message] })
}

async function requestAnswer(lectureId, question, history) {
  patch(lectureId, { ask: { status: 'loading', question, history } })
  try {
    let result
    try {
      result = await askLecture(getLecture(lectureId), { question, history })
    } catch (error) {
      // 409: the index is missing or stale (e.g. the vector database was reset). Rebuild once and retry.
      if (error.response?.status !== 409 || !(await ensureIndexed(getLecture(lectureId)))) throw error
      result = await askLecture(getLecture(lectureId), { question, history })
    }
    appendMessage(lectureId, {
      id: newId(),
      role: 'assistant',
      content: result.answer,
      answerable: result.answerable,
      citations: result.citations,
      model: result.model,
      createdAt: new Date().toISOString(),
    })
    patch(lectureId, { ask: { status: 'idle' } })
  } catch (error) {
    patch(lectureId, { ask: { status: 'error', error: getErrorMessage(error), question, history } })
  }
}

/** Saves the question to the chat, then asks the backend with recent history for context. */
export async function askQuestion(lectureId, question) {
  const text = question.trim()
  const lecture = getLecture(lectureId)
  if (!text || !lecture || getAssistantState(lectureId).ask.status === 'loading') return

  const history = (lecture.chat ?? []).slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content }))
  appendMessage(lectureId, { id: newId(), role: 'user', content: text, createdAt: new Date().toISOString() })
  await requestAnswer(lectureId, text, history)
}

/** Re-sends the last question that failed (it is already in the chat). */
export async function retryQuestion(lectureId) {
  const { ask } = getAssistantState(lectureId)
  if (ask.status === 'error') await requestAnswer(lectureId, ask.question, ask.history)
}

export function dismissAskError(lectureId) {
  patch(lectureId, { ask: { status: 'idle' } })
}

export function clearChat(lectureId) {
  updateLecture(lectureId, { chat: [] })
  patch(lectureId, { ask: { status: 'idle' } })
}
