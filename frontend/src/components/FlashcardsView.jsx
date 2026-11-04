import { useEffect, useEffectEvent, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  CircleCheck,
  Download,
  Gauge,
  Layers,
  ListRestart,
  Play,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Tags,
  TriangleAlert,
} from 'lucide-react'
import { AiJobAlerts, GenerateIntro, GeneratingPanel } from './AiPanels'
import SourceChips from './SourceChips'
import { Alert, Badge, Button, CardToolbar, ConfirmDialog, FilterChip, Kbd, ProgressBar, Select, Skeleton } from './ui'
import { cancelAiJob, dismissAiJob, startAiJob, useAiJob } from '../lib/aiJobs'
import {
  DIFFICULTIES,
  STATUS_FILTERS,
  buildDeck,
  countProgress,
  flashcardsToCSV,
  flashcardsToJSON,
  matchesStatus,
  resetProgress,
  setCardStatus,
  shuffled,
} from '../lib/flashcards'
import { formatDate } from '../lib/format'
import { downloadTextFile } from '../lib/notesMarkdown'
import { toast } from '../lib/toast'

const INCLUDED = [
  { icon: Layers, label: '10–20 Q&A cards' },
  { icon: Gauge, label: 'Easy, medium, hard' },
  { icon: Tags, label: 'Grouped by topic' },
  { icon: Play, label: 'Source timestamps' },
]

const DIFFICULTY_TONES = { easy: 'emerald', medium: 'amber', hard: 'rose' }

const INITIAL_VIEW = { order: null, difficulty: 'all', status: 'all', index: 0 }

// Border colour of a card reflects its revision state.
const STATUS_BORDERS = { known: 'border-emerald-300', review: 'border-amber-300' }

// Deck position, filters, and shuffle order per lecture + deck. Kept for the
// session so jumping to a source in the transcript and back doesn't lose your place.
const savedViews = new Map()

function DifficultyBadge({ difficulty }) {
  return (
    <Badge tone={DIFFICULTY_TONES[difficulty]} className="capitalize">
      {difficulty}
    </Badge>
  )
}

function FlipCard({ card, flipped, status, onFlip }) {
  const face = 'flex min-h-72 flex-col rounded-2xl border p-5 shadow-card backface-hidden [grid-area:1/1] sm:min-h-80 sm:p-7'
  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <DifficultyBadge difficulty={card.difficulty} />
      <span className="text-xs text-ink-600">{card.topic}</span>
    </div>
  )
  return (
    <div className="perspective-[1400px]">
      <button
        type="button"
        onClick={onFlip}
        aria-pressed={flipped}
        className={`grid w-full rounded-2xl text-left transition-transform duration-500 ease-[cubic-bezier(0.3,0.7,0.2,1)] transform-3d motion-reduce:transition-none ${
          flipped ? 'rotate-y-180' : ''
        }`}
      >
        <div
          className={`${face} bg-surface transition-[border-color,box-shadow] duration-200 hover:shadow-card-hover ${STATUS_BORDERS[status] ?? 'border-ink-200 hover:border-ink-300'}`}
          aria-hidden={flipped}
        >
          {header}
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <p className="text-xs font-medium text-accent-700">Question</p>
            <p className="mt-2 text-lg leading-snug font-semibold tracking-tight text-ink-900 sm:text-xl">{card.question}</p>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-500">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Click to reveal the answer
          </p>
        </div>

        <div className={`${face} rotate-y-180 bg-accent-50 ${STATUS_BORDERS[status] ?? 'border-accent-200'}`} aria-hidden={!flipped}>
          {header}
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <p className="text-xs font-medium text-accent-700">Answer</p>
            <p className="mt-2 text-base leading-relaxed text-ink-900 sm:text-lg">{card.answer}</p>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-600">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Click to see the question
          </p>
        </div>
      </button>
    </div>
  )
}

/** Known / Needs revision toggle. */
function MarkButton({ icon: Icon, active, activeClass, idleClass, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors duration-150 active:scale-[0.98] ${active ? activeClass : idleClass}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  )
}

