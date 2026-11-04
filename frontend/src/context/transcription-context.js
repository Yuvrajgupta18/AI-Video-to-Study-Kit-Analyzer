import { createContext, useContext } from 'react'

export const TranscriptionContext = createContext(null)

export function useTranscription() {
  const context = useContext(TranscriptionContext)
  if (!context) throw new Error('useTranscription must be used inside <TranscriptionProvider>')
  return context
}
