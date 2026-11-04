import { CircleAlert, LoaderCircle, Sparkles, TriangleAlert } from 'lucide-react'
import { Alert, Button, IconTile, ProgressBar } from './ui'
import { formatTimestamp } from '../lib/format'
import { useElapsed } from '../lib/useElapsed'

/** Empty state with a Generate button for an AI feature. */
export function GenerateIntro({ icon, title, description, included, buttonLabel, onGenerate, hasTranscript }) {
  return (
    <div className="animate-fade-in flex flex-col items-center px-6 py-12 text-center sm:py-16">
      <IconTile icon={icon} size="lg" />
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">{description}</p>
      <ul className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {included.map(({ icon: ItemIcon, label }) => (
          <li key={label} className="flex items-center gap-2.5 rounded-xl border border-ink-200 px-3 py-2.5 text-sm text-ink-700">
            <ItemIcon className="size-4 shrink-0 text-accent-500" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
      <Button size="lg" className="mt-6" onClick={onGenerate} disabled={!hasTranscript}>
        <Sparkles className="size-4" aria-hidden="true" />
        {buttonLabel}
      </Button>
      <p className="mt-4 max-w-sm text-xs leading-relaxed text-ink-500">
        {hasTranscript
          ? "The transcript is sent to Google's Gemini API. AI output can contain mistakes, so check important details against the lecture."
          : 'This lecture has no transcript text, so there is nothing to generate from.'}
      </p>
    </div>
  )
}

/** Progress header (elapsed time + Cancel) shown above a skeleton while Gemini works. */
export function GeneratingPanel({ job, label, onCancel, children }) {
  const elapsed = useElapsed(job.startedAt)
  return (
    <div aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <LoaderCircle className="size-4 shrink-0 animate-spin text-accent-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 tabular-nums">
              {label} {formatTimestamp(elapsed)}
            </p>
            <p className="text-xs text-ink-500">Usually under a minute. Longer lectures take more time.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <ProgressBar indeterminate label={label} className="h-0.5 rounded-none" />
      <div className="p-5 sm:p-6" aria-hidden="true">
        {children}
      </div>
    </div>
  )
}

/** Error (with Try again) and storage-warning banners for an AI job. */
export function AiJobAlerts({
  job,
  errorTitle,
  what,
  storageMessage = 'Browser storage is full or blocked. Download them to keep a copy.',
  onRetry,
  onDismiss,
}) {
  return (
    <>
      {job?.status === 'error' && (
        <div className="p-4 pb-0 sm:px-5">
          <Alert icon={CircleAlert} title={errorTitle}>
            <p>{job.error}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={onRetry}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
            </div>
          </Alert>
        </div>
      )}
      {job?.storageWarning && (
        <div className="p-4 pb-0 sm:px-5">
          <Alert tone="amber" icon={TriangleAlert} title={`${what} not saved to this browser`}>
            {storageMessage}
          </Alert>
        </div>
      )}
    </>
  )
}
