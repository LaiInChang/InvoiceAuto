'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ArrowLeftIcon, DocumentArrowDownIcon, HomeIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { addDoc } from 'firebase/firestore'

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

interface ProcessingResult {
  successCount: number
  failedCount: number
  processedInvoices: any[]
}

export default function DownloadPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [result, setResult] = useState<ProcessingResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    // Get the processing result from localStorage
    console.log('Download Page - Checking localStorage for processingResult')
    const processingResult = localStorage.getItem('processingResult')
    console.log('Download Page - Raw processingResult from localStorage:', processingResult)
    
    if (processingResult) {
      try {
        const parsedResult = JSON.parse(processingResult)
        console.log('Download Page - Parsed processingResult:', parsedResult)
        setResult(parsedResult)
      } catch (error) {
        console.error('Download Page - Error parsing processingResult:', error)
        setError('Failed to parse processing results')
      }
    } else {
      console.log('Download Page - No processingResult found in localStorage')
    }
    setIsLoading(false)
  }, [user, router])

  const handleDownloadCSV = () => {
    if (!result || result.processedInvoices.length === 0) {
      console.log('No processed invoices available for CSV download')
      return
    }

    console.log('Downloading CSV with data:', result.processedInvoices)
    const headers = excelColumns.map(col => col.label)
    const rows = result.processedInvoices.map(row => 
      excelColumns.map(col => row[col.id])
    )
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `invoice_report_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleDownloadExcel = () => {
    if (!result || result.processedInvoices.length === 0) {
      console.log('No processed invoices available for Excel download')
      return
    }

    try {
      console.log('Starting Excel generation process...')
      console.log('Data to be processed:', result.processedInvoices)
      
      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(
        result.processedInvoices.map((invoice: any, index: number) => ({
          ...invoice,
          no: index + 1
        }))
      )

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoice Analysis')

      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      
      // Create download link
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `invoice_report_${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()

      // Cleanup
      URL.revokeObjectURL(link.href)
      console.log('Download process completed')

    } catch (error) {
      console.error('Error in handleDownloadExcel:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate Excel file')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="mr-4 p-2 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Download Results</h1>
              <p className="mt-2 text-sm text-gray-600">Your processed invoices are ready to download</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <HomeIcon className="h-5 w-5 mr-2" />
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">{error}</div>
            ) : !result ? (
              <div className="text-center py-8 text-gray-500">
                No processing results found
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between mt-8">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">
                      Download Processed Data
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Choose your preferred format to download the processed invoices
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleDownloadCSV}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                      <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
                      Download CSV
                    </button>
                    <button
                      onClick={handleDownloadExcel}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
                      Download Excel
                    </button>
                  </div>
                </div>
                <br></br>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-green-50 p-6 rounded-lg">
                    <div className="flex items-center">
                      <CheckCircleIcon className="h-8 w-8 text-green-500 mr-3" />
                      <div>
                        <h3 className="text-lg font-medium text-green-800">Successfully Processed</h3>
                        <p className="text-2xl font-bold text-green-900">{result.successCount}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-red-50 p-6 rounded-lg">
                    <div className="flex items-center">
                      <XCircleIcon className="h-8 w-8 text-red-500 mr-3" />
                      <div>
                        <h3 className="text-lg font-medium text-red-800">Failed to Process</h3>
                        <p className="text-2xl font-bold text-red-900">{result.failedCount}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 