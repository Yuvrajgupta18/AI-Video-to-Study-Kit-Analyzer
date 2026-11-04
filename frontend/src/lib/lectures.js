import { useSyncExternalStore } from 'react'
import { isVideoFile, stripExtension } from './files'

// Lectures are kept in the browser (localStorage) until the backend has a
// database. Each entry stores the full transcript returned by /transcribe.
const STORAGE_KEY = 'studykit.lectures.v1'
const listeners = new Set()

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let lectures = load()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lectures))
    return true
  } catch {
    // Quota exceeded or storage blocked: the lecture stays available until reload.
    return false
  }
}

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Keep multiple open tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      lectures = load()
      emit()
    }
  })
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createLecture(file, result) {
  const segments = Array.isArray(result?.segments) ? result.segments : []
  const transcript = result?.transcript ?? segments.map((s) => s.text).join(' ')
  return {
    id: createId(),
    title: stripExtension(file.name),
    fileName: file.name,
    fileSize: file.size,
    mediaType: isVideoFile(file.name) ? 'video' : 'audio',
    language: result?.language ?? null,
    segments,
    transcript,
    duration: segments.length ? segments[segments.length - 1].end : 0,
    wordCount: transcript.trim() ? transcript.trim().split(/\s+/).length : 0,
    createdAt: new Date().toISOString(),
  }
}

/** Adds a lecture. Returns false if it could not be saved to browser storage. */
export function addLecture(lecture) {
  lectures = [lecture, ...lectures]
  const saved = persist()
  emit()
  return saved
}

/** Merges `changes` into a lecture. Returns false if it could not be saved to browser storage. */
export function updateLecture(id, changes) {
  if (!lectures.some((lecture) => lecture.id === id)) return true
  lectures = lectures.map((lecture) => (lecture.id === id ? { ...lecture, ...changes } : lecture))
  const saved = persist()
  emit()
  return saved
}

export function deleteLecture(id) {
  lectures = lectures.filter((lecture) => lecture.id !== id)
  persist()
  emit()
}

/** Current snapshot of a lecture (outside React). */
export function getLecture(id) {
  return lectures.find((lecture) => lecture.id === id)
}

export function useLectures() {
  return useSyncExternalStore(subscribe, () => lectures)
}

export function useLecture(id) {
  return useLectures().find((lecture) => lecture.id === id)
}
