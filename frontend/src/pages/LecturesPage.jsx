import { useState } from 'react'
import { Clock, LayoutGrid, Library, List, Plus, SearchX, Sparkles, Target, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import DeleteLectureDialog from '../components/DeleteLectureDialog'
import { LectureCard, LectureListRow } from '../components/LectureCard'
import { Button, ButtonLink, Card, EmptyState, PageHeader, SearchInput, SegmentedControl, Select, StatCard } from '../components/ui'
import { formatDuration, formatNumber } from '../lib/format'
import { SORT_OPTIONS, libraryStats, sortLectures } from '../lib/lectureStats'
import { useLectures } from '../lib/lectures'
import { usePreference } from '../lib/usePreference'

const VIEWS = [
  { id: 'grid', label: 'Grid view', icon: LayoutGrid },
  { id: 'list', label: 'List view', icon: List },
]

/** Fills out the grid and keeps the next action in reach. */
function AddLectureTile() {
  return (
    <Link
      to="/upload"
      className="flex min-h-48 h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-300 p-5 text-center text-ink-500 transition-colors duration-150 hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700"
    >
      <Plus className="size-5" aria-hidden="true" />
      <span className="text-sm font-medium">Add a lecture</span>
    </Link>
  )
}

export default function LecturesPage() {
  const lectures = useLectures()
  const [query, setQuery] = useState('')
  const [sort, setSort] = usePreference('studykit.lectures.sort', 'newest', SORT_OPTIONS.map((option) => option.id))
  const [view, setView] = usePreference('studykit.lectures.view', 'grid', VIEWS.map((option) => option.id))
  const [deleting, setDeleting] = useState(null)

  const needle = query.trim().toLowerCase()
  const matching = needle
    ? lectures.filter((l) => l.title.toLowerCase().includes(needle) || l.transcript.toLowerCase().includes(needle))
    : lectures
  const visible = sortLectures(matching, sort)
  const stats = libraryStats(lectures)

  return (
    <>
      <PageHeader
        title="My Lectures"
        description="Your lecture library. Everything is saved in this browser, so clearing site data removes it."
        actions={
          <ButtonLink to="/upload">
            <Upload className="size-4" aria-hidden="true" />
            Upload Lecture
          </ButtonLink>
        }
      />

      {lectures.length === 0 ? (
        <Card>
          <EmptyState
            icon={Library}
            title="Your library is empty"
            description="Lectures you transcribe will appear here, with their study materials and quiz results."
            action={
              <ButtonLink to="/upload">
                <Upload className="size-4" aria-hidden="true" />
                Upload your first lecture
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Library summary" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
            <StatCard icon={Library} label="Lectures" value={formatNumber(stats.lectureCount)} />
            <StatCard icon={Clock} label="Total length" value={formatDuration(stats.totalSeconds)} />
            <StatCard icon={Sparkles} label="Study materials" value={formatNumber(stats.materialCount)} />
            <StatCard icon={Target} label="Average quiz score" value={stats.averageScore === null ? '–' : `${stats.averageScore}%`} />
          </section>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center lg:mt-6">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search titles and transcripts"
              label="Search lectures"
              className="flex-1"
            />
            <div className="flex items-center gap-2">
              <Select label="Sort lectures" value={sort} onChange={(event) => setSort(event.target.value)} className="flex-1 sm:w-44 sm:flex-none">
                {SORT_OPTIONS.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
              <SegmentedControl label="Layout" options={VIEWS} value={view} onChange={setView} />
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-500" aria-live="polite">
            {needle
              ? `${visible.length} of ${lectures.length} ${lectures.length === 1 ? 'lecture matches' : 'lectures match'} “${query.trim()}”`
              : `${lectures.length} ${lectures.length === 1 ? 'lecture' : 'lectures'}`}
          </p>

          <div className="mt-3">
            {visible.length === 0 ? (
              <Card>
                <EmptyState
                  icon={SearchX}
                  title="No lectures match your search"
                  description="Try a different word. Search looks through titles and transcripts."
                  action={
                    <Button variant="secondary" onClick={() => setQuery('')}>
                      Clear search
                    </Button>
                  }
                />
              </Card>
            ) : view === 'grid' ? (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((lecture) => (
                  <li key={lecture.id}>
                    <LectureCard lecture={lecture} onDelete={setDeleting} />
                  </li>
                ))}
                {!needle && (
                  <li>
                    <AddLectureTile />
                  </li>
                )}
              </ul>
            ) : (
              <Card className="overflow-clip">
                <ul className="divide-y divide-ink-100">
                  {visible.map((lecture) => (
                    <li key={lecture.id}>
                      <LectureListRow lecture={lecture} onDelete={setDeleting} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </>
      )}

      {deleting && <DeleteLectureDialog lecture={deleting} onCancel={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />}
    </>
  )
}
