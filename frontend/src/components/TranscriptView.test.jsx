import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import TranscriptView from './TranscriptView'
import { makeLecture } from '../test/fixtures'

describe('TranscriptView', () => {
  it('renders timestamped segments', () => {
    render(<TranscriptView lecture={makeLecture()} />)
    expect(screen.getByText('5 segments')).toBeTruthy()
    expect(screen.getByText('0:07 – 0:10')).toBeTruthy()
  })

  it('highlights the segments inside a note source range', () => {
    const { container } = render(<TranscriptView lecture={makeLecture()} focusRange={{ start: 3.08, end: 7.88 }} />)
    const focused = [...container.querySelectorAll('li[data-focused="true"]')].map((li) => li.textContent)
    expect(focused).toHaveLength(2)
    expect(focused[0]).toContain('supervised learning')
    expect(focused[1]).toContain('labeled examples')
  })
})
