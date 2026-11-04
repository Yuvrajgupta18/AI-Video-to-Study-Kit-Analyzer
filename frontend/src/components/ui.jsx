import { ChevronDown, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFocusTrap } from '../lib/useFocusTrap'

// --- Buttons -------------------------------------------------------------------

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

const BUTTON_SIZES = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-4 text-sm',
}

const BUTTON_VARIANTS = {
  primary: 'bg-primary text-white shadow-card hover:bg-primary-hover',
  secondary: 'border border-ink-200 bg-surface text-ink-800 shadow-card hover:border-ink-300 hover:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-rose-600 text-white shadow-card hover:bg-rose-700 dark:hover:bg-rose-500',
  'danger-ghost': 'text-rose-700 hover:bg-rose-50',
}

function buttonClasses(variant, size, className) {
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`
}

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />
}

export function ButtonLink({ variant = 'primary', size = 'md', className = '', ...props }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />
}

/** Icon-only button. `label` is its accessible name and tooltip. */
export function IconButton({ icon: Icon, label, tone = 'neutral', className = '', ...props }) {
  const tones = {
    neutral: 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
    danger: 'text-ink-500 hover:bg-rose-50 hover:text-rose-700',
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${tones[tone]} ${className}`}
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}

// --- Surfaces and headings -----------------------------------------------------

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl border border-ink-200 bg-surface shadow-card ${className}`} {...props}>
      {children}
    </div>
  )
}

export function PageHeader({ title, description, actions }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionHeading({ icon: Icon, as: Tag = 'h2', children, className = '' }) {
  return (
    <Tag className={`flex items-center gap-2 text-sm font-semibold text-ink-900 ${className}`}>
      {Icon && <Icon className="size-4 text-accent-500" aria-hidden="true" />}
      {children}
    </Tag>
  )
}

/** Toolbar row at the top of a card: description on the left, actions on the right. */
export function CardToolbar({ children, actions, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 border-b border-ink-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const ICON_TILE_TONES = {
  accent: 'bg-accent-50 text-accent-600 dark:text-accent-700',
  neutral: 'bg-ink-100 text-ink-600',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
}

export function IconTile({ icon: Icon, tone = 'accent', size = 'md', className = '' }) {
  const sizes = { sm: 'size-8 rounded-lg [&>svg]:size-4', md: 'size-10 rounded-xl [&>svg]:size-5', lg: 'size-12 rounded-xl [&>svg]:size-6' }
  return (
    <span className={`flex shrink-0 items-center justify-center ${sizes[size]} ${ICON_TILE_TONES[tone]} ${className}`} aria-hidden="true">
      <Icon />
    </span>
  )
}

export function EmptyState({ icon, title, description, action, headingLevel: Heading = 'h2' }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <IconTile icon={icon} size="lg" />
      <Heading className="mt-4 text-base font-semibold text-ink-900">{title}</Heading>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Headline number. `change` is a signed difference in points against the previous attempt. */
export function StatCard({ icon: Icon, label, value, hint, change, className = '' }) {
  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-ink-500 sm:text-sm">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-ink-400" aria-hidden="true" />}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
      {change !== undefined && change !== null && (
        <p className={`mt-1 text-xs font-medium ${change > 0 ? 'text-emerald-700' : change < 0 ? 'text-rose-700' : 'text-ink-500'}`}>
          {change > 0 ? '+' : ''}
          {change} pts vs previous attempt
        </p>
      )}
      {hint && <p className="mt-1 truncate text-xs text-ink-500">{hint}</p>}
    </Card>
  )
}

// --- Small elements ------------------------------------------------------------

const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-700',
  accent: 'bg-accent-50 text-accent-700',
  amber: 'bg-amber-50 text-amber-800',
  emerald: 'bg-emerald-50 text-emerald-800',
  rose: 'bg-rose-50 text-rose-800',
}

export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-ink-200 bg-ink-50 px-1 font-sans text-[11px] font-medium text-ink-600">
      {children}
    </kbd>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-ink-100 ${className}`} aria-hidden="true" />
}

export function ProgressBar({ value = 0, max = 100, label, indeterminate = false, className = '' }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : value}
      className={`h-1.5 overflow-hidden rounded-full bg-ink-100 ${className}`}
    >
      {indeterminate ? (
        <div className="animate-indeterminate h-full w-1/3 rounded-full bg-primary" />
      ) : (
        <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
      )}
    </div>
  )
}

// --- Form controls -------------------------------------------------------------

const FIELD =
  'h-9 w-full rounded-lg border border-ink-200 bg-surface text-sm text-ink-900 shadow-card transition-colors duration-150 placeholder:text-ink-500 hover:border-ink-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none'

export function SearchInput({ value, onChange, placeholder, label, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${FIELD} pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export function Select({ label, className = '', children, ...props }) {
  return (
    <div className={`relative ${className}`}>
      <select aria-label={label} className={`${FIELD} cursor-pointer appearance-none pr-8 pl-3`} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
    </div>
  )
}

export function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors duration-150 active:scale-[0.98] ${
        active ? 'border-accent-200 bg-accent-50 text-accent-700' : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300 hover:text-ink-900'
      }`}
    >
      {children}
    </button>
  )
}

/** Connected toggle buttons, e.g. grid/list view. */
export function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-100 p-0.5">
      {options.map(({ id, label: optionLabel, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          aria-label={optionLabel}
          title={optionLabel}
          onClick={() => onChange(id)}
          className={`flex h-full w-8 items-center justify-center rounded-md transition-colors duration-150 ${
            value === id ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900'
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

// --- Feedback ------------------------------------------------------------------

export function Alert({ tone = 'rose', icon: Icon, title, children }) {
  const tones = {
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  }
  return (
    <div role="alert" className={`animate-fade-in flex gap-3 rounded-xl border p-4 ${tones[tone]}`}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
    </div>
  )
}

/**
 * Modal confirmation. Escape or the backdrop cancels. For `tone="danger"` the safe
 * choice (Cancel) starts focused so a stray Enter can't delete anything.
 */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', tone = 'default', onConfirm, onCancel }) {
  const ref = useFocusTrap()
  const danger = tone === 'danger'
  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="animate-fade-in absolute inset-0 bg-scrim" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="animate-scale-in relative w-full max-w-md rounded-2xl border border-ink-200 bg-surface p-6 shadow-overlay"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold break-words text-ink-900">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-ink-500">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} data-autofocus={danger ? true : undefined}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={danger ? undefined : true}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
