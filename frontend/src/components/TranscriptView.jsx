import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, MicOff } from 'lucide-react'
import { Button, EmptyState, SearchInput } from './ui'
import { formatTimestamp } from '../lib/format'
import { downloadTextFile } from '../lib/notesMarkdown'
import { toast } from '../lib/toast'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlighted({ text, pattern }) {
  if (!pattern) return text
  return text.split(pattern).map((part, index) =>
    // split() with a capture group puts the matches at odd indexes.
    index % 2 === 1 ? (
      <mark key={index} className="rounded-sm bg-amber-200 px-0.5 text-ink-900">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function toPlainText(segments) {
  return segments
    .map((s) => `[${formatTimestamp(s.start)} - ${formatTimestamp(s.end)}] ${s.text}`)
    .join('\n')
}

function isInRange(segment, range) {
  // Small tolerance: timestamps are rounded to 2 decimals by the backend.
  return Boolean(range) && segment.start >= range.start - 0.01 && segment.end <= range.end + 0.01
}

/** `focusRange` ({ start, end }) highlights and scrolls to the segments a note was sourced from. */
export default function TranscriptView({ lecture, focusRange }) {
  const { segments } = lecture
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  const listRef = useRef(null)

  const trimmed = query.trim()
  const pattern = useMemo(() => (trimmed ? new RegExp(`(${escapeRegExp(trimmed)})`, 'gi') : null), [trimmed])
  const visible = useMemo(
    () => (trimmed ? segments.filter((s) => s.text.toLowerCase().includes(trimmed.toLowerCase())) : segments),
    [segments, trimmed],
  )

  useEffect(() => {
    if (!focusRange) return
    listRef.current?.querySelector('[data-focused="true"]')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [focusRange])

  if (segments.length === 0) {
    return (
      <EmptyState
        icon={MicOff}
        title="No speech detected"
        description="Whisper didn't find any spoken words in this recording. Check that the file has audible speech and try again."
      />
    )
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(segments))
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
      toast({ title: 'Transcript copied' })
    } catch {
      toast({ title: "Couldn't copy the transcript", description: 'Use Download .txt instead.', tone: 'error' })
    }
  }

  const handleDownload = () => downloadTextFile(`${lecture.title || 'transcript'}.txt`, toPlainText(segments))

  return (
    <div>
      <div className="sticky top-[6.5rem] z-[5] flex flex-col gap-2 border-b border-ink-200 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:px-5 lg:top-12">
        <SearchInput value={query} onChange={setQuery} placeholder="Search transcript" label="Search transcript" className="w-full sm:max-w-sm" />
        <p className="flex-1 text-xs text-ink-500 sm:px-2" aria-live="polite">
          {trimmed ? `${visible.length} of ${segments.length} segments match "${trimmed}"` : `${segments.length} segments`}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleCopy} className="flex-1 sm:flex-none">
            {copied ? <Check className="size-4 text-emerald-700" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="secondary" onClick={handleDownload} className="flex-1 sm:flex-none">
            <Download className="size-4" aria-hidden="true" />
            Download .txt
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-14 text-center text-sm text-ink-500">No segments match your search.</p>
      ) : (
        <ol ref={listRef} className="p-2 sm:p-3">
          {visible.map((segment) => {
            const focused = isInRange(segment, focusRange)
            return (
              <li
                key={`${segment.start}-${segment.end}`}
                data-focused={focused}
                className={`flex scroll-mt-40 flex-col gap-1 rounded-lg px-3 py-2.5 transition-colors duration-150 sm:flex-row sm:gap-4 ${
                  focused ? 'bg-accent-50 ring-1 ring-accent-200 ring-inset' : 'hover:bg-ink-50'
                }`}
              >
                <span className={`shrink-0 text-xs leading-6 font-medium whitespace-nowrap tabular-nums sm:w-24 ${focused ? 'text-accent-700' : 'text-ink-500'}`}>
                  {formatTimestamp(segment.start)} – {formatTimestamp(segment.end)}
                </span>
                <p className="min-w-0 text-[15px] leading-relaxed text-ink-800">
                  <Highlighted text={segment.text} pattern={pattern} />
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
