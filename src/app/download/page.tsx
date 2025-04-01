'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ArrowLeftIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline'

interface Invoice {
  id: string
  fileName: string
  fileUrl: string
  publicId: string
  processedAt: Date
  userId: string
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
  error?: string
  analysisResult?: any
}

export default function DownloadPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    loadInvoices()
  }, [user, router])

  const loadInvoices = async () => {
    if (!user) return

    try {
      setIsLoading(true)
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('userId', '==', user.uid),
        where('status', '==', 'completed')
      )
      
      const querySnapshot = await getDocs(invoicesQuery)
      const invoicesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        processedAt: doc.data().processedAt?.toDate()
      })) as Invoice[]
      
      setInvoices(invoicesData)
      setError(null)
    } catch (error) {
      console.error('Error loading invoices:', error)
      setError('Failed to load invoices')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async () => {
    try {
      // Convert invoices data to Excel format
      const excelData = invoices.map((invoice, index) => ({
        'No.': index + 1,
        'Quarter': invoice.analysisResult?.quarter || '',
        'Year': invoice.analysisResult?.year || '',
        'Month': invoice.analysisResult?.month || '',
        'Date': invoice.analysisResult?.date || '',
        'Invoice Number': invoice.analysisResult?.invoiceNumber || '',
        'Category': invoice.analysisResult?.category || '',
        'Supplier': invoice.analysisResult?.supplier || '',
        'Description': invoice.analysisResult?.description || '',
        'VAT Region': invoice.analysisResult?.vatRegion || '',
        'Currency': invoice.analysisResult?.currency || '',
        'Amount (Incl. VAT)': invoice.analysisResult?.amountInclVat || '',
        'VAT %': invoice.analysisResult?.vatPercentage || '',
        'Amount (Excl. VAT)': invoice.analysisResult?.amountExVat || '',
        'VAT': invoice.analysisResult?.vat || ''
      }))

      // Create CSV content
      const headers = Object.keys(excelData[0])
      const csvContent = [
        headers.join(','),
        ...excelData.map(row => headers.map(header => row[header]).join(','))
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
      console.error('Error downloading data:', error)
      setError('Failed to download data')
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

        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">{error}</div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No processed invoices found
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">
                      {invoices.length} Processed Invoices
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Ready to download in CSV format
                    </p>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
                    Download CSV
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          File Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Processed Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {invoice.fileName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {invoice.processedAt.toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Completed
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 