import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Library, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, Upload, X } from 'lucide-react'
import BackendStatus from './BackendStatus'
import JobIndicator from './JobIndicator'
import Toaster from './Toaster'
import { IconButton } from './ui'
import { toggleTheme, useIsDark } from '../lib/theme'
import { useFocusTrap } from '../lib/useFocusTrap'
import { usePreference } from '../lib/usePreference'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/upload', label: 'Upload Lecture', icon: Upload },
  { to: '/lectures', label: 'My Lectures', icon: Library },
]

/** Video becoming notes: the StudyKit mark (matches the favicon). */
function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M8 11.2c0-.9 1-1.5 1.8-1l6 3.8c.7.5.7 1.5 0 2l-6 3.8c-.8.5-1.8-.1-1.8-1z" fill="#fff" />
      <path d="M19.5 11h5M19.5 15.5h5M19.5 20h3" stroke="#c7d2fe" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function Brand({ collapsed = false, onNavigate }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label="StudyKit home">
      <BrandMark />
      {!collapsed && <span className="truncate text-[15px] font-semibold tracking-tight text-ink-900">StudyKit</span>}
    </Link>
  )
}

/** Tooltip for icon-only sidebar controls; the visible name stays available to screen readers. */
function RailTooltip({ children }) {
  return (
    <span
      className="pointer-events-none absolute left-full z-50 ml-3 rounded-md bg-ink-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-surface opacity-0 shadow-overlay transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

function NavItem({ to, label, icon: Icon, end, collapsed, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex h-9 items-center gap-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${collapsed ? 'justify-center' : 'px-2.5'} ${
          isActive ? 'bg-accent-50 text-accent-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-primary dark:bg-accent-400" aria-hidden="true" />}
          <Icon className={`size-[18px] shrink-0 ${isActive ? '' : 'text-ink-500 group-hover:text-ink-700'}`} aria-hidden="true" />
          <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
          {collapsed && <RailTooltip>{label}</RailTooltip>}
        </>
      )}
    </NavLink>
  )
}

function ThemeToggle({ collapsed }) {
  const dark = useIsDark()
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  const Icon = dark ? Sun : Moon
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      className={`group relative flex h-9 w-full items-center gap-2.5 rounded-lg text-sm font-medium text-ink-600 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900 ${
        collapsed ? 'justify-center' : 'px-2.5'
      }`}
    >
      <Icon className="size-[18px] shrink-0 text-ink-500" aria-hidden="true" />
      {!collapsed && (dark ? 'Light mode' : 'Dark mode')}
      {collapsed && <RailTooltip>{label}</RailTooltip>}
    </button>
  )
}

function SidebarContent({ collapsed = false, onToggle, onNavigate, closeButton }) {
  return (
    <div className="flex h-full flex-col px-3 py-3">
      <div className={`flex h-10 items-center gap-2 ${collapsed ? 'justify-center' : 'justify-between pl-1'}`}>
        <Brand collapsed={collapsed} onNavigate={onNavigate} />
        {!collapsed && onToggle && <IconButton icon={PanelLeftClose} label="Collapse sidebar" aria-expanded="true" onClick={onToggle} />}
        {closeButton}
      </div>

      <nav aria-label="Main" className="mt-5 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <JobIndicator collapsed={collapsed} onNavigate={onNavigate} />
        <div className="flex flex-col gap-0.5 border-t border-ink-200 pt-2">
          {collapsed && onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              aria-expanded="false"
              className="group relative flex h-9 w-full items-center justify-center rounded-lg text-ink-500 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900"
            >
              <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
              <RailTooltip>Expand sidebar</RailTooltip>
            </button>
          )}
          <ThemeToggle collapsed={collapsed} />
          <BackendStatus collapsed={collapsed} />
        </div>
      </div>
    </div>
  )
}

function MobileDrawer({ onClose }) {
  const ref = useFocusTrap()
  return (
    <div
      ref={ref}
      className="fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <div className="animate-fade-in absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        data-autofocus
        tabIndex={-1}
        className="animate-slide-in absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-ink-200 bg-surface shadow-overlay focus:outline-none"
      >
        <SidebarContent onNavigate={onClose} closeButton={<IconButton icon={X} label="Close navigation" onClick={onClose} />} />
      </aside>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebar, setSidebar] = usePreference('studykit.sidebar', 'expanded', ['expanded', 'collapsed'])
  const collapsed = sidebar === 'collapsed'
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-lg bg-surface px-3 py-2 text-sm font-medium text-ink-900 shadow-overlay focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70]"
      >
        Skip to content
      </a>

      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-ink-200 bg-surface transition-[width] duration-200 ease-out lg:block ${
          collapsed ? 'w-[68px]' : 'w-60'
        }`}
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setSidebar(collapsed ? 'expanded' : 'collapsed')} />
      </aside>

      {mobileOpen && <MobileDrawer onClose={() => setMobileOpen(false)} />}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-ink-200 bg-surface px-3 lg:hidden">
        <IconButton icon={Menu} label="Open navigation" className="size-9" onClick={() => setMobileOpen(true)} />
        <Brand />
      </header>

      <main id="main" tabIndex={-1} className={`transition-[padding] duration-200 ease-out focus:outline-none ${collapsed ? 'lg:pl-[68px]' : 'lg:pl-60'}`}>
        <div className="page-enter mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>

      <Toaster />
    </div>
  )
}
