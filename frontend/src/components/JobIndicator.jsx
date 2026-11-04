import { Link } from 'react-router-dom'
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { useTranscription } from '../context/transcription-context'

const VIEWS = {
  success: { icon: CircleCheck, iconClass: 'text-emerald-700', title: () => 'Transcript ready' },
  error: { icon: CircleAlert, iconClass: 'text-rose-700', title: () => 'Transcription failed' },
  uploading: { icon: LoaderCircle, iconClass: 'animate-spin text-accent-500', title: (job) => `Uploading ${job.progress ?? 0}%` },
  transcribing: { icon: LoaderCircle, iconClass: 'animate-spin text-accent-500', title: () => 'Transcribing…' },
}

/** Compact status of the running transcription, shown in the sidebar. */
export default function JobIndicator({ collapsed = false, onNavigate }) {
  const { job, reset } = useTranscription()
  if (job.status === 'idle') return null

  const { icon: Icon, iconClass, title } = VIEWS[job.status]
  const heading = title(job)
  const fileName = job.file?.name
  const success = job.status === 'success'

  return (
    <Link
      to={success ? `/lectures/${job.lectureId}` : '/upload'}
      onClick={() => {
        if (success) reset()
        onNavigate?.()
      }}
      title={`${heading}: ${fileName}`}
      className={`animate-fade-in flex items-center gap-2.5 rounded-lg border border-ink-200 bg-surface text-xs shadow-card transition-colors duration-150 hover:bg-ink-50 ${
        collapsed ? 'size-10 justify-center self-center' : 'p-2.5'
      }`}
    >
      <Icon className={`size-4 shrink-0 ${iconClass}`} aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : 'min-w-0'}>
        <span className="block font-medium text-ink-900 tabular-nums">{heading}</span>
        <span className="block truncate text-ink-500">{fileName}</span>
      </span>
    </Link>
  )
}
