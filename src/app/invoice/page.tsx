'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { format } from 'date-fns'
import { DateRangeFilter } from '@/components/DateRangeFilter'
import { CalendarIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

interface Invoice {
  id: string
  fileName: string
  uploadTime: Date
  status: string
  fileUrl?: string
}

export default function InvoicePage() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilter, setShowFilter] = useState(false)

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!user) return

      try {
        setLoading(true)
        setError(null)

        const invoicesQuery = query(
          collection(db, 'invoices'),
          where('userId', '==', user.uid),
          orderBy('uploadTime', sortOrder)
        )

        const invoicesSnapshot = await getDocs(invoicesQuery)
        const invoicesData = invoicesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          uploadTime: doc.data().uploadTime.toDate()
        })) as Invoice[]

        // Apply date filtering
        const filteredInvoices = invoicesData.filter(invoice => {
          if (!startDate && !endDate) return true
          if (startDate && !endDate) return invoice.uploadTime >= startDate
          if (!startDate && endDate) return invoice.uploadTime <= endDate
          return invoice.uploadTime >= startDate && invoice.uploadTime <= endDate
        })

        setInvoices(filteredInvoices)
      } catch (error) {
        console.error('Error fetching invoices:', error)
        setError('Failed to load invoices')
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [user, sortOrder, startDate, endDate])

  const handleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-red-600">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilter(!showFilter)}
                className="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                title="Filter by date"
              >
                <CalendarIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {showFilter && (
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onClear={() => {
              setStartDate(null)
              setEndDate(null)
            }}
          />
        )}

        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Your Invoices</h2>
            <button
              onClick={handleSort}
              className="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              title={`Sort by date ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            >
              {sortOrder === 'asc' ? (
                <ChevronUpIcon className="h-5 w-5" />
              ) : (
                <ChevronDownIcon className="h-5 w-5" />
              )}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Upload Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.length > 0 ? (
                  invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{invoice.fileName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(invoice.uploadTime, 'PPpp')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          invoice.status === 'completed' ? 'bg-green-100 text-green-800' :
                          invoice.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      No invoices found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
} 