import { useEffect, useRef, useState } from 'react'
import { ArrowUp, CircleAlert, DatabaseZap, Info, LoaderCircle, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, IconTile, Skeleton } from './ui'
import {
  askQuestion,
  clearChat,
  dismissAskError,
  ensureIndexed,
  retryQuestion,
  useAssistantState,
} from '../lib/assistant'
import { formatRange } from '../lib/notesMarkdown'
import { suggestedQuestions } from '../lib/suggestions'
import { toast } from '../lib/toast'

const MAX_QUESTION_LENGTH = 1000

/** Renders `**bold**` and `[n]` citation markers inside a line of answer text. */
function InlineText({ text, citations, onJump }) {
  const byId = new Map(citations.map((c) => [c.id, c]))
  return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
    const marker = part.match(/^\[(\d+)\]$/)
    if (marker && byId.has(Number(marker[1]))) {
      const citation = byId.get(Number(marker[1]))
      return (
        <button
          key={i}
          type="button"
          onClick={() => onJump(citation)}
          title={`Source ${citation.id}: ${formatRange(citation)}`}
          aria-label={`Source ${citation.id}, ${formatRange(citation)}`}
          className="relative -top-px mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-accent-100 px-1 align-middle text-[11px] font-semibold text-accent-700 tabular-nums transition-colors duration-150 hover:bg-accent-200"
        >
          {citation.id}
        </button>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    return part
  })
}

