import { useSyncExternalStore } from 'react'

const MAX_VISIBLE = 4
const DEFAULT_DURATION_MS = 4000

let toasts = []
let nextId = 1
const listeners = new Set()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function dismissToast(id) {
  toasts = toasts.filter((item) => item.id !== id)
  emit()
}

/** Shows a short notification. tone: success | error | info */
export function toast({ title, description, tone = 'success', duration = DEFAULT_DURATION_MS }) {
  const id = nextId++
  toasts = [...toasts, { id, title, description, tone }].slice(-MAX_VISIBLE)
  emit()
  setTimeout(() => dismissToast(id), duration)
  return id
}

export function useToasts() {
  return useSyncExternalStore(subscribe, () => toasts)
}
