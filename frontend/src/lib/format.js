const pad = (value) => String(value).padStart(2, '0')

/** 75.4 -> "1:15", 3725 -> "1:02:05" */
export function formatTimestamp(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** 3725 -> "1 h 2 min", 95 -> "1 min 35 s" */
export function formatDuration(seconds = 0) {
  const total = Math.round(seconds)
  if (total < 60) return `${total} s`
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`
  const s = total % 60
  return s > 0 ? `${m} min ${s} s` : `${m} min`
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatNumber(value = 0) {
  return value.toLocaleString()
}

const languageNames =
  typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'language' }) : null

/** "en" -> "English" (falls back to the raw code) */
export function formatLanguage(code) {
  if (!code) return 'Unknown'
  try {
    return languageNames?.of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}
