import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'studykit.theme'
const listeners = new Set()

function isDark() {
  return document.documentElement.classList.contains('dark')
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The first-paint theme is applied by the inline script in index.html. */
export function useIsDark() {
  return useSyncExternalStore(subscribe, isDark)
}

export function toggleTheme() {
  const dark = !isDark()
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1120' : '#f8fafc')
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  } catch {
    // Storage is unavailable: the choice lasts until the page reloads.
  }
  listeners.forEach((listener) => listener())
}