function Deck({ lecture, flashcards, onJump, onRegenerate }) {
  const { cards } = flashcards
  const progress = lecture.flashcardProgress ?? {}
  const viewKey = `${lecture.id}:${flashcards.generated_at}`
  const [view, setView] = useState(() => savedViews.get(viewKey) ?? INITIAL_VIEW)
  const [flipped, setFlipped] = useState(false)
  const [storageFailed, setStorageFailed] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    savedViews.set(viewKey, view)
  }, [viewKey, view])

  const deck = buildDeck(cards, view, progress)
  const index = Math.min(view.index, Math.max(deck.length - 1, 0))
  const card = deck[index]
  const counts = countProgress(cards, progress)

  const goTo = (nextIndex) => {
    setView((current) => ({ ...current, index: nextIndex }))
    setFlipped(false)
  }
  const next = () => index < deck.length - 1 && goTo(index + 1)
  const previous = () => index > 0 && goTo(index - 1)
  const updateView = (changes) => {
    setView((current) => ({ ...current, ...changes, index: 0 }))
    setFlipped(false)
  }

  const mark = (status) => {
    const newStatus = progress[card.id] === status ? null : status
    if (!setCardStatus(lecture, card.id, newStatus)) setStorageFailed(true)
    if (!matchesStatus(newStatus, view.status)) {
      // The card leaves the filtered deck; the next one moves into this position.
      setFlipped(false)
    } else if (newStatus && index < deck.length - 1) {
      goTo(index + 1)
    }
  }

  const onKeyDown = useEffectEvent((event) => {
    if (event.target.closest?.('input, select, textarea, [role="tab"], [role="dialog"]')) return
    if (event.key === 'ArrowRight') next()
    if (event.key === 'ArrowLeft') previous()
  })
  useEffect(() => {
    const handler = (event) => onKeyDown(event)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const download = (format) => {
    const name = `${lecture.title} - flashcards`
    if (format === 'csv') downloadTextFile(`${name}.csv`, flashcardsToCSV(flashcards, progress), 'text/csv')
    else downloadTextFile(`${name}.json`, flashcardsToJSON(lecture, flashcards, progress), 'application/json')
  }

  const status = card ? progress[card.id] : undefined

  return (
    <div>
      <CardToolbar
        actions={
          <>
            <Button variant="secondary" onClick={onRegenerate} className="flex-1 sm:flex-none">
              <RefreshCw className="size-4" aria-hidden="true" />
              Regenerate
            </Button>
            <Button variant="secondary" onClick={() => download('json')} className="flex-1 sm:flex-none">
              <Download className="size-4" aria-hidden="true" />
              JSON
            </Button>
            <Button variant="secondary" onClick={() => download('csv')} className="flex-1 sm:flex-none">
              <Download className="size-4" aria-hidden="true" />
              CSV
            </Button>
          </>
        }
      >
        <p className="text-xs text-ink-500">
          {cards.length} cards generated by {flashcards.model} on {formatDate(flashcards.generated_at)}.
        </p>
      </CardToolbar>

      <div className="space-y-5 p-4 sm:p-6">
        {storageFailed && (
          <Alert tone="amber" icon={TriangleAlert}>
            Browser storage is full or blocked, so your progress won&apos;t survive a reload.
          </Alert>
        )}

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by difficulty">
            <FilterChip active={view.difficulty === 'all'} onClick={() => updateView({ difficulty: 'all' })}>
              All ({cards.length})
            </FilterChip>
            {DIFFICULTIES.map((level) => (
              <FilterChip key={level} active={view.difficulty === level} onClick={() => updateView({ difficulty: level })}>
                <span className="capitalize">{level}</span> ({cards.filter((c) => c.difficulty === level).length})
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select label="Filter by revision status" value={view.status} onChange={(event) => updateView({ status: event.target.value })} className="flex-1 sm:w-40 sm:flex-none">
              {STATUS_FILTERS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => updateView({ order: shuffled(cards.map((c) => c.id)) })}>
              <Shuffle className="size-4" aria-hidden="true" />
              Shuffle
            </Button>
            {view.order && (
              <Button variant="ghost" onClick={() => updateView({ order: null })}>
                <ListRestart className="size-4" aria-hidden="true" />
                Original order
              </Button>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-medium text-ink-900 tabular-nums" aria-live="polite">
                {deck.length ? `Card ${index + 1} of ${deck.length}` : 'No cards'}
              </p>
              <div className="flex flex-wrap gap-x-3 text-xs text-ink-500 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>{counts.known} known</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                  <span>{counts.review} need revision</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-ink-300" aria-hidden="true" />
                  <span>{counts.unmarked} not yet marked</span>
                </span>
              </div>
            </div>
            <ProgressBar value={deck.length ? index + 1 : 0} max={deck.length} label="Position in deck" className="mt-2" />
          </div>

          {card ? (
            <>
              <FlipCard card={card} flipped={flipped} status={status} onFlip={() => setFlipped((value) => !value)} />

              {flipped && (
                <p className="animate-fade-in flex flex-wrap items-center justify-center gap-2 text-xs text-ink-500">
                  Source in lecture:
                  <SourceChips sources={card.sources} onJump={onJump} />
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <MarkButton
                  icon={BookmarkCheck}
                  active={status === 'review'}
                  activeClass="border-warning bg-warning text-on-warning"
                  idleClass="border-ink-200 bg-surface text-ink-800 shadow-card hover:border-amber-300 hover:bg-amber-50"
                  onClick={() => mark('review')}
                >
                  Needs revision
                </MarkButton>
                <MarkButton
                  icon={CircleCheck}
                  active={status === 'known'}
                  activeClass="border-success bg-success text-white"
                  idleClass="border-ink-200 bg-surface text-ink-800 shadow-card hover:border-emerald-300 hover:bg-emerald-50"
                  onClick={() => mark('known')}
                >
                  Known
                </MarkButton>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={previous} disabled={index === 0}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Previous
                </Button>
                <span className="hidden items-center gap-1 text-xs text-ink-500 sm:inline-flex">
                  <Kbd>←</Kbd> <Kbd>→</Kbd> to move
                </span>
                <Button variant="ghost" onClick={next} disabled={index >= deck.length - 1}>
                  Next
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : (
            <div className="animate-fade-in flex flex-col items-center rounded-2xl border border-dashed border-ink-300 px-6 py-14 text-center">
              <p className="text-sm font-medium text-ink-900">
                {view.status === 'review' && counts.review === 0 ? 'Nothing needs revision right now.' : 'No cards match these filters.'}
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => updateView({ difficulty: 'all', status: 'all' })}>
                Show all cards
              </Button>
            </div>
          )}
        </div>

        {counts.known + counts.review > 0 && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset progress
            </Button>
          </div>
        )}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset progress for this deck?"
          confirmLabel="Reset progress"
          tone="danger"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetProgress(lecture)
            setConfirmReset(false)
            toast({ title: 'Flashcard progress reset' })
          }}
        >
          <p>This clears all Known and Needs revision marks. The cards themselves stay.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    </div>
  )
}

/** Flashcards tab: generate a deck with Gemini, study it, track progress, and export. */
export default function FlashcardsView({ lecture, onJump }) {
  const job = useAiJob('flashcards', lecture.id)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const { flashcards } = lecture

  if (job?.status === 'loading') {
    return (
      <GeneratingPanel job={job} label="Generating flashcards…" onCancel={() => cancelAiJob('flashcards', lecture.id)}>
        <CardSkeleton />
      </GeneratingPanel>
    )
  }

  const generate = () => startAiJob('flashcards', lecture)

  return (
    <>
      <AiJobAlerts
        job={job}
        errorTitle="Couldn't generate flashcards"
        what="Flashcards"
        onRetry={generate}
        onDismiss={() => dismissAiJob('flashcards', lecture.id)}
      />
      {flashcards ? (
        // Keyed by deck so a regenerated set starts from the first card.
        <Deck key={flashcards.generated_at} lecture={lecture} flashcards={flashcards} onJump={onJump} onRegenerate={() => setConfirmRegenerate(true)} />
      ) : (
        <GenerateIntro
          icon={Layers}
          title="Generate flashcards"
          description="Gemini turns this lecture into question-and-answer cards for active recall. Each card links to the part of the lecture that answers it."
          included={INCLUDED}
          buttonLabel="Generate flashcards"
          onGenerate={generate}
          hasTranscript={lecture.segments.length > 0}
        />
      )}
      {confirmRegenerate && (
        <ConfirmDialog
          title="Replace these flashcards?"
          confirmLabel="Replace flashcards"
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={() => {
            setConfirmRegenerate(false)
            generate()
          }}
        >
          <p>A new set will be generated, and your Known and Needs revision marks will be reset.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
