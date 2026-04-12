import { Navigate, Route, Routes } from 'react-router-dom'
import { BillSplitProvider } from './context/BillSplitContext'
import { AssignPage } from './pages/AssignPage'
import { SummaryPage } from './pages/SummaryPage'
import { ReceiptMismatchPage } from './pages/ReceiptMismatchPage'
import { UploadPage } from './pages/UploadPage'

export default function App() {
  return (
    <BillSplitProvider>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/receipt-mismatch" element={<ReceiptMismatchPage />} />
        <Route path="/assign" element={<AssignPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BillSplitProvider>
  )
}
