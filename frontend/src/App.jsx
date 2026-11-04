import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import TranscriptionProvider from './context/TranscriptionProvider'
import Dashboard from './pages/Dashboard'
import LectureDetailPage from './pages/LectureDetailPage'
import LecturesPage from './pages/LecturesPage'
import NotFound from './pages/NotFound'
import UploadPage from './pages/UploadPage'

export default function App() {
  return (
    <TranscriptionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="lectures" element={<LecturesPage />} />
          <Route path="lectures/:lectureId" element={<LectureDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </TranscriptionProvider>
  )
}
