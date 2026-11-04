import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import QuizView from './QuizView'
import { generateQuiz } from '../lib/api'
import { addLecture, deleteLecture, useLecture } from '../lib/lectures'
import { QUIZ, makeLecture } from '../test/fixtures'

vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal()), generateQuiz: vi.fn() }))

function Harness({ id, onJump = () => {}, onOpenTab = () => {} }) {
  const lecture = useLecture(id)
  return lecture ? <QuizView lecture={lecture} onJump={onJump} onOpenTab={onOpenTab} /> : null
}

let lecture
function setup(overrides = {}, props = {}) {
  lecture = makeLecture(overrides)
  addLecture(lecture)
  return render(<Harness id={lecture.id} {...props} />)
}

const stored = () => JSON.parse(localStorage.getItem('studykit.lectures.v1')).find((l) => l.id === lecture.id)
const click = (name) => fireEvent.click(screen.getByRole('button', { name }))
// Accessible name excludes the aria-hidden A–D letter badge.
const radio = (name) => screen.getByRole('radio', { name })
const choose = (name) => fireEvent.click(radio(name))
const body = () => document.body.textContent

/** Answers question 1 correctly, question 2 wrongly, and leaves question 3 blank. */
function answerTwoOfThree() {
  choose('Labeled examples')
  click(/^next$/i)
  choose('The learning rate')
}

function submit() {
  click(/^submit quiz$/i)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /submit quiz/i }))
}

