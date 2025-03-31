'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { CheckCircleIcon, XCircleIcon, DocumentIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { analyzeInvoice } from '@/lib/ai-processing'

interface ProcessResult {
  success: boolean
  fileUrl: string
  data?: ExcelRow
  error?: string
}

interface Invoice {
  id: string
  fileName: string
  fileUrl: string
  publicId: string
  processedAt: Date
  userId: string
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
  error?: string
}

interface ProcessingStats {
  currentBatch: number
  totalBatches: number
  processedCount: number
  totalCount: number
  startTime: Date | null
}

interface ExcelRow {
  quarter: string
  year: string
  month: string
  date: string
  invoiceNumber: string
  category: string
  supplier: string
  description: string
  vatRegion: string
  currency: string
  amountInclVat: string
  vatPercentage: string
  amountExVat: string
  vat: string
}

interface TableHistory {
  past: ExcelRow[][]
  present: ExcelRow[]
  future: ExcelRow[][]
}

export default function ProcessingPage() {
  const { user, getIdToken } = useAuth()
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const BATCH_SIZE = 10
  const [stats, setStats] = useState<ProcessingStats>({
    currentBatch: 0,
    totalBatches: 0,
    processedCount: 0,
    totalCount: 0,
    startTime: null
  })
  const [tableData, setTableData] = useState<ExcelRow[]>([])
  const [tableHistory, setTableHistory] = useState<TableHistory>({
    past: [],
    present: [],
    future: []
  })
  const [isEditing, setIsEditing] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    loadInvoices()
  }, [user, router])

  useEffect(() => {
    if (invoices.length > 0 && !isProcessing) {
      startProcessing()
    }
  }, [invoices])

  const loadInvoices = async () => {
    if (!user) return

    try {
      setIsLoading(true)
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('userId', '==', user.uid),
        where('status', '==', 'pending')
      )
      
      const querySnapshot = await getDocs(invoicesQuery)
      const invoicesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        processedAt: doc.data().processedAt?.toDate()
      })) as Invoice[]
      
      // Filter out any invoices that might have been processed while we were loading
      const pendingInvoices = invoicesData.filter(inv => inv.status === 'pending')
      
      setInvoices(pendingInvoices)
      setStats(prev => ({
        ...prev,
        totalCount: pendingInvoices.length,
        totalBatches: Math.ceil(pendingInvoices.length / BATCH_SIZE)
      }))
      setError(null)
    } catch (error) {
      console.error('Error loading invoices:', error)
      setError('Failed to load invoices')
    } finally {
      setIsLoading(false)
    }
  }

  const processBatch = async (batchInvoices: Invoice[]) => {
    try {
      // Get Firebase token
      const idToken = await getIdToken()

      // Process current batch
      const response = await fetch('/api/process-invoice', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileUrls: batchInvoices.map(inv => inv.fileUrl),
          batchNumber: stats.currentBatch,
          totalBatches: stats.totalBatches,
          batchSize: BATCH_SIZE
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to process batch ${stats.currentBatch}`)
      }

      const batchResults = await response.json()
      console.log('Batch results:', batchResults)
      
      // Update table data with AI analysis results
      const newRows = batchResults.results
        .filter((result: ProcessResult) => {
          console.log('Processing result:', result)
          return result.success && result.data
        })
        .map((result: ProcessResult) => {
          console.log('Mapped data:', result.data)
          return result.data
        })

      console.log('New rows to add:', newRows)

      if (newRows.length > 0) {
        setTableData(prev => {
          const updated = [...prev, ...newRows]
          console.log('Updated table data:', updated)
          return updated
        })
        
        setTableHistory(prev => {
          const updated = {
            past: [...prev.past, prev.present],
            present: [...prev.present, ...newRows],
            future: []
          }
          console.log('Updated table history:', updated)
          return updated
        })
      }

      // Update invoice statuses
      for (const result of batchResults.results) {
        const invoice = batchInvoices.find(inv => inv.fileUrl === result.fileUrl)
        if (invoice) {
          console.log('Updating invoice status:', {
            invoiceId: invoice.id,
            success: result.success,
            data: result.data
          })

          const updateData: any = {
            status: result.success ? 'completed' : 'cancelled',
            analysisResult: result.data
          }

          // Only include error field if there is an error
          if (!result.success && result.error) {
            updateData.error = result.error
          }

          await updateDoc(doc(db, 'invoices', invoice.id), updateData)

          setInvoices(prev => prev.map(inv => 
            inv.id === invoice.id 
              ? { 
                  ...inv, 
                  status: result.success ? 'completed' : 'cancelled',
                  error: result.error,
                  analysisResult: result.data
                }
              : inv
          ))
        }
      }

      return batchResults.results
    } catch (error) {
      console.error('Error processing batch:', error)
      throw error
    }
  }

  const handleUndo = useCallback(() => {
    setTableHistory(prev => {
      if (prev.past.length === 0) return prev
      const newPast = prev.past.slice(0, -1)
      const newPresent = prev.past[prev.past.length - 1]
      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future]
      }
    })
  }, [])

  const handleRedo = useCallback(() => {
    setTableHistory(prev => {
      if (prev.future.length === 0) return prev
      const newFuture = prev.future.slice(1)
      const newPresent = prev.future[0]
      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture
      }
    })
  }, [])

  const handleReset = useCallback(() => {
    setTableHistory(prev => ({
      past: [],
      present: [],
      future: []
    }))
  }, [])

  const handleCellEdit = (rowIndex: number, field: keyof ExcelRow, value: string) => {
    setTableHistory(prev => {
      const newPresent = [...prev.present]
      newPresent[rowIndex] = {
        ...newPresent[rowIndex],
        [field]: value
      }
      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: []
      }
    })
  }

  const handleConfirm = () => {
    setShowConfirmDialog(true)
  }

  const handleConfirmProceed = () => {
    setShowConfirmDialog(false)
    router.push('/download')
  }

  const startProcessing = async () => {
    if (invoices.length === 0) return

    const startTime = new Date()
    setIsProcessing(true)
    setStats(prev => ({ ...prev, startTime }))
    setError(null)

    try {
      const pendingInvoices = invoices.filter(inv => inv.status === 'pending')
      const batches = []
      
      for (let i = 0; i < pendingInvoices.length; i += BATCH_SIZE) {
        batches.push(pendingInvoices.slice(i, i + BATCH_SIZE))
      }

      for (let i = 0; i < batches.length; i++) {
        setStats(prev => ({ ...prev, currentBatch: i + 1 }))
        const results = await processBatch(batches[i])
        
        setStats(prev => ({
          ...prev,
          processedCount: prev.processedCount + results.length
        }))

        // Check if any invoices in this batch failed
        const failedInvoices = results.filter((r: ProcessResult) => !r.success)
        if (failedInvoices.length > 0) {
          console.warn(`Batch ${i + 1} had ${failedInvoices.length} failed invoices`)
        }
      }

      // Log processing time
      const endTime = new Date()
      const processingTime = endTime.getTime() - startTime.getTime()
      console.log(`Total processing time: ${processingTime / 1000} seconds`)
    } catch (error) {
      console.error('Error during batch processing:', error)
      setError('Failed to process invoices')
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusColor = (status: Invoice['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-500'
      case 'processing':
        return 'text-blue-500'
      case 'cancelled':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Process Invoices</h1>
          <p className="mt-2 text-sm text-gray-600">Track and manage invoice processing</p>
        </div>

        {/* Processing Stats */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6">
            <div className="space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Processing Progress</span>
                  <span className="text-sm font-medium text-gray-700">
                    {Math.round((stats.processedCount / stats.totalCount) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(stats.processedCount / stats.totalCount) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-500">Current Batch</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {stats.currentBatch} / {stats.totalBatches}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-500">Processed</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {stats.processedCount} / {stats.totalCount}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-500">Status</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {isProcessing ? 'Processing' : 'Complete'}
                  </p>
                </div>
              </div>

              {/* Excel-like Table */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Processed Invoices</h3>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleUndo}
                      disabled={tableHistory.past.length === 0}
                      className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      <ArrowUturnLeftIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={tableHistory.future.length === 0}
                      className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      <ArrowUturnRightIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleReset}
                      className="p-2 text-gray-500 hover:text-gray-700"
                    >
                      <ArrowPathIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="ml-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700">
                        Please review and verify the processed data. AI results may not be 100% accurate.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quarter</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Number</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VAT Region</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Incl VAT</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VAT %</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Ex VAT</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VAT</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tableHistory.present.map((row, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.quarter}
                              onChange={(e) => handleCellEdit(index, 'quarter', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.year}
                              onChange={(e) => handleCellEdit(index, 'year', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.month}
                              onChange={(e) => handleCellEdit(index, 'month', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.date}
                              onChange={(e) => handleCellEdit(index, 'date', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.invoiceNumber}
                              onChange={(e) => handleCellEdit(index, 'invoiceNumber', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.category}
                              onChange={(e) => handleCellEdit(index, 'category', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.supplier}
                              onChange={(e) => handleCellEdit(index, 'supplier', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => handleCellEdit(index, 'description', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.vatRegion}
                              onChange={(e) => handleCellEdit(index, 'vatRegion', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.currency}
                              onChange={(e) => handleCellEdit(index, 'currency', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.amountInclVat}
                              onChange={(e) => handleCellEdit(index, 'amountInclVat', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.vatPercentage}
                              onChange={(e) => handleCellEdit(index, 'vatPercentage', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.amountExVat}
                              onChange={(e) => handleCellEdit(index, 'amountExVat', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.vat}
                              onChange={(e) => handleCellEdit(index, 'vat', e.target.value)}
                              className="border-0 focus:ring-0 p-0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Failed Invoices List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Failed Invoices</h2>
          </div>

          {isLoading ? (
            <div className="px-6 py-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
            </div>
          ) : error ? (
            <div className="px-6 py-4 text-center text-red-500">{error}</div>
          ) : invoices.filter(inv => inv.status === 'cancelled').length === 0 ? (
            <div className="px-6 py-4 text-center text-gray-500">
              No failed invoices
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {invoices
                .filter(inv => inv.status === 'cancelled')
                .map((invoice) => (
                  <div key={invoice.id} className="px-6 py-4 hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <XCircleIcon className="h-6 w-6 text-red-500" />
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{invoice.fileName}</div>
                          <div className="text-sm text-gray-500">
                            Uploaded on {invoice.processedAt.toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-red-500">
                          Failed
                        </span>
                      </div>
                    </div>
                    {invoice.error && (
                      <div className="mt-2 text-sm text-red-600">
                        Error: {invoice.error}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">Confirm Data</h3>
              <p className="mt-1 text-sm text-gray-500">
                Are you sure you want to proceed with the current data? This will be used for the final report.
              </p>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmProceed}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
              >
                Confirm and Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 