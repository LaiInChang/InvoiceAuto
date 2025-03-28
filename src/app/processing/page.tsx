'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy, updateDoc, doc, addDoc } from 'firebase/firestore'
import { DataGrid } from '@mui/x-data-grid'
import { Button } from '@mui/material'
import { format } from 'date-fns'
import { SuccessPopup } from '@/components/SuccessPopup'
import { generateExcelFile } from '@/lib/excel'
import { uploadToFirebase } from '@/lib/firebase'

interface Invoice {
  id: string
  fileName: string
  fileUrl: string
  processedAt: Date
  status: string
  results?: any
}

interface ProcessedData {
  id: string
  invoiceNumber: string
  date: string
  amount: number
  description: string
  category: string
}

export default function ProcessingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [processedData, setProcessedData] = useState<ProcessedData[]>([])
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [currentInvoice, setCurrentInvoice] = useState('')
  const [processing, setProcessing] = useState(false)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    fetchInvoices()
  }, [user, router])

  const fetchInvoices = async () => {
    try {
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('userId', '==', user?.uid),
        where('status', '==', 'processing'),
        orderBy('processedAt', 'desc')
      )
      const snapshot = await getDocs(invoicesQuery)
      const invoicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        processedAt: doc.data().processedAt?.toDate() || new Date()
      })) as Invoice[]
      setInvoices(invoicesData)
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const processInvoices = async () => {
    if (invoices.length === 0) return

    setProcessing(true)
    let processedCount = 0

    for (const invoice of invoices) {
      setCurrentInvoice(invoice.fileName)
      try {
        // Simulate processing (replace with actual API calls)
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Update invoice status to processed
        await updateDoc(doc(db, 'invoices', invoice.id), {
          status: 'processed',
          processedAt: new Date()
        })

        // Add processed data
        const newData: ProcessedData = {
          id: invoice.id,
          invoiceNumber: invoice.fileName.split('.')[0],
          date: format(new Date(), 'yyyy-MM-dd'),
          amount: Math.random() * 1000,
          description: 'Sample description',
          category: 'Sample category'
        }
        setProcessedData(prev => [...prev, newData])

        processedCount++
        setProgress((processedCount / invoices.length) * 100)
      } catch (error) {
        console.error(`Error processing invoice ${invoice.fileName}:`, error)
      }
    }

    setProcessing(false)
  }

  const handleGenerateReport = async () => {
    try {
      // Generate Excel file
      const excelFile = await generateExcelFile(processedData)
      
      // Upload to Firebase Storage
      const fileUrl = await uploadToFirebase(excelFile)
      
      // Save report reference to Firestore
      await addDoc(collection(db, 'reports'), {
        fileName: `invoice_report_${Date.now()}.xlsx`,
        fileUrl,
        userId: user?.uid,
        processedAt: new Date(),
        invoiceCount: processedData.length
      })

      // Show success popup
      setShowSuccessPopup(true)
    } catch (error) {
      console.error('Error generating report:', error)
    }
  }

  const handleViewReport = () => {
    router.push('/account')
  }

  const handleProcessMore = () => {
    router.push('/dashboard')
  }

  const columns = [
    { field: 'invoiceNumber', headerName: 'Invoice Number', width: 150 },
    { field: 'date', headerName: 'Date', width: 130 },
    { field: 'amount', headerName: 'Amount', width: 130, type: 'number' },
    { field: 'description', headerName: 'Description', width: 300 },
    { field: 'category', headerName: 'Category', width: 150 }
  ]

  return (
    <>
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-gray-900">Processing Invoices</h1>
              <p className="mt-2 text-sm text-gray-500">
                {invoices.length} invoices to process
              </p>
            </div>

            {!processing && invoices.length > 0 && (
              <div className="mb-6">
                <Button
                  variant="contained"
                  color="primary"
                  onClick={processInvoices}
                  disabled={processing}
                >
                  Start Processing
                </Button>
              </div>
            )}

            {processing && (
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Processing {currentInvoice}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {processedData.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Processed Data</h2>
                <div style={{ height: 400, width: '100%' }}>
                  <DataGrid
                    rows={processedData}
                    columns={columns}
                    pageSize={5}
                    rowsPerPageOptions={[5]}
                    checkboxSelection
                    disableSelectionOnClick
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleGenerateReport}
                  >
                    Generate Report
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SuccessPopup
        isOpen={showSuccessPopup}
        onClose={() => setShowSuccessPopup(false)}
        onViewReport={handleViewReport}
        onProcessMore={handleProcessMore}
      />
    </>
  )
} 