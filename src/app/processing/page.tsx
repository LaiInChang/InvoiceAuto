'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { CheckCircleIcon, XCircleIcon, DocumentIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, ArrowPathIcon, ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline'
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
  totalProcessingTime: number
}

interface ExcelColumn {
  id: keyof ExcelRow;
  label: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
}

interface ExcelRow {
  no: number;
  quarter: string;
  year: string;
  month: number;
  date: number;
  invoiceNumber: string;
  category: string;
  supplier: string;
  description: string;
  vatRegion: string;
  currency: string;
  amountInclVat: string;
  vatPercentage: string;
  amountExVat: string;
  vat: string;
}

interface TableHistory {
  past: ExcelRow[][]
  present: ExcelRow[]
  future: ExcelRow[][]
}

const excelColumns: ExcelColumn[] = [
  { id: 'no', label: 'No.', minWidth: 60, maxWidth: 80 },
  { id: 'quarter', label: 'Quarter', minWidth: 80, maxWidth: 100 },
  { id: 'year', label: 'Year', minWidth: 90, maxWidth: 120 },
  { id: 'month', label: 'Month', minWidth: 80, maxWidth: 100 },
  { id: 'date', label: 'Date', minWidth: 80, maxWidth: 100 },
  { id: 'invoiceNumber', label: 'Invoice Number', minWidth: 150, maxWidth: 400 },
  { id: 'category', label: 'Category', minWidth: 120, maxWidth: 200 },
  { id: 'supplier', label: 'Supplier', minWidth: 180, maxWidth: 400 },
  { id: 'description', label: 'Description', minWidth: 200, maxWidth: 450 },
  { id: 'vatRegion', label: 'VAT Region', minWidth: 130, maxWidth: 150 },
  { id: 'currency', label: 'Currency', minWidth: 80, maxWidth: 100 },
  { id: 'amountInclVat', label: 'Amount (Incl. VAT)', minWidth: 120, maxWidth: 200 },
  { id: 'vatPercentage', label: 'VAT %', minWidth: 80, maxWidth: 100 },
  { id: 'amountExVat', label: 'Amount (Excl. VAT)', minWidth: 120, maxWidth: 200 },
  { id: 'vat', label: 'VAT', minWidth: 100, maxWidth: 150 }
];

