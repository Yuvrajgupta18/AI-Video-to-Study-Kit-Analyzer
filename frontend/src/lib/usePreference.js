import { useCallback, useState } from 'react'

/** A UI preference remembered in this browser. `allowed` guards against stale stored values. */
export function usePreference(key, fallback, allowed) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null && (!allowed || allowed.includes(stored)) ? stored : fallback
    } catch {
      return fallback
    }
  })

  const update = useCallback(
    (next) => {
      setValue(next)
      try {
        localStorage.setItem(key, next)
      } catch {
        // Storage is unavailable: the choice lasts until the page reloads.
      }
    },
    [key],
  )

  return [value, update]
}
