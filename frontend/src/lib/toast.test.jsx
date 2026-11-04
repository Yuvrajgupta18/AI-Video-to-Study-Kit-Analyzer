import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Toaster from '../components/Toaster'
import { toast } from './toast'

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('announces a toast, then dismisses it automatically', () => {
    render(<Toaster />)
    act(() => {
      toast({ title: 'Lecture deleted', description: 'ML Basics', duration: 1000 })
    })
    expect(screen.getByRole('status').textContent).toContain('Lecture deleted')
    expect(screen.getByRole('status').textContent).toContain('ML Basics')

    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('can be dismissed by hand', () => {
    render(<Toaster />)
    act(() => {
      toast({ title: 'Chat cleared' })
    })
    fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.runAllTimers())
  })
})
