import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { formatDate } from '../lib/format'
import { WEAK_TOPIC_THRESHOLD } from '../lib/quiz'

const GRID = [100, 50, 0]

/** A percentage as a ring, for the headline quiz score. The number is the label, so colour is not the only signal. */
export function ScoreRing({ percent }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const tone = percent >= 70 ? 'stroke-emerald-500' : percent >= 40 ? 'stroke-amber-500' : 'stroke-rose-500'
  return (
    <div className="relative size-28 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-ink-100" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className={`${tone} transition-[stroke-dashoffset] duration-500 ease-out`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold tracking-tight text-ink-900 tabular-nums">{percent}%</span>
    </div>
  )
}

/**
 * Column chart of score per attempt (oldest first). Single series, so no legend;
 * per-column tooltip on hover and focus, a direct label on the latest column,
 * and a table view for every value.
 */
export function AttemptsChart({ attempts, currentQuizId }) {
  const [active, setActive] = useState(null)
  const shown = attempts.slice(-12)
  const offset = attempts.length - shown.length

  return (
    <figure>
      <figcaption className="text-sm font-semibold text-ink-900">Score by attempt</figcaption>
      <div className="mt-4 flex gap-3">
        {/* Y axis */}
        <div className="relative h-40 w-9 shrink-0 text-right text-[11px] text-ink-500 tabular-nums" aria-hidden="true">
          {GRID.map((g) => (
            <span key={g} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - g}%` }}>
              {g}%
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-40">
            {GRID.map((g) => (
              <div key={g} className="absolute inset-x-0 border-t border-ink-100" style={{ top: `${100 - g}%` }} aria-hidden="true" />
            ))}
            <div className="absolute inset-0 flex items-end">
              {shown.map((attempt, i) => {
                const isLatest = i === shown.length - 1
                const number = offset + i + 1
                const label = `Attempt ${number}, ${formatDate(attempt.submittedAt)}: ${attempt.percent}% (${attempt.correct} of ${attempt.total})${
                  attempt.quizId !== currentQuizId ? ', earlier quiz' : ''
                }`
                return (
                  <button
                    key={attempt.id}
                    type="button"
                    aria-label={label}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="relative flex h-full flex-1 cursor-default items-end justify-center rounded"
                  >
                    {isLatest && (
                      <span
                        className="absolute text-xs font-semibold text-ink-900 tabular-nums"
                        style={{ bottom: `calc(${attempt.percent}% + 4px)` }}
                        aria-hidden="true"
                      >
                        {attempt.percent}%
                      </span>
                    )}
                    <span
                      className={`w-full max-w-6 rounded-t bg-primary transition-opacity duration-150 ${active === null || active === i ? 'opacity-100' : 'opacity-50'}`}
                      style={{ height: `max(2px, ${attempt.percent}%)` }}
                    />
                    {active === i && (
                      <span
                        role="tooltip"
                        className="animate-fade-in pointer-events-none absolute z-10 w-max -translate-y-2 rounded-lg bg-ink-900 px-2.5 py-1.5 text-left text-xs text-surface shadow-overlay"
                        style={{ bottom: `${attempt.percent}%` }}
                      >
                        <span className="block font-semibold">
                          {attempt.percent}% · {attempt.correct}/{attempt.total}
                        </span>
                        <span className="block opacity-75">
                          Attempt {number} · {formatDate(attempt.submittedAt)}
                          {attempt.quizId !== currentQuizId ? ' · earlier quiz' : ''}
                        </span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          {/* X axis */}
          <div className="mt-2 flex text-[11px] text-ink-500 tabular-nums" aria-hidden="true">
            {shown.map((attempt, i) => (
              <span key={attempt.id} className="flex-1 text-center">
                #{offset + i + 1}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-xs text-ink-600">
        <summary className="w-fit cursor-pointer rounded font-medium text-ink-500 transition-colors duration-150 hover:text-ink-900">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-ink-500">
            <tr>
              <th className="py-1 font-medium">#</th>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">Score</th>
              <th className="py-1 font-medium">Quiz</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {attempts.map((attempt, i) => (
              <tr key={attempt.id} className="border-t border-ink-100">
                <td className="py-1">{i + 1}</td>
                <td className="py-1">{formatDate(attempt.submittedAt)}</td>
                <td className="py-1">
                  {attempt.percent}% ({attempt.correct}/{attempt.total})
                </td>
                <td className="py-1">{attempt.quizId === currentQuizId ? 'Current' : 'Earlier'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/**
 * Horizontal bars of accuracy per topic, weakest first. Every value is labelled;
 * weak topics add an icon and text so status never relies on colour.
 */
export function TopicChart({ topics, title = 'Accuracy by topic' }) {
  return (
    <figure>
      <figcaption className="text-sm font-semibold text-ink-900">{title}</figcaption>
      <ul className="mt-4 space-y-3.5">
        {topics.map((topic) => {
          const weak = topic.percent < WEAK_TOPIC_THRESHOLD
          return (
            <li key={topic.topic}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-ink-700">
                  <span className="truncate" title={topic.topic}>
                    {topic.topic}
                  </span>
                  {weak && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700">
                      <TriangleAlert className="size-3" aria-hidden="true" />
                      Needs revision
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                  <span className="font-semibold text-ink-900">{topic.percent}%</span> · {topic.correct}/{topic.total}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ease-out ${weak ? 'bg-amber-600' : 'bg-primary'}`}
                  style={{ width: `${topic.percent}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
