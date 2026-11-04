import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TranscriptionContext } from './transcription-context'
import { getErrorMessage, transcribeFile } from '../lib/api'
import { addLecture, createLecture } from '../lib/lectures'
import { toast } from '../lib/toast'
import axios from 'axios'

const IDLE = { status: 'idle' }
const FFMPEG_HINT = 'A common cause is FFmpeg not being installed or not on PATH.'

/**
 * Holds the current transcription job at app level so it keeps running
 * (and its result is saved) while the user navigates between pages.
 *
 * status: idle | uploading | transcribing | success | error
 */
export default function TranscriptionProvider({ children }) {
  const [job, setJob] = useState(IDLE)
  const controllerRef = useRef(null)

  const isBusy = job.status === 'uploading' || job.status === 'transcribing'

  const start = useCallback(async (file) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setJob({ status: 'uploading', file, progress: 0, startedAt: Date.now() })

    try {
      const result = await transcribeFile(file, {
        signal: controller.signal,
        onUploadProgress: (event) => {
          const progress = event.total ? Math.round((event.loaded / event.total) * 100) : null
          if (event.total && event.loaded >= event.total) {
            setJob((current) =>
              current.status === 'uploading'
                ? { ...current, status: 'transcribing', progress: 100, transcribingSince: Date.now() }
                : current,
            )
          } else {
            setJob((current) => (current.status === 'uploading' ? { ...current, progress } : current))
          }
        },
      })

      const lecture = createLecture(file, result)
      const saved = addLecture(lecture)
      setJob({ status: 'success', file, lectureId: lecture.id, storageWarning: !saved })
      toast({ title: 'Transcript ready', description: lecture.title })
      return lecture.id
    } catch (error) {
      if (axios.isCancel(error)) {
        setJob(IDLE)
      } else {
        setJob({ status: 'error', file, error: getErrorMessage(error, { serverErrorHint: FFMPEG_HINT }) })
      }
      return null
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])
  const reset = useCallback(() => setJob(IDLE), [])

  // Warn before closing the tab while a file is uploading or being transcribed.
  useEffect(() => {
    if (!isBusy) return undefined
    const handler = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isBusy])

  const value = useMemo(() => ({ job, isBusy, start, cancel, reset }), [job, isBusy, start, cancel, reset])

  return <TranscriptionContext.Provider value={value}>{children}</TranscriptionContext.Provider>
}
