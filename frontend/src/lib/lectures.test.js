import { describe, expect, it } from 'vitest'
import { addLecture, createLecture, deleteLecture, updateLecture } from './lectures'
import { NOTES, SEGMENTS, makeLecture } from '../test/fixtures'

const stored = () => JSON.parse(localStorage.getItem('studykit.lectures.v1'))

describe('lecture store', () => {
  it('creates a lecture from a transcription result', () => {
    const file = new File(['x'], 'Week 3 - Gradient Descent.mp4')
    const lecture = createLecture(file, { language: 'en', segments: SEGMENTS, transcript: 'one two three' })
    expect(lecture).toMatchObject({ title: 'Week 3 - Gradient Descent', mediaType: 'video', duration: 13.44, wordCount: 3 })
  })

  it('saves generated notes onto the lecture in localStorage', () => {
    const lecture = makeLecture()
    addLecture(lecture)

    expect(updateLecture(lecture.id, { notes: NOTES })).toBe(true)
    expect(stored().find((l) => l.id === lecture.id).notes).toEqual(NOTES)

    deleteLecture(lecture.id)
  })

  it('ignores updates for lectures that no longer exist', () => {
    expect(updateLecture('missing', { notes: NOTES })).toBe(true)
    expect(localStorage.getItem('studykit.lectures.v1')).toBeNull()
  })
})
