import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { dismissToast, useToasts } from '../lib/toast'

const TONES = {
  success: { icon: CircleCheck, className: 'text-emerald-700' },
  error: { icon: CircleAlert, className: 'text-rose-700' },
  info: { icon: Info, className: 'text-accent-700' },
}

/** Bottom-right stack of short notifications, announced politely to screen readers. */
export default function Toaster() {
  const toasts = useToasts()
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
    >
      {toasts.map(({ id, title, description, tone }) => {
        const { icon: Icon, className } = TONES[tone]
        return (
          <div
            key={id}
            role="status"
            className="animate-toast-in pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-ink-200 bg-surface p-3.5 shadow-overlay"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-ink-900">{title}</p>
              {description && <p className="mt-0.5 truncate text-ink-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(id)}
              className="-m-1 flex size-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
