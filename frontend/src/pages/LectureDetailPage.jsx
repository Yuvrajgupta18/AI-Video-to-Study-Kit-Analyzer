import { Calendar, ChevronRight, Clock, CornerUpLeft, FileAudio, FileSearch, FileText, FileVideo, Languages, Layers, ListChecks, MessagesSquare, NotebookPen, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AskView from '../components/AskView'
import DeleteLectureDialog from '../components/DeleteLectureDialog'
import FlashcardsView from '../components/FlashcardsView'
import NotesView from '../components/NotesView'
import QuizView from '../components/QuizView'
import TranscriptView from '../components/TranscriptView'
import { Button, ButtonLink, Card, EmptyState } from '../components/ui'
import { lectureMaterials } from '../lib/lectureStats'
import { useLecture } from '../lib/lectures'
import { formatBytes, formatDate, formatDuration, formatLanguage, formatNumber } from '../lib/format'
import { formatRange } from '../lib/notesMarkdown'

const TABS = [
  { id: 'transcript', label: 'Transcript', icon: FileText },
  { id: 'notes', label: 'Notes', icon: NotebookPen, material: 'notes' },
  { id: 'flashcards', label: 'Flashcards', icon: Layers, material: 'flashcards' },
  { id: 'quiz', label: 'Quiz', icon: ListChecks, material: 'quiz' },
  { id: 'ask', label: 'Ask AI', icon: MessagesSquare, material: 'chat' },
]

// Tabs that link to transcript sources, and how the "back" banner describes them.
const SOURCE_ORIGINS = {
  notes: { item: 'a note', back: 'Back to notes' },
  flashcards: { item: 'a flashcard', back: 'Back to flashcards' },
  quiz: { item: 'a quiz question', back: 'Back to quiz' },
  ask: { item: 'an answer', back: 'Back to Ask AI' },
}

/** `?at=12.5-30` -> { start: 12.5, end: 30 } */
function parseRange(value) {
  const [start, end] = (value ?? '').split('-').map(Number)
  return Number.isFinite(start) && Number.isFinite(end) && value ? { start, end } : null
}

function Meta({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-3.5 text-ink-400" aria-hidden="true" />
      {children}
    </span>
  )
}

/** Tabs with arrow-key navigation (roving tabindex). A dot marks tabs that already have content. */
function LectureTabs({ activeId, materials, onSelect }) {
  const refs = useRef({})

  const onKeyDown = (event) => {
    const index = TABS.findIndex((tab) => tab.id === activeId)
    const targets = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }
    if (!(event.key in targets)) return
    event.preventDefault()
    const next = TABS[(targets[event.key] + TABS.length) % TABS.length]
    onSelect(next.id)
    refs.current[next.id]?.focus()
  }

  return (
    <div className="sticky top-14 z-10 -mx-4 border-b border-ink-200 bg-canvas px-4 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
      <div role="tablist" aria-label="Lecture sections" onKeyDown={onKeyDown} className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon, material }) => {
          const selected = id === activeId
          return (
            <button
              key={id}
              ref={(node) => {
                refs.current[id] = node
              }}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={selected}
              aria-controls={`panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(id)}
              className={`-outline-offset-2 flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                selected ? 'border-primary text-ink-900 dark:border-accent-400' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-900'
              }`}
            >
              <Icon className={`size-4 ${selected ? 'text-accent-500' : ''}`} aria-hidden="true" />
              {label}
              {material && materials[material] && <span className="size-1.5 rounded-full bg-accent-400" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function LectureDetailPage() {
  const { lectureId } = useParams()
  const lecture = useLecture(lectureId)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const atParam = searchParams.get('at')
  const focusRange = useMemo(() => parseRange(atParam), [atParam])

  if (!lecture) {
    return (
      <Card>
        <EmptyState
          icon={FileSearch}
          headingLevel="h1"
          title="Lecture not found"
          description="It may have been deleted, or it was saved in a different browser."
          action={<ButtonLink to="/lectures">Go to My Lectures</ButtonLink>}
        />
      </Card>
    )
  }

  const activeTab = TABS.find((tab) => tab.id === searchParams.get('tab')) ?? TABS[0]
  const showTab = (id) => setSearchParams(id === 'transcript' ? {} : { tab: id }, { replace: true })
  // Pushes a history entry so the browser Back button returns to the originating tab.
  const jumpToSource = ({ start, end }) => setSearchParams({ at: `${start}-${end}`, from: activeTab.id })
  const originTab = SOURCE_ORIGINS[searchParams.get('from')] ? searchParams.get('from') : 'notes'
  const origin = SOURCE_ORIGINS[originTab]
  const MediaIcon = lecture.mediaType === 'video' ? FileVideo : FileAudio

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-ink-500">
        <Link to="/lectures" className="shrink-0 rounded transition-colors duration-150 hover:text-ink-900">
          My Lectures
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
        <span className="truncate" aria-current="page">
          {lecture.title}
        </span>
      </nav>

      <header className="mt-2 mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words text-ink-900">{lecture.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500 sm:text-sm">
            <Meta icon={Calendar}>{formatDate(lecture.createdAt)}</Meta>
            <Meta icon={Clock}>{formatDuration(lecture.duration)}</Meta>
            <Meta icon={Languages}>{formatLanguage(lecture.language)}</Meta>
            <Meta icon={MediaIcon}>{formatBytes(lecture.fileSize)}</Meta>
            <Meta icon={FileText}>{formatNumber(lecture.wordCount)} words</Meta>
          </div>
        </div>
        <Button variant="danger-ghost" size="sm" onClick={() => setConfirmDelete(true)} className="shrink-0">
          <Trash2 className="size-3.5" aria-hidden="true" />
          Delete
        </Button>
      </header>

      <LectureTabs activeId={activeTab.id} materials={lectureMaterials(lecture)} onSelect={showTab} />

      <div key={activeTab.id} role="tabpanel" id={`panel-${activeTab.id}`} aria-labelledby={`tab-${activeTab.id}`} className="animate-fade-in mt-4">
        <Card className="overflow-clip">
          {activeTab.id === 'transcript' && focusRange && (
            <div className="animate-fade-in flex flex-col gap-2 border-b border-accent-100 bg-accent-50 px-4 py-2.5 text-sm text-accent-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span>
                Highlighting the source of {origin.item} ({formatRange(focusRange)})
              </span>
              <button
                type="button"
                onClick={() => showTab(originTab)}
                className="inline-flex items-center gap-1.5 self-start rounded font-medium text-accent-700 underline-offset-2 hover:underline"
              >
                <CornerUpLeft className="size-3.5" aria-hidden="true" />
                {origin.back}
              </button>
            </div>
          )}
          {activeTab.id === 'transcript' ? (
            <TranscriptView lecture={lecture} focusRange={focusRange} />
          ) : activeTab.id === 'notes' ? (
            <NotesView lecture={lecture} onJump={jumpToSource} />
          ) : activeTab.id === 'flashcards' ? (
            <FlashcardsView lecture={lecture} onJump={jumpToSource} />
          ) : activeTab.id === 'quiz' ? (
            <QuizView lecture={lecture} onJump={jumpToSource} onOpenTab={showTab} />
          ) : (
            <AskView lecture={lecture} onJump={jumpToSource} />
          )}
        </Card>
      </div>

      {confirmDelete && (
        <DeleteLectureDialog
          lecture={lecture}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={() => navigate('/lectures', { replace: true })}
        />
      )}
    </>
  )
}
