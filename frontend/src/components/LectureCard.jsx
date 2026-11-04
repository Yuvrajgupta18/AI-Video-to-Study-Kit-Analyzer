import { ArrowRight, ChevronRight, FileAudio, FileVideo, Layers, ListChecks, MessagesSquare, NotebookPen, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ButtonLink, IconButton, IconTile } from './ui'
import { formatDate, formatDuration, formatLanguage } from '../lib/format'
import { latestScore, lectureMaterials } from '../lib/lectureStats'

const MATERIALS = [
  { id: 'notes', tab: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'flashcards', tab: 'flashcards', label: 'Flashcards', icon: Layers },
  { id: 'quiz', tab: 'quiz', label: 'Quiz', icon: ListChecks },
  { id: 'chat', tab: 'ask', label: 'Chat', icon: MessagesSquare },
]

function mediaIcon(lecture) {
  return lecture.mediaType === 'video' ? FileVideo : FileAudio
}

function MetaLine({ lecture, className = '' }) {
  return (
    <p className={`truncate text-xs text-ink-500 ${className}`}>
      {formatDate(lecture.createdAt)} · {formatDuration(lecture.duration)} · {formatLanguage(lecture.language)}
    </p>
  )
}

/** Links to the study materials this lecture already has. */
export function MaterialChips({ lecture }) {
  const materials = lectureMaterials(lecture)
  const available = MATERIALS.filter(({ id }) => materials[id])
  if (available.length === 0) return <p className="text-xs text-ink-500">No study materials yet</p>
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Available study materials">
      {available.map(({ id, tab, label, icon: Icon }) => (
        <li key={id}>
          <Link
            to={`/lectures/${lecture.id}?tab=${tab}`}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-accent-50 px-1.5 text-xs font-medium text-accent-700 transition-colors duration-150 hover:bg-accent-100"
          >
            <Icon className="size-3" aria-hidden="true" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Latest quiz score as a small labelled meter. */
function QuizMeter({ lecture }) {
  const score = latestScore(lecture)
  if (score === null) return <p className="text-xs text-ink-500">No quiz attempts yet</p>
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-500">Latest quiz</span>
        <span className="font-semibold text-ink-900 tabular-nums">{score}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
        <div className={`h-full rounded-full ${score >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

/** Library grid card. */
export function LectureCard({ lecture, onDelete }) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-ink-200 bg-surface p-4 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-ink-300 hover:shadow-card-hover sm:p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={mediaIcon(lecture)} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-sm leading-snug font-semibold break-words text-ink-900">
            <Link to={`/lectures/${lecture.id}`} className="rounded transition-colors duration-150 hover:text-accent-700">
              {lecture.title}
            </Link>
          </h2>
          <MetaLine lecture={lecture} className="mt-1" />
        </div>
        <IconButton icon={Trash2} label={`Delete ${lecture.title}`} tone="danger" className="-mt-1 -mr-1" onClick={() => onDelete(lecture)} />
      </div>

      <div className="mt-4">
        <MaterialChips lecture={lecture} />
      </div>
      <div className="mt-4 flex-1 border-t border-ink-100 pt-3">
        <QuizMeter lecture={lecture} />
      </div>

      <ButtonLink to={`/lectures/${lecture.id}`} variant="secondary" size="sm" className="mt-4 w-full">
        Open Lecture
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </ButtonLink>
    </article>
  )
}

/** Library list row. */
export function LectureListRow({ lecture, onDelete }) {
  return (
    <article className="flex flex-col gap-3 p-4 transition-colors duration-150 hover:bg-ink-50 sm:px-5 lg:flex-row lg:items-center lg:gap-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <IconTile icon={mediaIcon(lecture)} size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink-900">
            <Link to={`/lectures/${lecture.id}`} className="rounded transition-colors duration-150 hover:text-accent-700">
              {lecture.title}
            </Link>
          </h2>
          <MetaLine lecture={lecture} className="mt-0.5" />
        </div>
      </div>
      <div className="lg:w-72 lg:shrink-0">
        <MaterialChips lecture={lecture} />
      </div>
      <div className="lg:w-32 lg:shrink-0">
        <QuizMeter lecture={lecture} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ButtonLink to={`/lectures/${lecture.id}`} variant="secondary" size="sm" className="flex-1 lg:flex-none">
          Open Lecture
        </ButtonLink>
        <IconButton icon={Trash2} label={`Delete ${lecture.title}`} tone="danger" onClick={() => onDelete(lecture)} />
      </div>
    </article>
  )
}

/** Dense row for the dashboard's recent lectures. */
export function LectureCompactRow({ lecture }) {
  const score = latestScore(lecture)
  const materials = lectureMaterials(lecture)
  const available = MATERIALS.filter(({ id }) => materials[id])
  return (
    <Link to={`/lectures/${lecture.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-ink-50 sm:px-5">
      <IconTile icon={mediaIcon(lecture)} tone="neutral" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{lecture.title}</span>
        <MetaLine lecture={lecture} className="mt-0.5" />
      </span>
      <span className="hidden items-center gap-1 text-ink-400 sm:flex" title={available.map((m) => m.label).join(', ') || 'No study materials yet'}>
        {available.map(({ id, label, icon: Icon }) => (
          <span key={id} className="flex size-6 items-center justify-center rounded-md bg-accent-50 text-accent-700">
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </span>
        ))}
      </span>
      {score !== null && <span className="w-10 text-right text-sm font-semibold text-ink-900 tabular-nums">{score}%</span>}
      <ChevronRight className="size-4 shrink-0 text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
