import { ConfirmDialog } from './ui'
import { deleteLectureIndex } from '../lib/api'
import { deleteLecture } from '../lib/lectures'
import { toast } from '../lib/toast'

/** Confirms deleting a lecture, then removes it from this browser and from the search index. */
export default function DeleteLectureDialog({ lecture, onCancel, onDeleted }) {
  return (
    <ConfirmDialog
      title={`Delete “${lecture.title}”?`}
      confirmLabel="Delete lecture"
      tone="danger"
      onCancel={onCancel}
      onConfirm={() => {
        deleteLecture(lecture.id)
        // Best effort: also remove its vectors from the backend's search index.
        deleteLectureIndex(lecture.id).catch(() => {})
        toast({ title: 'Lecture deleted', description: lecture.title })
        onDeleted()
      }}
    >
      <p>This permanently removes its transcript, notes, flashcards, quiz history, and chat from this browser.</p>
    </ConfirmDialog>
  )
}
