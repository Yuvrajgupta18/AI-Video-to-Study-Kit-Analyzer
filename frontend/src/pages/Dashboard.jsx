import { ArrowRight, ChevronRight, Clock, FileText, Layers, Library, ListChecks, MessagesSquare, NotebookPen, Sparkles, Target, TriangleAlert, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, ButtonLink, Card, IconTile, PageHeader, SectionHeading, StatCard } from '../components/ui'
import { LectureCompactRow } from '../components/LectureCard'
import { formatDate, formatDuration, formatNumber } from '../lib/format'
import { latestScore, lectureMaterials, libraryStats } from '../lib/lectureStats'
import { useLectures } from '../lib/lectures'

const RECENT_LIMIT = 5

const GET_STARTED = [
  { icon: Upload, title: 'Upload a recording', text: 'Add an MP4, MP3, WAV, or M4A lecture.' },
  { icon: FileText, title: 'Get a transcript', text: 'Whisper writes it out with a timestamp for every segment.' },
  { icon: Sparkles, title: 'Study with AI', text: 'Generate notes, flashcards, and quizzes, or ask questions.' },
]

const TOOLS = [
  { icon: NotebookPen, label: 'Notes', text: 'Summaries, topics, and key concepts' },
  { icon: Layers, label: 'Flashcards', text: 'Active recall with revision tracking' },
  { icon: ListChecks, label: 'Quiz', text: 'Practice questions with analytics' },
  { icon: MessagesSquare, label: 'Ask AI', text: 'Answers cited from your lecture' },
]

