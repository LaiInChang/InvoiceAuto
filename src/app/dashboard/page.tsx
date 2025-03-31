'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { CloudinaryUploadWidget } from '@/components/CloudinaryUploadWidget'
import { collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { CloudArrowUpIcon } from '@heroicons/react/24/outline'
import { useDropzone } from 'react-dropzone'

interface Invoice {
  id: string
  fileName: string
  fileUrl: string
  publicId: string
  processedAt: Date
  userId: string
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
}

interface CloudinaryResponse {
  event: string
  info: {
    public_id: string
    secure_url: string
    original_filename: string
  }
}

export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<CloudinaryResponse[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const [isRemovingAll, setIsRemovingAll] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      setIsDragging(false)
      setIsUploading(true)
      try {
        console.log('Starting file upload...')
        for (const file of acceptedFiles) {
          console.log('Processing file:', file.name)
          const formData = new FormData()
          formData.append('file', file)
          formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'invoice_auto')
          formData.append('folder', 'invoices')

          console.log('Uploading to Cloudinary...')
          const response = await fetch(
            `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/upload`,
            {
              method: 'POST',
              body: formData,
            }
          )

          if (!response.ok) {
            const errorText = await response.text()
            console.error('Upload failed with response:', errorText)
            throw new Error(`Upload failed: ${errorText}`)
          }

          const result = await response.json()
          console.log('Upload successful:', result)
          await handleUploadSuccess({
            event: 'success',
            info: {
              public_id: result.public_id,
              secure_url: result.secure_url,
              original_filename: file.name
            }
          })
        }
      } catch (error) {
        console.error('Upload error:', error)
        setError(error instanceof Error ? error.message : 'Failed to upload file')
      } finally {
        setIsUploading(false)
      }
    },
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxSize: 10000000 // 10MB
  })

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
        where('status', '==', 'pending'),
        orderBy('processedAt', 'desc')
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
      if (error instanceof Error && error.message.includes('index is currently building')) {
        setError('Indexes are still building. Please wait a few minutes and try again.')
      } else {
        setError('Failed to load invoices')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleUploadSuccess = async (result: CloudinaryResponse) => {
    if (result.event === 'success') {
      console.log('Upload success:', result)
      try {
        const invoiceData = {
          fileName: result.info.original_filename,
          fileUrl: result.info.secure_url,
          publicId: result.info.public_id,
          processedAt: new Date(),
          userId: user?.uid,
          status: 'pending' as const
        }

        const docRef = await addDoc(collection(db, 'invoices'), invoiceData)
        console.log('Invoice saved to Firestore:', docRef.id)
        
        // Update local state immediately
        setInvoices(prev => [{
          id: docRef.id,
          ...invoiceData
        }, ...prev])

        // Clear any previous errors
        setError(null)
      } catch (error) {
        console.error('Error saving invoice:', error)
        setError('Failed to save invoice')
      }
    }
  }

  const openUploadWidget = () => {
    console.log('Opening Cloudinary widget...')
    console.log('Cloudinary settings:', {
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      uploadPreset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
    })

    // Add type declaration for window.cloudinary
    const cloudinary = (window as any).cloudinary

    if (!cloudinary) {
      console.error('Cloudinary widget not found on window object')
      setError('Cloudinary widget not initialized')
      return
    }

    const widget = cloudinary.createUploadWidget(
      {
        cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        uploadPreset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
        sources: ['google_drive', 'dropbox', 'camera', 'facebook', 'instagram', 'shutterstock', 'istock', 'getty'],
        multiple: true,
        defaultSource: 'google_drive',
        clientAllowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
        maxFileSize: 10000000,
        resourceType: 'auto',
        folder: 'invoices',
        singleUploadAutoClose: false,
        showUploadMoreButton: true,
        showSkipCropButton: true,
        styles: {
          palette: {
            window: '#FFFFFF',
            windowBorder: '#90A0B3',
            tabIcon: '#0078FF',
            menuIcons: '#5A616A',
            textDark: '#000000',
            textLight: '#FFFFFF',
            link: '#0078FF',
            action: '#FF620C',
            inactiveTabIcon: '#0E2F5A',
            error: '#F44235',
            inProgress: '#0078FF',
            complete: '#20B832',
            sourceBg: '#E4EBF1',
            maxSize: '#999999',
          },
        },
      },
      (error: any, result: any) => {
        console.log('Widget callback:', { error, result })
        if (error) {
          console.error('Upload error:', error)
          setError('Failed to upload file')
        } else if (result.event === 'success') {
          handleUploadSuccess(result)
        }
      }
    )

    if (widget) {
      console.log('Opening widget...')
      widget.open()
    } else {
      console.error('Failed to create upload widget')
      setError('Failed to create upload widget')
    }
  }

  const handleCancelInvoice = async (invoiceId: string, publicId: string) => {
    setIsRemoving(invoiceId)
    try {
      // Delete from Cloudinary
      await fetch(`/api/delete-cloudinary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicId }),
      })

      // Delete from Firestore
      await deleteDoc(doc(db, 'invoices', invoiceId))
      
      setInvoices(prev => prev.filter(invoice => invoice.id !== invoiceId))
    } catch (error) {
      console.error('Error cancelling invoice:', error)
      setError('Failed to cancel invoice')
    } finally {
      setIsRemoving(null)
    }
  }

  const handleCancelAll = async () => {
    setIsRemovingAll(true)
    try {
      // Delete all from Cloudinary
      await Promise.all(
        invoices.map(invoice =>
          fetch(`/api/delete-cloudinary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ publicId: invoice.publicId }),
          })
        )
      )

      // Delete all from Firestore
      await Promise.all(
        invoices.map(invoice => deleteDoc(doc(db, 'invoices', invoice.id)))
      )

      setInvoices([])
    } catch (error) {
      console.error('Error cancelling all invoices:', error)
      setError('Failed to cancel all invoices')
    } finally {
      setIsRemovingAll(false)
    }
  }

  const handleProcessInvoices = () => {
    router.push('/processing')
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">Upload and manage your invoices</p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 relative cursor-pointer ${
                isDragging
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 hover:border-primary-500'
              }`}
            >
              <input {...getInputProps()} />
              {isUploading && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                </div>
              )}
              <CloudArrowUpIcon className={`mx-auto h-12 w-12 transition-colors duration-200 ${
                isDragging ? 'text-primary-500' : 'text-gray-400'
              }`} />
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-900">
                  {isDragging
                    ? 'Drop your files here'
                    : isUploading
                    ? 'Uploading...'
                    : 'Click to browse, or drag and drop your files here'}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  PDF, JPG, or PNG up to 10MB
                </p>
              </div>
            </div>
            {/* Upload Button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={openUploadWidget}
                disabled={isUploading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  'Upload invoice from other sources'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Invoices List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Pending Invoices</h2>
              <div className="flex space-x-3">
                {invoices.length > 0 && (
                  <>
                    <button
                      onClick={handleCancelAll}
                      disabled={isRemovingAll}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRemovingAll ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700 mr-2"></div>
                          Removing...
                        </>
                      ) : (
                        'Cancel All'
                      )}
                    </button>
                    <button
                      onClick={handleProcessInvoices}
                      disabled={isRemovingAll}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Process Invoices
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="px-6 py-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
            </div>
          ) : error ? (
            <div className="px-6 py-4 text-center text-red-500">{error}</div>
          ) : invoices.length === 0 ? (
            <div className="px-6 py-4 text-center text-gray-500">
              No invoices uploaded yet
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{invoice.fileName}</div>
                      <div className="text-sm text-gray-500">
                        Uploaded on {invoice.processedAt.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelInvoice(invoice.id, invoice.publicId)}
                    disabled={isRemoving === invoice.id}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRemoving === invoice.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700 mr-2"></div>
                        Removing...
                      </>
                    ) : (
                      'Cancel'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 