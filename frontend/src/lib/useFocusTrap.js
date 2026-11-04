import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * For modal overlays: moves focus inside on open (to `[data-autofocus]` if present),
 * keeps Tab inside, locks page scroll, and restores focus on close.
 */
export function useFocusTrap() {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = () => [...node.querySelectorAll(FOCUSABLE)]
    ;(node.querySelector('[data-autofocus]') ?? focusables()[0])?.focus()

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const outside = !items.includes(document.activeElement) // focus is on the overlay itself
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    node.addEventListener('keydown', onKeyDown)

    return () => {
      node.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return ref
}