function materialsHint({ notes, decks, quizzes, materialCount }) {
  if (materialCount === 0) return 'Nothing generated yet'
  return [
    notes && `${notes} ${notes === 1 ? 'note set' : 'note sets'}`,
    decks && `${decks} ${decks === 1 ? 'deck' : 'decks'}`,
    quizzes && `${quizzes} ${quizzes === 1 ? 'quiz' : 'quizzes'}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** What each study tool holds for a lecture, from its saved data. */
function quickActions(lecture) {
  const materials = lectureMaterials(lecture)
  const score = latestScore(lecture)
  const cardCount = lecture.flashcards?.cards?.length ?? 0
  const toRevise = Object.values(lecture.flashcardProgress ?? {}).filter((status) => status === 'review').length
  const messages = lecture.chat?.length ?? 0
  return [
    { tab: 'notes', label: 'Notes', icon: NotebookPen, status: materials.notes ? 'Ready to read' : 'Not generated yet' },
    {
      tab: 'flashcards',
      label: 'Flashcards',
      icon: Layers,
      status: materials.flashcards ? `${cardCount} cards${toRevise ? ` · ${toRevise} to revise` : ''}` : 'Not generated yet',
    },
    {
      tab: 'quiz',
      label: 'Quiz',
      icon: ListChecks,
      status: score !== null ? `Last score ${score}%` : materials.quiz ? 'Ready to start' : 'Not generated yet',
    },
    { tab: 'ask', label: 'Ask AI', icon: MessagesSquare, status: messages ? `${messages} messages` : 'Ask a question' },
  ]
}

function QuickAccess({ lecture }) {
  return (
    <Card className="p-4 sm:p-5">
      <SectionHeading>Quick access</SectionHeading>
      <p className="mt-1 truncate text-xs text-ink-500">Continue with {lecture.title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {quickActions(lecture).map(({ tab, label, icon, status }) => (
          <Link
            key={tab}
            to={`/lectures/${lecture.id}?tab=${tab}`}
            className="group rounded-xl border border-ink-200 p-3 transition-colors duration-150 hover:border-accent-200 hover:bg-accent-50"
          >
            <IconTile icon={icon} size="sm" />
            <span className="mt-2.5 block text-sm font-medium text-ink-900">{label}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-500">{status}</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

function StudyFocus({ stats }) {
  const { weakTopics, knownCards, reviewCards, attemptCount } = stats
  const topics = weakTopics.slice(0, 3)
  const tracked = knownCards + reviewCards
  return (
    <Card className="p-4 sm:p-5">
      <SectionHeading icon={Target}>Study focus</SectionHeading>
      {tracked > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-500">Flashcards reviewed</span>
            <span className="font-medium text-ink-900 tabular-nums">
              {knownCards} known · {reviewCards} to revise
            </span>
          </div>
          <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {knownCards > 0 && <div className="bg-emerald-500" style={{ flexGrow: knownCards }} />}
            {reviewCards > 0 && <div className="bg-amber-500" style={{ flexGrow: reviewCards }} />}
          </div>
        </div>
      )}
      {topics.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {topics.map(({ topic, percent, lectureId, lectureTitle }) => (
            <li key={`${lectureId}-${topic}`}>
              <Link
                to={`/lectures/${lectureId}?tab=quiz`}
                className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-ink-100"
              >
                <TriangleAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">{topic}</span>
                  <span className="block truncate text-xs text-ink-500">{lectureTitle}</span>
                </span>
                <Badge tone="amber">{percent}%</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          {attemptCount > 0 ? 'No weak topics in your latest quizzes. Nice work!' : 'Take a quiz and your weakest topics will appear here.'}
        </p>
      )}
    </Card>
  )
}

/** First-run view: what the app does and how to start. */
function GettingStarted() {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">Create your first study kit</h2>
          <p className="mt-1 text-sm text-ink-500">Three steps from a recording to everything you need to revise.</p>
          <ol className="mt-6 space-y-4">
            {GET_STARTED.map(({ icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <IconTile icon={icon} size="sm" />
                <div>
                  <p className="text-sm font-medium text-ink-900">{title}</p>
                  <p className="mt-0.5 text-sm text-ink-500">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <ButtonLink to="/upload" size="lg" className="mt-6">
            <Upload className="size-4" aria-hidden="true" />
            Upload your first lecture
          </ButtonLink>
        </div>
        <div className="border-t border-ink-200 bg-ink-50 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <p className="text-sm font-medium text-ink-900">Included with every lecture</p>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TOOLS.map(({ icon: Icon, label, text }) => (
              <li key={label} className="rounded-xl border border-ink-200 bg-surface p-3">
                <Icon className="size-4 text-accent-500" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-ink-900">{label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const lectures = useLectures()
  const stats = libraryStats(lectures)
  const hasLectures = lectures.length > 0

  return (
    <>
      <PageHeader
        title={hasLectures ? 'Welcome back' : 'Welcome to StudyKit'}
        description={
          hasLectures
            ? `${formatNumber(stats.lectureCount)} ${stats.lectureCount === 1 ? 'lecture' : 'lectures'} in your library, last added ${formatDate(lectures[0].createdAt)}.`
            : 'Turn recorded lectures into transcripts, notes, flashcards, and quizzes.'
        }
        actions={
          <ButtonLink to="/upload">
            <Upload className="size-4" aria-hidden="true" />
            Upload Lecture
          </ButtonLink>
        }
      />

      <section aria-label="Library summary" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
        <StatCard icon={Library} label="Total lectures" value={formatNumber(stats.lectureCount)} hint={hasLectures ? 'Saved in this browser' : 'None yet'} />
        <StatCard icon={Clock} label="Total study time" value={hasLectures ? formatDuration(stats.totalSeconds) : '0 min'} hint="Combined lecture length" />
        <StatCard icon={Sparkles} label="Study materials" value={formatNumber(stats.materialCount)} hint={materialsHint(stats)} />
        <StatCard
          icon={Target}
          label="Average quiz score"
          value={stats.averageScore === null ? '–' : `${stats.averageScore}%`}
          hint={stats.attemptCount ? `From ${stats.attemptCount} ${stats.attemptCount === 1 ? 'attempt' : 'attempts'}` : 'No quizzes taken yet'}
        />
      </section>

      <div className="mt-4 lg:mt-6">
        {hasLectures ? (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-6">
            <div className="flex flex-col gap-4 lg:col-span-2 lg:gap-6">
              <Card className="overflow-clip">
                <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 sm:px-5">
                  <SectionHeading>Recent lectures</SectionHeading>
                  <Link
                    to="/lectures"
                    className="group inline-flex items-center gap-1 rounded text-xs font-medium text-accent-700 transition-colors duration-150 hover:text-accent-800"
                  >
                    View all
                    <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </div>
                <ul className="divide-y divide-ink-100">
                  {lectures.slice(0, RECENT_LIMIT).map((lecture) => (
                    <li key={lecture.id}>
                      <LectureCompactRow lecture={lecture} />
                    </li>
                  ))}
                </ul>
                {lectures.length > RECENT_LIMIT && (
                  <Link
                    to="/lectures"
                    className="flex items-center justify-center gap-1 border-t border-ink-100 px-4 py-2.5 text-xs font-medium text-ink-500 transition-colors duration-150 hover:bg-ink-50 hover:text-ink-900"
                  >
                    {lectures.length - RECENT_LIMIT} more in your library
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </Card>
              <StudyFocus stats={stats} />
            </div>

            <QuickAccess lecture={lectures[0]} />
          </div>
        ) : (
          <GettingStarted />
        )}
      </div>
    </>
  )
}
