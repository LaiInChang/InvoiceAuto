'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ArrowLeftIcon, DocumentArrowDownIcon, HomeIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'

interface ProcessingResult {
  successCount: number
  failedCount: number
  processingTime: number
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

  const handleDownloadCSV = async () => {
    if (!result?.processedInvoices) {
      console.log('Download Page - No processed invoices available for CSV download')
      return
    }
    console.log('Download Page - Starting CSV download with data:', result.processedInvoices)

    try {
      // Convert invoices data to CSV format
      const excelData = result.processedInvoices.map((invoice, index) => ({
        'No.': index + 1,
        'Quarter': invoice.quarter || '',
        'Year': invoice.year || '',
        'Month': invoice.month || '',
        'Date': invoice.date || '',
        'Invoice Number': invoice.invoiceNumber || '',
        'Category': invoice.category || '',
        'Supplier': invoice.supplier || '',
        'Description': invoice.description || '',
        'VAT Region': invoice.vatRegion || '',
        'Currency': invoice.currency || '',
        'Amount (Incl. VAT)': invoice.amountInclVat || '',
        'VAT %': invoice.vatPercentage || '',
        'Amount (Excl. VAT)': invoice.amountExVat || '',
        'VAT': invoice.vat || ''
      }))

      // Create CSV content
      const headers = Object.keys(excelData[0])
      const csvContent = [
        headers.join(','),
        ...excelData.map(row => headers.map(header => row[header as keyof typeof row]).join(','))
      ].join('\n')

      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `invoice_data_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error downloading CSV:', error)
      setError('Failed to download CSV')
    }
  }

  const handleDownloadExcel = async () => {
    if (!result?.processedInvoices) {
      console.log('Download Page - No processed invoices available for Excel download')
      return
    }
    console.log('Download Page - Starting Excel download with data:', result.processedInvoices)

    try {
      // Convert invoices data to Excel format
      const excelData = result.processedInvoices.map((invoice, index) => ({
        'No.': index + 1,
        'Quarter': invoice.quarter || '',
        'Year': invoice.year || '',
        'Month': invoice.month || '',
        'Date': invoice.date || '',
        'Invoice Number': invoice.invoiceNumber || '',
        'Category': invoice.category || '',
        'Supplier': invoice.supplier || '',
        'Description': invoice.description || '',
        'VAT Region': invoice.vatRegion || '',
        'Currency': invoice.currency || '',
        'Amount (Incl. VAT)': invoice.amountInclVat || '',
        'VAT %': invoice.vatPercentage || '',
        'Amount (Excl. VAT)': invoice.amountExVat || '',
        'VAT': invoice.vat || ''
      }))

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(excelData)

      // Set column widths
      const colWidths = [
        { wch: 5 },  // No.
        { wch: 10 }, // Quarter
        { wch: 10 }, // Year
        { wch: 10 }, // Month
        { wch: 10 }, // Date
        { wch: 20 }, // Invoice Number
        { wch: 20 }, // Category
        { wch: 30 }, // Supplier
        { wch: 40 }, // Description
        { wch: 15 }, // VAT Region
        { wch: 10 }, // Currency
        { wch: 15 }, // Amount (Incl. VAT)
        { wch: 10 }, // VAT %
        { wch: 15 }, // Amount (Excl. VAT)
        { wch: 15 }  // VAT
      ]
      ws['!cols'] = colWidths

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices')

      // Generate Excel file
      XLSX.writeFile(wb, `invoice_data_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error downloading Excel:', error)
      setError('Failed to download Excel')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center">
            <button
              onClick={() => router.back()}
              className="mr-4 p-2 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Download Data</h1>
              <p className="mt-2 text-sm text-gray-600">Download processed invoice data</p>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  <div className="bg-blue-50 p-6 rounded-lg">
                    <div className="flex items-center">
                      <ClockIcon className="h-8 w-8 text-blue-500 mr-3" />
                      <div>
                        <h3 className="text-lg font-medium text-blue-800">Processing Time</h3>
                        <p className="text-2xl font-bold text-blue-900">{result.processingTime}s</p>
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