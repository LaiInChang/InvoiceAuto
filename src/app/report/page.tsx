'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { format } from 'date-fns'
import { DateRangeFilter } from '@/components/DateRangeFilter'
import { CalendarIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

interface Report {
  id: string
  fileName: string
  uploadTime: Date
  status: string
  fileUrl?: string
}

export default function ReportPage() {
  const { user } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilter, setShowFilter] = useState(false)

  useEffect(() => {
    const fetchReports = async () => {
      if (!user) return

      try {
        setLoading(true)
        setError(null)

        const reportsQuery = query(
          collection(db, 'reports'),
          where('userId', '==', user.uid),
          orderBy('uploadTime', sortOrder)
        )

        const reportsSnapshot = await getDocs(reportsQuery)
        const reportsData = reportsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          uploadTime: doc.data().uploadTime.toDate()
        })) as Report[]

        // Apply date filtering
        const filteredReports = reportsData.filter(report => {
          if (!startDate && !endDate) return true
          if (startDate && !endDate) return report.uploadTime >= startDate
          if (!startDate && endDate) return report.uploadTime <= endDate
          return report.uploadTime >= startDate && report.uploadTime <= endDate
        })

        setReports(filteredReports)
      } catch (error) {
        console.error('Error fetching reports:', error)
        setError('Failed to load reports')
      } finally {
        setLoading(false)
      }
    }

    fetchReports()
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
            <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
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
            <h2 className="text-lg font-medium text-gray-900">Your Reports</h2>
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
                {reports.length > 0 ? (
                  reports.map((report) => (
                    <tr key={report.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.fileName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(report.uploadTime, 'PPpp')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          report.status === 'completed' ? 'bg-green-100 text-green-800' :
                          report.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {report.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      No reports found
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