export default function ProcessingPage() {
  const { user, getIdToken } = useAuth()
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const BATCH_SIZE = 10
  const [progress, setProgress] = useState(0)
  const progressIntervalRef = useRef<NodeJS.Timeout>()
  const [stats, setStats] = useState<ProcessingStats>({
    currentBatch: 0,
    totalBatches: 0,
    processedCount: 0,
    totalCount: 0,
    startTime: null,
    totalProcessingTime: 0
  })
  const [tableData, setTableData] = useState<ExcelRow[]>([])
  const [tableHistory, setTableHistory] = useState<TableHistory>({
    past: [],
    present: [],
    future: []
  })
  const [isEditing, setIsEditing] = useState(false)
  const [isExcelGenerated, setIsExcelGenerated] = useState(false)

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
        .map((result: ProcessResult, index: number) => ({
          no: tableData.length + index + 1,
          quarter: result.data.quarter,
          year: result.data.year,
          month: result.data.month,
          date: result.data.date,
          invoiceNumber: result.data.invoiceNumber,
          category: result.data.category,
          supplier: result.data.supplier,
          description: result.data.description,
          vatRegion: result.data.vatRegion,
          currency: result.data.currency,
          amountInclVat: result.data.amountInclVat,
          vatPercentage: result.data.vatPercentage,
          amountExVat: result.data.amountExVat,
          vat: result.data.vat
        }))

      console.log('New rows to add:', newRows)

      if (newRows.length > 0) {
        setTableData(prev => {
          const updated = [...prev, ...newRows]
          console.log('Updated table data:', updated)
          return updated
        })
        
        // Only update history if Excel is already generated
        if (isExcelGenerated) {
          setTableHistory(prev => ({
            past: [...prev.past, prev.present],
            present: [...prev.present, ...newRows],
            future: []
          }))
        } else {
          // For initial data loading, just set the present state
          setTableHistory(prev => ({
            past: [],
            present: [...prev.present, ...newRows],
            future: []
          }))
        }
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

      // If this is the last batch, mark Excel as generated
      if (stats.currentBatch === stats.totalBatches) {
        setIsExcelGenerated(true)
      }

      return batchResults.results
    } catch (error) {
      console.error('Error processing batch:', error)
      throw error
    }
  }

  const handleUndo = useCallback(() => {
    if (tableHistory.past.length === 0) return;
    
    setTableHistory(prev => {
      const newPast = prev.past.slice(0, -1)
      const newPresent = prev.past[prev.past.length - 1]
      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future]
      }
    })
    // Update tableData with the new present state
    setTableData(prev => {
      const newHistory = {
        past: tableHistory.past.slice(0, -1),
        present: tableHistory.past[tableHistory.past.length - 1],
        future: [tableHistory.present, ...tableHistory.future]
      }
      return newHistory.present
    })
  }, [tableHistory])

  const handleRedo = useCallback(() => {
    if (tableHistory.future.length === 0) return;
    
    setTableHistory(prev => {
      const newFuture = prev.future.slice(1)
      const newPresent = prev.future[0]
      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture
      }
    })
    // Update tableData with the new present state
    setTableData(prev => {
      const newHistory = {
        past: [...tableHistory.past, tableHistory.present],
        present: tableHistory.future[0],
        future: tableHistory.future.slice(1)
      }
      return newHistory.present
    })
  }, [tableHistory])

  const handleReset = useCallback(() => {
    if (tableHistory.past.length === 0) return;
    
    // Reset to the initial state while keeping the data
    setTableHistory(prev => ({
      past: [],
      present: prev.present, // Keep the current data
      future: [...prev.past, prev.present] // Add current state to future for redo
    }))
  }, [])

  const handleInputChange = (index: number, field: keyof ExcelRow, value: string) => {
    const newData = [...tableData];
    newData[index] = { ...newData[index], [field]: value };
    setTableData(newData);
    // Update history with the new data
    setTableHistory(prev => ({
      past: [...prev.past, prev.present],
      present: newData,
      future: []
    }))
  }

  const handleConfirm = async () => {
    try {
      setIsConfirming(true)
      console.log('Confirm clicked at:', new Date().toISOString())

      // Prepare processing result with start and end times
      const processingResult = {
        successCount: tableData.length,
        failedCount: invoices.filter(inv => inv.status === 'cancelled').length,
        startTime: stats.startTime?.toISOString(),
        endTime: new Date().toISOString(),
        processedInvoices: tableData
      }

      // Get Firebase token
      const idToken = await getIdToken()
      
      // Generate and upload Excel file through API
      const response = await fetch('/api/generate-excel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          data: tableData.map((invoice: any, index: number) => ({
            ...invoice,
            no: index + 1
          }))
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate Excel file')
      }

      const { fileUrl, fileName } = await response.json()
      console.log('Excel file generated and uploaded successfully:', { fileUrl, fileName })

      // Store in localStorage
      console.log('Processing Page - Storing processing result:', processingResult)
      localStorage.setItem('processingResult', JSON.stringify(processingResult))

      // Navigate to download page
      router.push('/download')
    } catch (error) {
      console.error('Error in handleConfirm:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate Excel file')
      setIsConfirming(false)
    }
  }

  const startProgressSimulation = (totalBatches: number) => {
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    // Calculate the total time for simulation
    // Base time: 20 seconds per batch
    // Additional time for multiple batches to make it feel more realistic
    const baseTime = 20000 // 20 seconds per batch
    const additionalTime = totalBatches > 1 ? (totalBatches - 1) * 10000 : 0 // Add 10 seconds per additional batch
    const totalTime = (baseTime * totalBatches) + additionalTime

    // Calculate interval to get exactly 99 steps
    const interval = totalTime / 99

    // Start the simulation
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        const nextProgress = prev + 1 // Increment by 1%
        if (nextProgress >= 99) {
          clearInterval(progressIntervalRef.current)
          return 99 // Stop at 99% until actual completion
        }
        return nextProgress
      })
    }, interval)
  }

  const startProcessing = async () => {
    if (invoices.length === 0) return

    const startTime = new Date()
    console.log('Processing started at:', startTime.toISOString())
    setIsProcessing(true)
    setProgress(0) // Reset progress
    setStats(prev => ({ ...prev, startTime }))
    setError(null)

    try {
      const pendingInvoices = invoices.filter(inv => inv.status === 'pending')
      const batches = []
      
      for (let i = 0; i < pendingInvoices.length; i += BATCH_SIZE) {
        batches.push(pendingInvoices.slice(i, i + BATCH_SIZE))
      }

      // Start progress simulation based on number of batches
      startProgressSimulation(batches.length)

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

      // Log the end time
      const endTime = new Date()
      console.log('Processing ended at:', endTime.toISOString())
    } catch (error) {
      console.error('Error during batch processing:', error)
      setError('Failed to process invoices')
    } finally {
      setIsProcessing(false)
      // Clear the progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
      // Only set to 100% when actually complete
      if (!error) {
        setProgress(100)
      }
    }
  }

  // Clean up interval on component unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

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
                    {progress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
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
                  {tableData.length > 0 && (
                    <button
                      onClick={handleConfirm}
                      disabled={isProcessing || isConfirming}
                      className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                        isProcessing || isConfirming
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-primary-600 hover:bg-primary-700'
                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500`}
                    >
                      {isConfirming ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating Excel...
                        </>
                      ) : (
                        <>
                          <CheckIcon className="h-5 w-5 mr-2" />
                          Confirm & Continue
                        </>
                      )}
                    </button>
                  )}
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
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {excelColumns.map((column) => (
                          <th
                            key={column.id}
                            className="px-4 py-3 text-left text-sm font-medium text-gray-500 border-b"
                            style={{
                              minWidth: column.minWidth || 100,
                              maxWidth: column.maxWidth || 450,
                              width: 'auto'
                            }}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((row, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          {excelColumns.map((column) => (
                            <td
                              key={column.id}
                              className="px-4 py-3 text-sm border-b"
                              style={{
                                minWidth: column.minWidth || 100,
                                maxWidth: column.maxWidth || 450,
                                width: 'auto'
                              }}
                            >
                              <div className="whitespace-normal break-words">
                                {column.id === 'no' ? (
                                  <span className="font-medium">{index + 1}</span>
                                ) : (
                                  <input
                                    type="text"
                                    value={row[column.id]}
                                    onChange={(e) => handleInputChange(index, column.id, e.target.value)}
                                    className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-normal break-words"
                                    style={{
                                      minHeight: '2.5rem',
                                      height: 'auto'
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Failed Invoices List - Simplified */}
        <div className="bg-white rounded-lg shadow mt-8">
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
                  <div key={invoice.id} className="px-6 py-4 hover:bg-gray-50">
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

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back
          </button>
        </div>
      </div>
    </div>
  )
} 