/** Paragraphs and simple bullet / numbered lists from plain answer text. */
function AnswerText({ text, citations, onJump }) {
  const blocks = []
  text.split('\n').forEach((raw) => {
    const line = raw.trim()
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (!line) return
    if (item) {
      const last = blocks.at(-1)
      if (last?.type === 'list') last.items.push(item[1])
      else blocks.push({ type: 'list', items: [item[1]] })
    } else {
      blocks.push({ type: 'p', text: line })
    }
  })
  return (
    <div className="space-y-2">
      {blocks.map((block, i) =>
        block.type === 'list' ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-ink-400">
            {block.items.map((item, j) => (
              <li key={j}>
                <InlineText text={item} citations={citations} onJump={onJump} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <InlineText text={block.text} citations={citations} onJump={onJump} />
          </p>
        ),
      )}
    </div>
  )
}

function AssistantAvatar() {
  return <IconTile icon={Sparkles} size="sm" className="mt-0.5" />
}

function Message({ message, onJump }) {
  if (message.role === 'user') {
    return (
      <li className="animate-fade-up flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white shadow-card sm:max-w-[70%]">
          <span className="sr-only">You: </span>
          {message.content}
        </div>
      </li>
    )
  }

  const citations = message.citations ?? []
  return (
    <li className="animate-fade-up flex gap-3">
      <AssistantAvatar />
      <div className="max-w-[90%] min-w-0 flex-1 space-y-3 sm:max-w-[80%]">
        <div className="rounded-2xl rounded-tl-md border border-ink-200 bg-surface px-4 py-3 text-sm leading-relaxed text-ink-800 shadow-card">
          <span className="sr-only">Assistant: </span>
          {message.answerable === false && (
            <Badge tone="amber" className="mb-2">
              <Info className="size-3" aria-hidden="true" />
              Not covered in this lecture
            </Badge>
          )}
          <AnswerText text={message.content} citations={citations} onJump={onJump} />
        </div>
        {citations.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-500">Sources from the lecture</p>
            <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {citations.map((citation) => (
                <li key={citation.id}>
                  <button
                    type="button"
                    onClick={() => onJump(citation)}
                    className="flex h-full w-full items-start gap-2 rounded-xl border border-ink-200 bg-surface p-2.5 text-left transition-colors duration-150 hover:border-accent-200 hover:bg-accent-50"
                  >
                    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-md bg-accent-100 px-1 text-[11px] font-semibold text-accent-700 tabular-nums">
                      {citation.id}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink-900 tabular-nums">{formatRange(citation)}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{citation.excerpt}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  )
}

function IndexStatus({ state, lecture, onRebuild }) {
  const { status, error, chunkCount } = state
  if (status === 'ready') {
    return (
      <p className="flex items-center gap-2 text-xs text-ink-500">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        Lecture indexed · {chunkCount ?? lecture.ragIndex?.chunk_count ?? 0} searchable passages
      </p>
    )
  }
  if (status === 'error') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-rose-700">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">Couldn&apos;t index this lecture: {error}</span>
        <Button variant="secondary" size="sm" onClick={onRebuild}>
          Try again
        </Button>
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 text-xs text-ink-500" aria-live="polite">
      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent-500" aria-hidden="true" />
      {status === 'indexing' ? 'Indexing the lecture for search… (the first run also loads the embedding model)' : 'Checking the lecture index…'}
    </p>
  )
}

/** Placeholder prompts while the lecture's search index is being prepared. */
function PromptSkeleton() {
  return (
    <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  )
}

/** Ask AI tab: chat with a RAG assistant that answers only from this lecture. */
export default function AskView({ lecture, onJump }) {
  const { index, ask } = useAssistantState(lecture.id)
  const [draft, setDraft] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const scrollRef = useRef(null)
  const chat = lecture.chat ?? []
  const hasTranscript = lecture.segments.length > 0
  const ready = index.status === 'ready'
  const busy = ask.status === 'loading'

  useEffect(() => {
    if (hasTranscript && index.status === 'idle') ensureIndexed(lecture)
  }, [hasTranscript, index.status, lecture])

  // Scroll only the message list, so the input stays put and the page doesn't jump.
  useEffect(() => {
    const node = scrollRef.current
    node?.scrollTo?.({ top: node.scrollHeight, behavior: 'smooth' })
  }, [chat.length, ask.status])

  const send = (text) => {
    if (!text.trim() || !ready || busy) return
    askQuestion(lecture.id, text)
    setDraft('')
  }

  if (!hasTranscript) {
    return <p className="px-6 py-14 text-center text-sm text-ink-500">This lecture has no transcript text, so there is nothing to ask about.</p>
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[30rem] flex-col lg:h-[calc(100dvh-15.5rem)]">
      <div className="flex flex-col gap-2 border-b border-ink-200 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          <IndexStatus state={index} lecture={lecture} onRebuild={() => ensureIndexed(lecture, { force: true })} />
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => ensureIndexed(lecture, { force: true })}
            disabled={!ready && index.status !== 'error'}
            title="Rebuild the search index from the transcript"
          >
            <DatabaseZap className="size-3.5" aria-hidden="true" />
            Rebuild index
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} disabled={chat.length === 0 || busy}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Clear chat
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto bg-ink-50 px-4 py-5 sm:px-6" aria-live="polite">
        {chat.length === 0 && !busy ? (
          <div className="animate-fade-in mx-auto flex max-w-2xl flex-col items-center py-4 text-center sm:py-8">
            <IconTile icon={Sparkles} size="lg" />
            <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink-900">Ask anything about this lecture</h2>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
              Answers come only from this lecture&apos;s transcript, with timestamps you can click to check the source. If the
              lecture doesn&apos;t cover something, the assistant will tell you instead of guessing.
            </p>
            {ready ? (
              <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestedQuestions(lecture).map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => send(question)}
                    className="rounded-xl border border-ink-200 bg-surface px-3.5 py-3 text-left text-sm text-ink-700 shadow-card transition-colors duration-150 hover:border-accent-200 hover:bg-accent-50 hover:text-ink-900"
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : (
              index.status !== 'error' && <PromptSkeleton />
            )}
          </div>
        ) : (
          <ol className="mx-auto max-w-3xl space-y-5" aria-label="Conversation">
            {chat.map((message) => (
              <Message key={message.id} message={message} onJump={onJump} />
            ))}
            {busy && (
              <li className="animate-fade-up flex gap-3">
                <AssistantAvatar />
                <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-ink-200 bg-surface px-4 py-3 text-sm text-ink-500 shadow-card">
                  <span className="flex gap-1" aria-hidden="true">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="size-1.5 animate-bounce rounded-full bg-accent-400" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </span>
                  Searching the lecture and writing an answer…
                </div>
              </li>
            )}
            {ask.status === 'error' && (
              <li className="animate-fade-up flex gap-3" role="alert">
                <AssistantAvatar />
                <div className="rounded-2xl rounded-tl-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <p className="font-semibold">Couldn&apos;t get an answer</p>
                  <p className="mt-1">{ask.error}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => retryQuestion(lecture.id)}>
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                      Retry
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => dismissAskError(lecture.id)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              </li>
            )}
          </ol>
        )}
      </div>

      <form
        className="border-t border-ink-200 bg-surface px-4 py-3 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-ink-200 bg-surface p-1.5 shadow-card transition-colors duration-150 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send(draft)
              }
            }}
            rows={1}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder={ready ? 'Ask a question about this lecture…' : 'Preparing the lecture for questions…'}
            aria-label="Your question"
            disabled={!ready}
            className="max-h-32 min-h-8 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-ink-900 [field-sizing:content] placeholder:text-ink-500 focus:outline-none disabled:cursor-not-allowed"
          />
          <Button type="submit" size="sm" disabled={!ready || busy || !draft.trim()} className="w-8 px-0" aria-label="Send question">
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-[11px] leading-relaxed text-ink-500">
          Enter to send · Shift+Enter for a new line. Your question and the matching transcript passages are sent to Google&apos;s Gemini API.
        </p>
      </form>

      {confirmClear && (
        <ConfirmDialog
          title="Clear this conversation?"
          confirmLabel="Clear chat"
          tone="danger"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            clearChat(lecture.id)
            setConfirmClear(false)
            toast({ title: 'Chat cleared' })
          }}
        >
          <p>This deletes the chat history for this lecture from this browser.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
