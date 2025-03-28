'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { CloudinaryUploadWidget } from '@/components/CloudinaryUploadWidget'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore'
import { format } from 'date-fns'

interface Invoice {
  id: string
  fileName: string
  fileUrl: string
  processedAt: Date
  status: string
  results?: any
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [showUploadWidget, setShowUploadWidget] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
  }, [user, router])

  const handleUploadSuccess = async (result: any) => {
    try {
      // Add the new invoice to local state
      const newInvoice: Invoice = {
        id: result.info.public_id,
        fileName: result.info.original_filename,
        fileUrl: result.info.secure_url,
        processedAt: new Date(),
        status: 'pending'
      }
      
      setInvoices(prev => [...prev, newInvoice])
      setShowUploadWidget(false)
    } catch (error) {
      console.error('Error handling upload:', error)
    }
  }

  const handleDeleteInvoice = async (invoiceId: string) => {
    setInvoices(prev => prev.filter(invoice => invoice.id !== invoiceId))
  }

  const handleProcessInvoices = async () => {
    if (invoices.length === 0) return
    
    try {
      // Add all invoices to Firestore with processing status
      const addPromises = invoices.map(invoice =>
        addDoc(collection(db, 'invoices'), {
          ...invoice,
          userId: user?.uid,
          status: 'processing',
          processedAt: new Date()
        })
      )
      
      await Promise.all(addPromises)
      router.push('/processing')
    } catch (error) {
      console.error('Error saving invoices to Firestore:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Invoice Dashboard</h1>
            {invoices.length > 0 && (
              <button
                onClick={() => setShowUploadWidget(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Upload More Invoice
              </button>
            )}
          </div>

          {invoices.length === 0 ? (
            <div className="text-center py-8">
              <CloudinaryUploadWidget
                onSuccess={handleUploadSuccess}
                onError={(error) => console.error('Upload error:', error)}
                autoOpen={true}
              />
            </div>
          ) : (
            <>
              {showUploadWidget && (
                <div className="mb-6">
                  <CloudinaryUploadWidget
                    onSuccess={handleUploadSuccess}
                    onError={(error) => console.error('Upload error:', error)}
                    autoOpen={true}
                  />
                </div>
              )}

              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                  {invoices.map((invoice) => (
                    <li key={invoice.id} className="px-4 py-4 flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{invoice.fileName}</div>
                          <div className="text-sm text-gray-500">
                            {format(invoice.processedAt, 'MMM d, yyyy HH:mm')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                        <a
                          href={invoice.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleProcessInvoices}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Process Invoices
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
} 