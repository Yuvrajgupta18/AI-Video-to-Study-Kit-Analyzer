import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import FlashcardsView from './FlashcardsView'
import { generateFlashcards } from '../lib/api'
import { addLecture, deleteLecture, useLecture } from '../lib/lectures'
import { downloadTextFile } from '../lib/notesMarkdown'
import { FLASHCARDS, makeLecture } from '../test/fixtures'

vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal()), generateFlashcards: vi.fn() }))
vi.mock('../lib/notesMarkdown', async (importOriginal) => ({ ...(await importOriginal()), downloadTextFile: vi.fn() }))

function Harness({ id, onJump = () => {} }) {
  const lecture = useLecture(id)
  return lecture ? <FlashcardsView lecture={lecture} onJump={onJump} /> : null
}

let lecture
function setup(overrides = {}, onJump) {
  lecture = makeLecture(overrides)
  addLecture(lecture)
  render(<Harness id={lecture.id} onJump={onJump} />)
}

const stored = () => JSON.parse(localStorage.getItem('studykit.lectures.v1')).find((l) => l.id === lecture.id)
const card = () => screen.getByRole('button', { pressed: false, name: /Question/ })
const flipCard = () => screen.getAllByRole('button').find((b) => b.textContent.includes('Click to'))
const position = () => screen.getByText(/^Card \d+ of \d+$|^No cards$/).textContent
const click = (name) => fireEvent.click(screen.getByRole('button', { name }))

