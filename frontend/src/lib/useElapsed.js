import { useEffect, useState } from 'react'

/** Seconds elapsed since `since` (a ms timestamp), updated every second. */
export function useElapsed(since) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!since) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [since])

  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0
}
