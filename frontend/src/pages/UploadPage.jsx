import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  CloudUpload,
  FileAudio,
  FileText,
  FileVideo,
  Layers,
  ListChecks,
  LoaderCircle,
  MessagesSquare,
  NotebookPen,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Alert, Badge, Button, ButtonLink, Card, IconButton, IconTile, PageHeader, ProgressBar, SectionHeading } from '../components/ui'
import { useTranscription } from '../context/transcription-context'
import { ACCEPT_ATTRIBUTE, MAX_FILE_SIZE_MB, SUPPORTED_EXTENSIONS, isVideoFile, validateFile } from '../lib/files'
import { formatBytes, formatTimestamp } from '../lib/format'
import { useElapsed } from '../lib/useElapsed'

const STEPS = ['Choose file', 'Upload', 'Transcribe', 'Ready']

const WHAT_YOU_GET = [
  { icon: FileText, label: 'Timestamped transcript', text: 'Searchable, with a time for every segment' },
  { icon: NotebookPen, label: 'Study notes', text: 'Summary, topics, concepts, and takeaways' },
  { icon: Layers, label: 'Flashcards', text: 'Flip, shuffle, and track what you know' },
  { icon: ListChecks, label: 'Practice quizzes', text: 'Scores, weak topics, and a revision plan' },
  { icon: MessagesSquare, label: 'Ask AI', text: 'Answers grounded in your lecture, with citations' },
]

const TIPS = [
  'Clear audio with little background noise gives the best transcript.',
  'Audio-only files (MP3, M4A) upload faster than video.',
  "Transcription runs on your computer's CPU, so a one-hour lecture can take several minutes.",
  'The first transcription downloads the Whisper model, which adds extra time.',
]

/** Where the upload is in its journey. `current` is the index of the active step. */
function Stepper({ current, failed = false }) {
  return (
    <ol className="mb-5 flex items-center gap-2" aria-label="Upload progress steps">
      {STEPS.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-200 ${
                failed && active
                  ? 'bg-rose-600 text-white'
                  : done
                    ? 'bg-primary text-white'
                    : active
                      ? 'bg-accent-100 text-accent-700 ring-2 ring-accent-400'
                      : 'bg-ink-100 text-ink-500'
              }`}
            >
              {done ? <Check className="size-3" aria-hidden="true" /> : index + 1}
            </span>
            <span className={`hidden truncate text-xs font-medium sm:block ${active || done ? 'text-ink-900' : 'text-ink-500'}`}>{step}</span>
            {index < STEPS.length - 1 && <span className={`h-px min-w-3 flex-1 ${done ? 'bg-primary' : 'bg-ink-200'}`} aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

function FileSummary({ file, onRemove }) {
  const video = isVideoFile(file.name)
  return (
    <div className="animate-fade-in flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3">
      <IconTile icon={video ? FileVideo : FileAudio} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{file.name}</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {video ? 'Video' : 'Audio'} · {formatBytes(file.size)}
        </p>
      </div>
      {onRemove && <IconButton icon={X} label="Remove file" onClick={onRemove} />}
    </div>
  )
}

function Dropzone({ onFile }) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={handleDrop}
      className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-200 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent-500 sm:min-h-80 ${
        dragging ? 'border-accent-500 bg-accent-50' : 'border-ink-300 bg-ink-50 hover:border-accent-300 hover:bg-accent-50'
      }`}
    >
      <span
        className={`flex size-12 items-center justify-center rounded-xl border border-ink-200 bg-surface text-accent-500 shadow-card transition-transform duration-200 ${
          dragging ? '-translate-y-1' : 'group-hover:-translate-y-0.5'
        }`}
      >
        <CloudUpload className="size-6" aria-hidden="true" />
      </span>
      <span className="mt-4 text-base font-semibold text-ink-900">{dragging ? 'Drop to add your lecture' : 'Drag and drop your lecture here'}</span>
      <span className="mt-1 text-sm text-ink-500">
        or <span className="font-medium text-accent-700 underline-offset-2 group-hover:underline">browse files</span> from your device
      </span>
      <input
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label="Lecture file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = ''
        }}
      />
      <span className="mt-5 flex flex-wrap justify-center gap-1.5">
        {SUPPORTED_EXTENSIONS.map((ext) => (
          <Badge key={ext}>{ext.slice(1).toUpperCase()}</Badge>
        ))}
        <Badge>Up to {MAX_FILE_SIZE_MB} MB</Badge>
      </span>
    </label>
  )
}

