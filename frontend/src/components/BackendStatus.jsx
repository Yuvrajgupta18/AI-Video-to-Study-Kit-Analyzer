import { useEffect, useState } from 'react'
import { checkHealth } from '../lib/api'

const POLL_INTERVAL_MS = 30_000

const STATES = {
  checking: { dot: 'bg-ink-400 animate-pulse', label: 'Checking backend…' },
  online: { dot: 'bg-emerald-500', label: 'Backend online' },
  offline: { dot: 'bg-rose-500', label: 'Backend offline' },
}

export default function BackendStatus({ collapsed = false }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    const controller = new AbortController()
    const run = () =>
      checkHealth(controller.signal)
        .then((ok) => setStatus(ok ? 'online' : 'offline'))
        .catch(() => !controller.signal.aborted && setStatus('offline'))

    run()
    const id = setInterval(run, POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [])

  const { dot, label } = STATES[status]
  return (
    <div
      className={`flex h-8 items-center gap-2.5 text-xs text-ink-500 ${collapsed ? 'justify-center' : 'px-2.5'}`}
      title={status === 'offline' ? 'Start the FastAPI server: uvicorn app.main:app --reload' : label}
    >
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : ''}>{label}</span>
    </div>
  )
}