describe('FlashcardsView', () => {
  beforeEach(() => {
    generateFlashcards.mockReset()
    downloadTextFile.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    deleteLecture(lecture.id)
  })

  it('generates flashcards with a loading state and saves them to the lecture', async () => {
    let resolve
    generateFlashcards.mockReturnValue(new Promise((r) => (resolve = r)))
    setup()

    click(/generate flashcards/i)
    expect(await screen.findByText(/Generating flashcards/)).toBeTruthy()
    expect(generateFlashcards).toHaveBeenCalledWith(expect.objectContaining({ id: lecture.id, segments: lecture.segments }), expect.anything())

    await act(async () => resolve(FLASHCARDS))

    expect(position()).toBe('Card 1 of 3')
    expect(card().textContent).toContain('What is supervised learning?')
    expect(stored().flashcards).toEqual(FLASHCARDS)
    expect(stored().flashcardProgress).toEqual({})
  })

  it('shows a clear error and retries', async () => {
    const rateLimited = Object.assign(new AxiosError('fail'), {
      response: { status: 429, data: { detail: "Gemini's rate limit or quota was reached. Wait a minute and try again." } },
    })
    generateFlashcards.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce(FLASHCARDS)
    setup()

    click(/generate flashcards/i)
    expect(await screen.findByText(/rate limit or quota was reached/)).toBeTruthy()
    expect(screen.getByText("Couldn't generate flashcards")).toBeTruthy()

    await act(async () => click(/try again/i))
    expect(position()).toBe('Card 1 of 3')
    expect(screen.queryByText(/rate limit/)).toBeNull()
  })

  it('flips the card to reveal the answer and its source timestamps', () => {
    const onJump = vi.fn()
    setup({ flashcards: FLASHCARDS }, onJump)

    expect(flipCard().getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: '0:03–0:07' })).toBeNull()

    fireEvent.click(flipCard())
    expect(flipCard().getAttribute('aria-pressed')).toBe('true')
    const answerFace = screen.getByText('Learning from labeled examples.').closest('[aria-hidden]')
    expect(answerFace.getAttribute('aria-hidden')).toBe('false')

    click('0:03–0:07')
    expect(onJump).toHaveBeenCalledWith({ start: 3.08, end: 7.88 })
    expect(flipCard().getAttribute('aria-pressed')).toBe('true') // clicking a source doesn't flip back
  })

  it('navigates with Next, Previous, and arrow keys, resetting the flip', () => {
    setup({ flashcards: FLASHCARDS })
    const previous = screen.getByRole('button', { name: /previous/i })
    expect(previous.disabled).toBe(true)

    fireEvent.click(flipCard())
    click(/next/i)
    expect(position()).toBe('Card 2 of 3')
    expect(flipCard().getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(position()).toBe('Card 3 of 3')
    expect(screen.getByRole('button', { name: /next/i }).disabled).toBe(true)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    click(/previous/i)
    expect(position()).toBe('Card 1 of 3')
  })

  it('marks cards as known or needing revision, persists it, and advances', () => {
    setup({ flashcards: FLASHCARDS, flashcardProgress: {} })

    click(/^known$/i)
    expect(stored().flashcardProgress).toEqual({ 'card-1': 'known' })
    expect(position()).toBe('Card 2 of 3')

    click(/needs revision/i)
    expect(stored().flashcardProgress).toEqual({ 'card-1': 'known', 'card-2': 'review' })
    expect(screen.getByText('1 known')).toBeTruthy()
    expect(screen.getByText('1 need revision')).toBeTruthy()
    expect(screen.getByText('1 not yet marked')).toBeTruthy()

    // Clicking the active status again clears it and stays on the card.
    click(/previous/i)
    expect(screen.getByRole('button', { name: /needs revision/i }).getAttribute('aria-pressed')).toBe('true')
    click(/needs revision/i)
    expect(stored().flashcardProgress).toEqual({ 'card-1': 'known' })
    expect(position()).toBe('Card 2 of 3')
  })

  it('filters by difficulty and by revision status', () => {
    setup({ flashcards: FLASHCARDS, flashcardProgress: { 'card-2': 'review' } })
    const difficulty = within(screen.getByRole('group', { name: /difficulty/i }))

    fireEvent.click(difficulty.getByRole('button', { name: /hard/i }))
    expect(position()).toBe('Card 1 of 1')
    expect(card().textContent).toContain('Why do models need labeled data')

    fireEvent.click(difficulty.getByRole('button', { name: /all/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /revision status/i }), { target: { value: 'review' } })
    expect(position()).toBe('Card 1 of 1')
    expect(card().textContent).toContain('gradient descent')

    // Marking it known removes it from the "Needs revision" deck.
    click(/^known$/i)
    expect(position()).toBe('No cards')
    expect(screen.getByText('Nothing needs revision right now.')).toBeTruthy()
    click(/show all cards/i)
    expect(position()).toBe('Card 1 of 3')
  })

  it('shuffles the deck and can restore the original order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // [1,2,3] -> [2,3,1]
    setup({ flashcards: FLASHCARDS })

    click(/shuffle/i)
    expect(card().textContent).toContain('gradient descent')
    expect(position()).toBe('Card 1 of 3')

    click(/original order/i)
    expect(card().textContent).toContain('What is supervised learning?')
    expect(screen.queryByRole('button', { name: /original order/i })).toBeNull()
  })

  it('regenerates after confirmation and resets progress', async () => {
    const newDeck = { ...FLASHCARDS, cards: FLASHCARDS.cards.slice(0, 2), generated_at: '2026-10-27T00:00:00+00:00' }
    generateFlashcards.mockResolvedValue(newDeck)
    setup({ flashcards: FLASHCARDS, flashcardProgress: { 'card-1': 'known' } })

    click(/regenerate/i)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }))
    expect(generateFlashcards).not.toHaveBeenCalled()

    click(/regenerate/i)
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /replace flashcards/i })))
    expect(position()).toBe('Card 1 of 2')
    expect(stored().flashcardProgress).toEqual({})
  })

  it('resets progress only after confirmation', () => {
    setup({ flashcards: FLASHCARDS, flashcardProgress: { 'card-1': 'known' } })

    click(/reset progress/i)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }))
    expect(stored().flashcardProgress).toEqual({ 'card-1': 'known' })

    click(/reset progress/i)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /reset progress/i }))
    expect(stored().flashcardProgress).toEqual({})
  })

  it('downloads the deck as JSON and CSV', () => {
    setup({ flashcards: FLASHCARDS, flashcardProgress: { 'card-1': 'known' } })

    click(/json/i)
    const [jsonName, json, jsonType] = downloadTextFile.mock.calls[0]
    expect(jsonName).toBe('ML Basics - flashcards.json')
    expect(jsonType).toBe('application/json')
    expect(JSON.parse(json).cards[0].status).toBe('known')

    click(/csv/i)
    const [csvName, csv] = downloadTextFile.mock.calls[1]
    expect(csvName).toBe('ML Basics - flashcards.csv')
    expect(csv).toContain('question,answer,difficulty,topic,sources,status')
  })
})
