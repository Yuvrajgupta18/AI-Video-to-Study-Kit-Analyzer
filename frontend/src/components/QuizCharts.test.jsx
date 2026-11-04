import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AttemptsChart, TopicChart } from './QuizCharts'

const attempts = [
  { id: 'a1', quizId: 'old', submittedAt: '2026-10-20T10:00:00Z', correct: 2, total: 5, percent: 40, topics: [] },
  { id: 'a2', quizId: 'cur', submittedAt: '2026-10-26T10:00:00Z', correct: 8, total: 10, percent: 80, topics: [] },
]

describe('AttemptsChart', () => {
  it('labels the latest column and shows a tooltip on focus', () => {
    render(<AttemptsChart attempts={attempts} currentQuizId="cur" />)
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.focus(screen.getByRole('button', { name: /Attempt 1, .*40% \(2 of 5\), earlier quiz/ }))
    expect(screen.getByRole('tooltip').textContent).toContain('40% · 2/5')
  })

  it('offers every value in a table view', () => {
    render(<AttemptsChart attempts={attempts} currentQuizId="cur" />)
    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent)
    expect(rows[0]).toContain('40% (2/5)')
    expect(rows[0]).toContain('Earlier')
    expect(rows[1]).toContain('Current')
  })
})

describe('TopicChart', () => {
  it('labels every topic and marks weak ones with text, not just color', () => {
    render(
      <TopicChart
        topics={[
          { topic: 'Optimization', correct: 1, total: 3, percent: 33 },
          { topic: 'Neurons', correct: 3, total: 3, percent: 100 },
        ]}
      />,
    )
    expect(screen.getAllByText('Needs revision')).toHaveLength(1)
    expect(screen.getByText('Optimization').closest('li').textContent).toContain('33% · 1/3')
    expect(screen.getByText('Neurons').closest('li').textContent).not.toContain('Needs revision')
  })
})