describe('QuizView', () => {
  beforeEach(() => generateQuiz.mockReset())
  afterEach(() => {
    vi.restoreAllMocks()
    deleteLecture(lecture.id)
  })

  it('configures the question count and generates a quiz with a loading state', async () => {
    let resolve
    generateQuiz.mockReturnValue(new Promise((r) => (resolve = r)))
    setup()

    fireEvent.click(screen.getByLabelText(/^5/))
    click(/generate 5-question quiz/i)

    expect(await screen.findByText(/Generating a 5-question quiz/)).toBeTruthy()
    expect(generateQuiz).toHaveBeenCalledWith(expect.objectContaining({ id: lecture.id }), expect.objectContaining({ numQuestions: 5 }))

    await act(async () => resolve(QUIZ))
    expect(screen.getByText('Practice quiz · 3 questions')).toBeTruthy()
    expect(screen.getByText(/You asked for 5 questions, but this lecture only supported 3/)).toBeTruthy()
    expect(stored().quiz).toEqual(QUIZ)
  })

  it('shows API errors and retries with the same question count', async () => {
    const rateLimited = Object.assign(new AxiosError('fail'), {
      response: { status: 429, data: { detail: "Gemini's rate limit or quota was reached. Wait a minute and try again." } },
    })
    generateQuiz.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce(QUIZ)
    setup()

    fireEvent.click(screen.getByLabelText(/^20/))
    click(/generate 20-question quiz/i)
    expect(await screen.findByText(/rate limit or quota was reached/)).toBeTruthy()

    await act(async () => click(/try again/i))
    expect(generateQuiz).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ numQuestions: 20 }))
    expect(screen.getByText('Practice quiz · 3 questions')).toBeTruthy()
  })

  it('shows one question at a time with navigation and progress, keeping answers hidden', () => {
    setup({ quiz: QUIZ })
    click(/start quiz/i)

    expect(screen.getByText('Question 1 of 3')).toBeTruthy()
    expect(screen.getByText('0 of 3 answered')).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    // Nothing reveals the correct answer before submission.
    expect(body()).not.toMatch(/Correct answer|Explanation|labeled examples\./)

    choose('Labeled examples')
    expect(screen.getByText('1 of 3 answered')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')
    expect(body()).not.toMatch(/Correct answer|Incorrect/)

    click(/^next$/i)
    expect(screen.getByText('Question 2 of 3')).toBeTruthy()
    click(/^previous$/i)
    expect(radio('Labeled examples').checked).toBe(true)

    click('Question 3')
    expect(screen.getByText('Question 3 of 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^next$/i }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeTruthy()
  })

  it('confirms before submitting, then scores locally and saves the attempt', () => {
    setup({ quiz: QUIZ })
    click(/start quiz/i)
    answerTwoOfThree()

    click(/^submit quiz$/i)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('You answered 2 of 3 questions. The 1 unanswered question will be marked incorrect.')
    fireEvent.click(within(dialog).getByRole('button', { name: /keep working/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Question 2 of 3')).toBeTruthy()

    submit()
    expect(generateQuiz).not.toHaveBeenCalled() // evaluation needs no AI call
    expect(screen.getByText('1/3')).toBeTruthy()
    expect(screen.getByText('33% accuracy')).toBeTruthy()
    expect(screen.getByText('1 correct')).toBeTruthy()
    expect(screen.getByText(/2 incorrect \(1 unanswered\)/)).toBeTruthy()
    expect(screen.getByText('First attempt for this lecture. Retake the quiz later to track your progress.')).toBeTruthy()

    // Explanations and correct answers are now visible.
    expect(screen.getByText('Gradient descent is an optimization method that minimizes a loss function.')).toBeTruthy()
    expect(screen.getAllByText('Correct answer').length).toBe(2)
    expect(screen.getByText('Your answer · correct')).toBeTruthy()
    expect(screen.getByText('Not answered')).toBeTruthy()

    // Topic performance, weak topics, and the revision plan.
    expect(screen.getByText('Accuracy by topic')).toBeTruthy()
    expect(screen.getByText(/Weak topics \(below 70%\): Optimization, Supervised learning/)).toBeTruthy()
    expect(screen.getByText('High priority')).toBeTruthy()
    expect(screen.getByText('Rewatch 0:07–0:13 in the lecture, where this is explained.')).toBeTruthy()

    const [attempt] = stored().quizAttempts
    expect(attempt).toMatchObject({ quizId: QUIZ.generated_at, correct: 1, total: 3, percent: 33, answers: { 'q-1': 1, 'q-2': 1 } })
  })

  it('filters the review to incorrect answers and links sources to the transcript', () => {
    const onJump = vi.fn()
    setup({ quiz: QUIZ }, { onJump })
    click(/start quiz/i)
    answerTwoOfThree()
    submit()

    click(/incorrect \(2\)/i)
    expect(screen.queryByText('What do supervised models learn from?')).toBeNull()
    expect(screen.getByText('What does gradient descent minimize?')).toBeTruthy()

    const review = screen.getByText('What does gradient descent minimize?').closest('article')
    fireEvent.click(within(review).getByRole('button', { name: '0:07–0:13' }))
    expect(onJump).toHaveBeenCalledWith({ start: 7.88, end: 13.44 })
  })

  it('retakes the quiz, compares with the previous score, and shows the performance dashboard', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1)
    setup({ quiz: QUIZ })
    click(/start quiz/i)
    answerTwoOfThree()
    submit()

    click(/retake quiz/i)
    expect(screen.getByText('0 of 3 answered')).toBeTruthy() // fresh attempt
    choose('Labeled examples')
    click(/^next$/i)
    choose('A loss function')
    click(/^next$/i)
    choose('Labels give the target to learn')
    submit()

    expect(screen.getByText('3/3')).toBeTruthy()
    expect(screen.getByText(/\+67 pts vs previous attempt \(33%\) · Best so far: 100%/)).toBeTruthy()
    expect(screen.getByText('Perfect score, no weak topics')).toBeTruthy()

    click(/performance dashboard/i)
    expect(screen.getByText('Your performance')).toBeTruthy()
    expect(screen.getByText(/\+67 pts vs previous attempt/)).toBeTruthy()
    expect(screen.getByText('Score by attempt')).toBeTruthy()
    expect(screen.getByText('Accuracy by topic (latest attempt)')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retake quiz/i })).toBeTruthy()
    expect(stored().quizAttempts.map((a) => a.percent)).toEqual([33, 100])

    click('View results of attempt 1')
    expect(screen.getByText('1/3')).toBeTruthy()
  })

  it('exits a quiz in progress only after confirmation', () => {
    setup({ quiz: QUIZ })
    click(/start quiz/i)
    choose('Labeled examples')

    click(/exit quiz/i)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /keep working/i }))
    expect(screen.getByText('Question 1 of 3')).toBeTruthy()
    expect(radio('Labeled examples').checked).toBe(true)

    click(/exit quiz/i)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /leave quiz/i }))
    expect(screen.getByRole('button', { name: /start quiz/i })).toBeTruthy()
    expect(stored().quizAttempts ?? []).toEqual([])
  })

  it('exits immediately when nothing has been answered', () => {
    setup({ quiz: QUIZ })
    click(/start quiz/i)
    click(/exit quiz/i)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /start quiz/i })).toBeTruthy()
  })

  it('creates a new quiz while keeping past scores', async () => {
    const newQuiz = { ...QUIZ, questions: QUIZ.questions.slice(0, 2), requested: 10, generated_at: '2026-10-27T00:00:00+00:00' }
    generateQuiz.mockResolvedValue(newQuiz)
    setup({ quiz: QUIZ, quizAttempts: [{ id: 'old', quizId: QUIZ.generated_at, submittedAt: '2026-10-26T13:00:00Z', answers: {}, correct: 1, total: 3, percent: 33, topics: [] }] })

    click(/new quiz/i)
    expect(screen.getByText('The current quiz will be replaced. Your past scores are kept.')).toBeTruthy()
    await act(async () => click(/generate 10-question quiz/i))

    expect(screen.getByText('Practice quiz · 2 questions')).toBeTruthy()
    expect(screen.getByText('earlier quiz')).toBeTruthy()
    expect(stored().quizAttempts).toHaveLength(1)
  })
})
