import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Hash,
  ListChecks,
  LogOut,
  NotebookPen,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
} from 'lucide-react'
import { AiJobAlerts, GeneratingPanel } from './AiPanels'
import { AttemptsChart, ScoreRing, TopicChart } from './QuizCharts'
import SourceChips from './SourceChips'
import { Alert, Badge, Button, Card, ConfirmDialog, FilterChip, IconTile, ProgressBar, SectionHeading, Skeleton, StatCard } from './ui'
import { cancelAiJob, dismissAiJob, startAiJob, useAiJob } from '../lib/aiJobs'
import { formatDate } from '../lib/format'
import { QUESTION_COUNTS, attemptStats, buildRecommendations, createAttempt, saveAttempt, scoreQuiz } from '../lib/quiz'

const DIFFICULTY_TONES = { easy: 'emerald', medium: 'amber', hard: 'rose' }
const LETTERS = ['A', 'B', 'C', 'D']

// Quiz screen, in-progress answers, and current question per lecture. Kept for
// the session so switching tabs or jumping to a source doesn't lose your place.
const sessions = new Map()

function freshSession(quiz, overrides = {}) {
  return { quizId: quiz?.generated_at ?? null, mode: quiz ? 'home' : 'setup', answers: {}, index: 0, attemptId: null, count: 10, ...overrides }
}

function DifficultyBadge({ difficulty }) {
  return (
    <Badge tone={DIFFICULTY_TONES[difficulty]} className="capitalize">
      {difficulty}
    </Badge>
  )
}

// --- Setup ----------------------------------------------------------------------

