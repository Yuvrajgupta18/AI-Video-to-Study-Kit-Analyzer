import { Play } from 'lucide-react'
import { formatRange } from '../lib/notesMarkdown'

/** Timestamp buttons that open the transcript at the segments an AI item was sourced from. */
export default function SourceChips({ sources, onJump }) {
  if (!sources?.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {sources.map((source) => (
        <button
          key={`${source.start}-${source.end}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onJump(source)
          }}
          title="Show this part of the transcript"
          className="inline-flex h-5 items-center gap-1 rounded-md bg-accent-50 px-1.5 text-[11px] font-medium text-accent-700 tabular-nums transition-colors duration-150 hover:bg-accent-100"
        >
          <Play className="size-2.5 fill-current" aria-hidden="true" />
          {formatRange(source)}
        </button>
      ))}
    </span>
  )
}
