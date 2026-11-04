import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog, ProgressBar, SearchInput, SegmentedControl } from './ui'

function Dialog(props) {
  return (
    <ConfirmDialog title="Delete it?" confirmLabel="Delete" onConfirm={() => {}} onCancel={() => {}} {...props}>
      <p>Body</p>
    </ConfirmDialog>
  )
}

describe('ConfirmDialog', () => {
  it('focuses the confirm button by default, and Cancel for destructive actions', () => {
    const { unmount } = render(<Dialog />)
    expect(document.activeElement.textContent).toBe('Delete')
    unmount()
    render(<Dialog tone="danger" />)
    expect(document.activeElement.textContent).toBe('Cancel')
  })

  it('cancels on Escape and restores focus to the trigger', () => {
    const onCancel = vi.fn()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const { unmount } = render(<Dialog onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('keeps Tab inside the dialog', () => {
    render(<Dialog />)
    const confirm = screen.getByRole('button', { name: 'Delete' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })

    confirm.focus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)

    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })
})

describe('form and feedback controls', () => {
  it('clears a search input', () => {
    const onChange = vi.fn()
    render(<SearchInput value="abc" onChange={onChange} label="Search" />)
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('exposes the selected segment', () => {
    const onChange = vi.fn()
    const Icon = () => null
    render(
      <SegmentedControl
        label="Layout"
        value="grid"
        onChange={onChange}
        options={[
          { id: 'grid', label: 'Grid view', icon: Icon },
          { id: 'list', label: 'List view', icon: Icon },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Grid view' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(onChange).toHaveBeenCalledWith('list')
  })

  it('reports progress values, and none when indeterminate', () => {
    const { rerender } = render(<ProgressBar value={2} max={4} label="Progress" />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2')
    rerender(<ProgressBar indeterminate label="Progress" />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()
  })
})