function ProgressPanel({ job, onCancel }) {
  const uploading = job.status === 'uploading'
  const elapsed = useElapsed(job.transcribingSince)

  return (
    <div className="space-y-5" aria-live="polite">
      <Stepper current={uploading ? 1 : 2} />
      <FileSummary file={job.file} />

      <div className="rounded-xl border border-ink-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
            <LoaderCircle className="size-4 animate-spin text-accent-500" aria-hidden="true" />
            {uploading ? 'Uploading file' : 'Extracting audio and transcribing'}
          </p>
          <p className="text-sm font-medium text-ink-500 tabular-nums">{uploading ? `${job.progress ?? 0}%` : formatTimestamp(elapsed)}</p>
        </div>
        {uploading ? (
          <ProgressBar value={job.progress ?? 0} label="Upload progress" className="mt-3" />
        ) : (
          <ProgressBar indeterminate label="Transcribing" className="mt-3" />
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          {uploading ? 'Sending your recording to the transcription server.' : 'CPU transcription often takes a while for long lectures.'}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-500">You can switch to other pages while this runs. Keep this tab open.</p>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const { job, isBusy, start, cancel, reset } = useTranscription()
  const [file, setFile] = useState(null)
  const [validationError, setValidationError] = useState(null)
  const navigate = useNavigate()
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const selectFile = (candidate) => {
    const error = validateFile(candidate)
    setValidationError(error)
    setFile(error ? null : candidate)
  }

  const runTranscription = async (target) => {
    // The job (in context) owns the file from here on.
    setFile(null)
    const lectureId = await start(target)
    // Only jump to the result if the user is still on this page.
    if (lectureId && mounted.current) {
      reset()
      navigate(`/lectures/${lectureId}`)
    }
  }

  let content
  if (isBusy) {
    content = <ProgressPanel job={job} onCancel={cancel} />
  } else if (job.status === 'error') {
    content = (
      <div className="space-y-5">
        <Stepper current={2} failed />
        <FileSummary file={job.file} />
        <Alert icon={CircleAlert} title="Transcription failed">
          {job.error}
        </Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => runTranscription(job.file)}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="secondary" onClick={reset}>
            Choose a different file
          </Button>
        </div>
      </div>
    )
  } else if (job.status === 'success') {
    content = (
      <div className="space-y-5">
        <Stepper current={4} />
        <FileSummary file={job.file} />
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold">Transcript ready</p>
            <p className="mt-0.5">Open the lecture to read it and generate your study materials.</p>
          </div>
        </div>
        {job.storageWarning && (
          <Alert tone="amber" icon={TriangleAlert} title="Not saved to this browser">
            Browser storage is full or blocked, so this transcript will disappear when you reload the page.
          </Alert>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink to={`/lectures/${job.lectureId}`} onClick={reset}>
            View transcript
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
          <Button variant="secondary" onClick={reset}>
            Upload another lecture
          </Button>
        </div>
      </div>
    )
  } else {
    content = (
      <div className="space-y-5">
        <Stepper current={file ? 1 : 0} />
        {file ? <FileSummary file={file} onRemove={() => setFile(null)} /> : <Dropzone onFile={selectFile} />}
        {validationError && <Alert icon={CircleAlert}>{validationError}</Alert>}
        {file && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" onClick={() => runTranscription(file)}>
              Start transcription
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setFile(null)}>
              Choose a different file
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Upload Lecture" description="Add a recording and we'll generate a timestamped transcript with Whisper." />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="p-4 sm:p-6 lg:col-span-2">{content}</Card>

        <div className="flex flex-col gap-4 lg:gap-6">
          <Card className="p-4 sm:p-5">
            <SectionHeading>What you&apos;ll get</SectionHeading>
            <ul className="mt-3 space-y-3">
              {WHAT_YOU_GET.map(({ icon: Icon, label, text }) => (
                <li key={label} className="flex gap-2.5">
                  <Icon className="mt-0.5 size-4 shrink-0 text-accent-500" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{label}</p>
                    <p className="text-xs leading-relaxed text-ink-500">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4 sm:p-5">
            <SectionHeading>Tips for better results</SectionHeading>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-ink-500 marker:text-ink-300">
              {TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