function QuizSetup({ count, onCountChange, onGenerate, onCancel, hasTranscript, replacing }) {
  return (
    <div className="animate-fade-in flex flex-col items-center px-6 py-12 text-center sm:py-16">
      <IconTile icon={ListChecks} size="lg" />
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink-900">{replacing ? 'Create a new quiz' : 'Create a practice quiz'}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
        Gemini writes multiple-choice questions from this lecture, each with an explanation and a link to its source.
        Answers stay hidden until you submit, and scoring happens in your browser.
      </p>

      <fieldset className="mt-6 w-full max-w-lg">
        <legend className="mb-2 text-sm font-medium text-ink-700">Number of questions</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {QUESTION_COUNTS.map((option) => {
            const selected = option.count === count
            return (
              <label
                key={option.count}
                className={`flex cursor-pointer flex-col rounded-xl border p-3.5 text-left transition-colors duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent-500 ${
                  selected ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-400' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                <input
                  type="radio"
                  name="question-count"
                  value={option.count}
                  checked={selected}
                  onChange={() => onCountChange(option.count)}
                  className="sr-only"
                />
                <span className="text-xl font-semibold tracking-tight text-ink-900 tabular-nums">{option.count}</span>
                <span className="mt-0.5 text-sm font-medium text-ink-700">{option.label}</span>
                <span className="text-xs text-ink-600">About {option.minutes} min</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {replacing && <p className="mt-4 text-xs text-ink-500">The current quiz will be replaced. Your past scores are kept.</p>}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={() => onGenerate(count)} disabled={!hasTranscript}>
          <Sparkles className="size-4" aria-hidden="true" />
          Generate {count}-question quiz
        </Button>
        {onCancel && (
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <p className="mt-4 max-w-sm text-xs leading-relaxed text-ink-500">
        {hasTranscript
          ? "The transcript is sent to Google's Gemini API. AI questions can contain mistakes, so check the explanation and source if something looks wrong."
          : 'This lecture has no transcript text, so there is nothing to generate from.'}
      </p>
    </div>
  )
}

// --- Home: quiz summary + performance dashboard ----------------------------------

function QuizHome({ quiz, attempts, onStart, onNewQuiz, onViewAttempt }) {
  const stats = attemptStats(attempts)
  const triedThisQuiz = attempts.some((a) => a.quizId === quiz.generated_at)
  const mix = ['easy', 'medium', 'hard'].map((d) => [d, quiz.questions.filter((q) => q.difficulty === d).length])
  const topicCount = new Set(quiz.questions.map((q) => q.topic)).size

  return (
    <div className="animate-fade-in space-y-6 p-4 sm:p-6">
      <section className="flex flex-col gap-4 rounded-xl border border-ink-200 bg-ink-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">Practice quiz · {quiz.questions.length} questions</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
            {mix
              .filter(([, n]) => n > 0)
              .map(([difficulty, n]) => (
                <Badge key={difficulty} tone={DIFFICULTY_TONES[difficulty]} className="capitalize">
                  {n} {difficulty}
                </Badge>
              ))}
            <span className="ml-1">
              {topicCount} topic{topicCount === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Generated by {quiz.model} on {formatDate(quiz.generated_at)}. Answers are revealed after you submit.
          </p>
          {quiz.questions.length < quiz.requested && (
            <p className="mt-1.5 text-xs text-amber-700">
              You asked for {quiz.requested} questions, but this lecture only supported {quiz.questions.length} well-grounded ones.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="ghost" onClick={onNewQuiz}>
            <RefreshCw className="size-4" aria-hidden="true" />
            New quiz
          </Button>
          <Button onClick={onStart}>
            <PlayCircle className="size-4" aria-hidden="true" />
            {triedThisQuiz ? 'Retake quiz' : 'Start quiz'}
          </Button>
        </div>
      </section>

      {stats ? (
        <section className="space-y-4">
          <SectionHeading icon={Target} className="text-base">
            Your performance
          </SectionHeading>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Clock} label="Latest score" value={`${stats.latest.percent}%`} change={stats.change} />
            <StatCard icon={Trophy} label="Best score" value={`${stats.best}%`} />
            <StatCard icon={Target} label="Average score" value={`${stats.average}%`} />
            <StatCard icon={Hash} label="Attempts" value={stats.count} hint={`Last on ${formatDate(stats.latest.submittedAt)}`} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5">
              {stats.count > 1 ? (
                <AttemptsChart attempts={attempts} currentQuizId={quiz.generated_at} />
              ) : (
                <>
                  <p className="text-sm font-semibold text-ink-900">Score by attempt</p>
                  <p className="mt-2 text-sm text-ink-500">Retake the quiz to see how your score changes over time.</p>
                </>
              )}
            </Card>
            <Card className="p-4 sm:p-5">
              <TopicChart topics={stats.latest.topics} title="Accuracy by topic (latest attempt)" />
            </Card>
          </div>

          <div>
            <SectionHeading as="h3">Attempt history</SectionHeading>
            <ul className="mt-2 divide-y divide-ink-100 overflow-clip rounded-2xl border border-ink-200 bg-surface shadow-card">
              {[...attempts].reverse().map((attempt, i) => {
                const current = attempt.quizId === quiz.generated_at
                return (
                  <li key={attempt.id} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-ink-50">
                    <span className="w-7 text-xs text-ink-500 tabular-nums">#{attempts.length - i}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-600">
                      {formatDate(attempt.submittedAt)}
                      {!current && <span className="ml-2 text-xs text-ink-500">earlier quiz</span>}
                    </span>
                    <span className="font-semibold text-ink-900 tabular-nums">
                      {attempt.percent}%
                      <span className="ml-1 font-normal text-ink-500">
                        ({attempt.correct}/{attempt.total})
                      </span>
                    </span>
                    {current ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewAttempt(attempt.id)}
                        aria-label={`View results of attempt ${attempts.length - i}`}
                        className="w-24"
                      >
                        View results
                      </Button>
                    ) : (
                      <span className="w-24 shrink-0" />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      ) : (
        <p className="py-6 text-center text-sm text-ink-500">Take the quiz to see your score, topic results, and a revision plan here.</p>
      )}
    </div>
  )
}

// --- Taking the quiz ---------------------------------------------------------------

function QuizTaking({ quiz, answers, index, onAnswer, onGoTo, onSubmit, onExit }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmingExit, setConfirmingExit] = useState(false)
  const total = quiz.questions.length
  const question = quiz.questions[index]
  const answered = quiz.questions.filter((q) => answers[q.id] !== undefined).length
  const unanswered = total - answered

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-6">
      <div className="min-w-0 space-y-4">
        <p className="text-sm font-medium text-ink-900 tabular-nums" aria-live="polite">
          Question {index + 1} of {total}
        </p>

        <fieldset key={question.id} className="animate-fade-in rounded-2xl border border-ink-200 p-4 sm:p-6">
          <legend className="sr-only">Question {index + 1}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyBadge difficulty={question.difficulty} />
            <span className="text-xs text-ink-500">{question.topic}</span>
          </div>
          <p className="mt-3 text-lg leading-snug font-semibold tracking-tight text-ink-900">{question.question}</p>
          <div className="mt-5 space-y-2" role="radiogroup" aria-label="Answer options">
            {question.options.map((option, i) => {
              const selected = answers[question.id] === i
              return (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent-500 ${
                    selected ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-400' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`answer-${question.id}`}
                    checked={selected}
                    onChange={() => onAnswer(question.id, i)}
                    className="sr-only"
                  />
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors duration-150 ${
                      selected ? 'bg-primary text-white' : 'bg-ink-100 text-ink-600'
                    }`}
                    aria-hidden="true"
                  >
                    {LETTERS[i]}
                  </span>
                  <span className="min-w-0 text-sm leading-6 text-ink-800">{option}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onGoTo(index - 1)} disabled={index === 0} className="flex-1 sm:flex-none">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Previous
          </Button>
          <Button variant="secondary" onClick={() => onGoTo(index + 1)} disabled={index === total - 1} className="flex-1 sm:flex-none">
            Next
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <aside className="space-y-4 rounded-2xl border border-ink-200 bg-ink-50 p-4 lg:sticky lg:top-16 lg:self-start">
        <div>
          <p className="text-xs text-ink-500 tabular-nums">
            {answered} of {total} answered
          </p>
          <ProgressBar value={answered} max={total} label="Questions answered" className="mt-2 bg-ink-200" />
        </div>
        <nav aria-label="Jump to question" className="flex flex-wrap gap-1.5">
          {quiz.questions.map((q, i) => {
            const done = answers[q.id] !== undefined
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onGoTo(i)}
                aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}
                aria-current={i === index ? 'step' : undefined}
                className={`size-8 rounded-lg border text-xs font-medium tabular-nums transition-colors duration-150 ${
                  i === index
                    ? 'border-primary bg-primary text-white'
                    : done
                      ? 'border-accent-200 bg-accent-100 text-accent-700 hover:bg-accent-200'
                      : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300 hover:text-ink-900'
                }`}
              >
                {i + 1}
              </button>
            )
          })}
        </nav>
        <div className="flex flex-col gap-1.5">
          <Button onClick={() => setConfirming(true)} className="w-full">
            <CircleCheck className="size-4" aria-hidden="true" />
            Submit quiz
          </Button>
          <Button variant="ghost" size="sm" onClick={() => (answered === 0 ? onExit() : setConfirmingExit(true))} className="w-full">
            <LogOut className="size-3.5" aria-hidden="true" />
            Exit quiz
          </Button>
        </div>
      </aside>

      {confirming && (
        <ConfirmDialog
          title="Submit quiz?"
          confirmLabel="Submit quiz"
          cancelLabel="Keep working"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            onSubmit()
          }}
        >
          {unanswered === 0 ? (
            <p>You answered all {total} questions. You can&apos;t change your answers after submitting.</p>
          ) : (
            <p>
              You answered {answered} of {total} questions. The {unanswered} unanswered question
              {unanswered === 1 ? '' : 's'} will be marked incorrect.
            </p>
          )}
        </ConfirmDialog>
      )}

      {confirmingExit && (
        <ConfirmDialog
          title="Leave this quiz?"
          confirmLabel="Leave quiz"
          cancelLabel="Keep working"
          tone="danger"
          onCancel={() => setConfirmingExit(false)}
          onConfirm={() => {
            setConfirmingExit(false)
            onExit()
          }}
        >
          <p>Your answers so far will be discarded.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

// --- Results -------------------------------------------------------------------

function Recommendations({ lecture, recommendations, onJump, onOpenTab }) {
  if (!recommendations.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="flex items-center gap-2 font-semibold">
          <CircleCheck className="size-4" aria-hidden="true" />
          Perfect score, no weak topics
        </p>
        <p className="mt-1">Retake the quiz in a few days to check you still remember it, or try a longer quiz.</p>
      </div>
    )
  }
  const linkClass = 'shrink-0 rounded text-xs font-medium text-accent-700 underline-offset-2 hover:underline'
  return (
    <ul className="space-y-3">
      {recommendations.map((rec) => (
        <li key={rec.topic} className="rounded-2xl border border-ink-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-ink-900">{rec.topic}</h4>
            <span className="text-xs text-ink-500 tabular-nums">
              {rec.correct}/{rec.total} correct
            </span>
            <Badge tone={rec.priority === 'high' ? 'rose' : 'amber'}>
              <TriangleAlert className="size-3" aria-hidden="true" />
              {rec.priority === 'high' ? 'High priority' : 'Review'}
            </Badge>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-600">
            {rec.actions.map((action, i) => (
              <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <span className="min-w-0 flex-1 basis-48">{action.text}</span>
                {action.type === 'rewatch' && <SourceChips sources={action.sources} onJump={onJump} />}
                {action.type === 'notes' && lecture.notes && (
                  <button type="button" onClick={() => onOpenTab('notes')} className={linkClass}>
                    Open notes
                  </button>
                )}
                {action.type === 'flashcards' && (
                  <button type="button" onClick={() => onOpenTab('flashcards')} className={linkClass}>
                    Open flashcards
                  </button>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function QuestionReview({ result, number, onJump }) {
  const { question, selected, isCorrect } = result
  const status = selected === null ? 'unanswered' : isCorrect ? 'correct' : 'incorrect'
  const statusView = {
    correct: { icon: CircleCheck, label: 'Correct', className: 'text-emerald-700' },
    incorrect: { icon: CircleX, label: 'Incorrect', className: 'text-rose-700' },
    unanswered: { icon: CircleHelp, label: 'Not answered', className: 'text-ink-500' },
  }[status]
  const StatusIcon = statusView.icon

  return (
    <article className="rounded-2xl border border-ink-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-500 tabular-nums">Q{number}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusView.className}`}>
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {statusView.label}
        </span>
        <DifficultyBadge difficulty={question.difficulty} />
        <span className="text-xs text-ink-500">{question.topic}</span>
      </div>
      <p className="mt-2 text-[15px] font-semibold text-ink-900">{question.question}</p>
      <ul className="mt-3 space-y-1.5">
        {question.options.map((option, i) => {
          const correct = i === question.correct_index
          const chosen = i === selected
          return (
            <li
              key={i}
              className={`flex flex-wrap items-start gap-x-2.5 gap-y-1 rounded-lg border px-3 py-2 text-sm ${
                correct
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : chosen
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-transparent text-ink-600'
              }`}
            >
              <span className="w-4 shrink-0 font-semibold">{LETTERS[i]}</span>
              <span className="min-w-0 flex-1 basis-40">{option}</span>
              {correct && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
                  <CircleCheck className="size-3.5" aria-hidden="true" />
                  {chosen ? 'Your answer · correct' : 'Correct answer'}
                </span>
              )}
              {chosen && !correct && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
                  <CircleX className="size-3.5" aria-hidden="true" />
                  Your answer
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-3 rounded-xl bg-ink-50 p-3 text-sm leading-6 text-ink-600">
        <span className="font-semibold text-ink-900">Explanation: </span>
        {question.explanation}
        <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
          Source in lecture: <SourceChips sources={question.sources} onJump={onJump} />
        </span>
      </div>
    </article>
  )
}

function QuizResults({ lecture, quiz, attempt, attempts, filter, onFilterChange, onRetake, onBack, onJump, onOpenTab }) {
  const score = scoreQuiz(quiz, attempt.answers)
  const recommendations = buildRecommendations(lecture, quiz, attempt.answers)
  const position = attempts.findIndex((a) => a.id === attempt.id)
  const previous = position > 0 ? attempts[position - 1] : null
  const change = previous ? attempt.percent - previous.percent : null
  const best = Math.max(...attempts.slice(0, position + 1).map((a) => a.percent))
  const shown = filter === 'incorrect' ? score.results.filter((r) => !r.isCorrect) : score.results

  return (
    <div className="animate-fade-in space-y-6 p-4 sm:p-6">
      <section className="flex flex-col gap-5 rounded-2xl border border-ink-200 bg-ink-50 p-4 sm:flex-row sm:items-center sm:p-5">
        <ScoreRing percent={score.percent} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-500">Your score · {formatDate(attempt.submittedAt)}</p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
            <p className="text-3xl font-semibold tracking-tight text-ink-900 tabular-nums">
              {score.correct}/{score.total}
            </p>
            <p className="text-sm font-medium text-ink-600">{score.percent}% accuracy</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CircleCheck className="size-4" aria-hidden="true" />
              <span>{score.correct} correct</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-700">
              <CircleX className="size-4" aria-hidden="true" />
              <span>
                {score.incorrect} incorrect
                {score.unanswered > 0 && ` (${score.unanswered} unanswered)`}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            {previous ? (
              <>
                {change > 0 ? '+' : ''}
                {change} pts vs previous attempt ({previous.percent}%) · Best so far: {best}%
              </>
            ) : (
              'First attempt for this lecture. Retake the quiz later to track your progress.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
          <Button onClick={onRetake}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Retake quiz
          </Button>
          <Button variant="secondary" onClick={onBack}>
            <Target className="size-4" aria-hidden="true" />
            Performance dashboard
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <TopicChart topics={score.topics} />
          {score.weakTopics.length > 0 && (
            <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
              Weak topics (below 70%): {score.weakTopics.map((t) => t.topic).join(', ')}
            </p>
          )}
        </Card>
        <section>
          <SectionHeading icon={NotebookPen} as="h3" className="mb-2">
            Revision plan
          </SectionHeading>
          <Recommendations lecture={lecture} recommendations={recommendations} onJump={onJump} onOpenTab={onOpenTab} />
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading icon={ListChecks} className="text-base">
            Answers and explanations
          </SectionHeading>
          <div className="flex gap-1.5" role="group" aria-label="Filter questions">
            <FilterChip active={filter === 'all'} onClick={() => onFilterChange('all')}>
              All ({score.total})
            </FilterChip>
            <FilterChip active={filter === 'incorrect'} onClick={() => onFilterChange('incorrect')}>
              Incorrect ({score.incorrect})
            </FilterChip>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {shown.map((result) => (
            <QuestionReview
              key={result.question.id}
              result={result}
              number={quiz.questions.indexOf(result.question) + 1}
              onJump={onJump}
            />
          ))}
          {shown.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No incorrect answers. Well done!</p>}
        </div>
      </section>
    </div>
  )
}

function QuizSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-5 w-3/4" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 rounded-xl" />
      ))}
    </div>
  )
}

/** Quiz tab: configure, generate, take, and review MCQ quizzes, with local scoring and analytics. */
export default function QuizView({ lecture, onJump, onOpenTab }) {
  const job = useAiJob('quiz', lecture.id)
  const { quiz } = lecture
  const attempts = lecture.quizAttempts ?? []
  const [stored, setStored] = useState(() => sessions.get(lecture.id) ?? freshSession(quiz))
  const [storageFailed, setStorageFailed] = useState(false)

  // A newly generated quiz starts a fresh session (keeping the chosen count).
  const session = stored.quizId === (quiz?.generated_at ?? null) ? stored : freshSession(quiz, { count: stored.count })
  const update = (changes) => setStored({ ...session, ...changes })

  useEffect(() => {
    sessions.set(lecture.id, session)
  }, [lecture.id, session])

  if (job?.status === 'loading') {
    return (
      <GeneratingPanel job={job} label={`Generating a ${session.count}-question quiz…`} onCancel={() => cancelAiJob('quiz', lecture.id)}>
        <QuizSkeleton />
      </GeneratingPanel>
    )
  }

  const generate = (count) => {
    update({ count })
    startAiJob('quiz', lecture, { numQuestions: count })
  }
  const start = () => update({ mode: 'taking', answers: {}, index: 0 })
  const submit = () => {
    const attempt = createAttempt(quiz, session.answers)
    if (!saveAttempt(lecture, attempt)) setStorageFailed(true)
    update({ mode: 'results', attemptId: attempt.id, answers: {}, index: 0, filter: 'all' })
  }
  const exit = () => update({ mode: 'home', answers: {}, index: 0 })

  const attempt = session.mode === 'results' ? attempts.find((a) => a.id === session.attemptId && a.quizId === quiz?.generated_at) : null

  let content
  if (!quiz || session.mode === 'setup') {
    content = (
      <QuizSetup
        count={session.count}
        onCountChange={(count) => update({ count })}
        onGenerate={generate}
        onCancel={quiz ? () => update({ mode: 'home' }) : null}
        hasTranscript={lecture.segments.length > 0}
        replacing={Boolean(quiz)}
      />
    )
  } else if (session.mode === 'taking') {
    content = (
      <QuizTaking
        quiz={quiz}
        answers={session.answers}
        index={Math.min(session.index, quiz.questions.length - 1)}
        onAnswer={(questionId, option) => update({ answers: { ...session.answers, [questionId]: option } })}
        onGoTo={(index) => update({ index: Math.max(0, Math.min(index, quiz.questions.length - 1)) })}
        onSubmit={submit}
        onExit={exit}
      />
    )
  } else if (attempt) {
    content = (
      <QuizResults
        lecture={lecture}
        quiz={quiz}
        attempt={attempt}
        attempts={attempts}
        filter={session.filter ?? 'all'}
        onFilterChange={(filter) => update({ filter })}
        onRetake={start}
        onBack={() => update({ mode: 'home' })}
        onJump={onJump}
        onOpenTab={onOpenTab}
      />
    )
  } else {
    content = (
      <QuizHome
        quiz={quiz}
        attempts={attempts}
        onStart={start}
        onNewQuiz={() => update({ mode: 'setup' })}
        onViewAttempt={(attemptId) => update({ mode: 'results', attemptId, filter: 'all' })}
      />
    )
  }

  return (
    <>
      <AiJobAlerts
        job={job}
        errorTitle="Couldn't generate the quiz"
        what="Quiz"
        storageMessage="Browser storage is full or blocked, so this quiz will disappear when you reload the page."
        onRetry={() => generate(session.count)}
        onDismiss={() => dismissAiJob('quiz', lecture.id)}
      />
      {storageFailed && (
        <div className="p-4 pb-0 sm:px-5">
          <Alert tone="amber" icon={TriangleAlert}>
            Browser storage is full or blocked, so this attempt won&apos;t be kept after a reload.
          </Alert>
        </div>
      )}
      {content}
    </>
  )
}
