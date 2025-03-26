'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { CldUploadButton } from 'next-cloudinary'

interface CloudinaryResponse {
  public_id: string
  secure_url: string
  original_filename: string
}

interface ProcessingStatus {
  status: string
  stage?: 'Reading' | 'Analyzing' | 'Completed' | 'Error'
  startTime?: Date
  endTime?: Date
  duration?: number
  error?: string
}

export default function Test() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [uploadedFiles, setUploadedFiles] = useState<CloudinaryResponse[]>([])
  const [processingStatus, setProcessingStatus] = useState<{ [key: string]: ProcessingStatus }>({})
  const [results, setResults] = useState<any[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStartTime, setProcessingStartTime] = useState<Date | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    let intervalId: NodeJS.Timeout

    if (isProcessing && processingStartTime) {
      intervalId = setInterval(() => {
        const now = new Date()
        const elapsed = (now.getTime() - processingStartTime.getTime()) / 1000
        setElapsedTime(elapsed)
      }, 100)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isProcessing, processingStartTime])

  if (!user) {
    router.push('/login')
    return null
  }

  const handleUploadSuccess = (result: any) => {
    console.log('Cloudinary upload result:', result)
    
    // Handle both old and new result formats
    const info = result.info || result
    if (!info || !info.public_id || !info.secure_url) {
      console.error('Invalid upload result:', result)
      return
    }

    const fileData: CloudinaryResponse = {
      public_id: info.public_id,
      secure_url: info.secure_url,
      original_filename: info.original_filename || 'Unknown file'
    }

    console.log('Processed file data:', fileData)
    
    // Check for duplicate files
    setUploadedFiles(prev => {
      const isDuplicate = prev.some(file => file.public_id === fileData.public_id)
      if (isDuplicate) {
        console.log('Skipping duplicate file:', fileData.original_filename)
        return prev
      }
      return [...prev, fileData]
    })

    setProcessingStatus(prev => ({
      ...prev,
      [info.public_id]: {
        status: 'Ready'
      }
    }))
  }

  const handleUploadError = (error: any) => {
    console.error('Upload error:', error)
  }

  const formatElapsedTime = (seconds: number) => {
    return seconds.toFixed(1)
  }

  const handleProcess = async () => {
    if (uploadedFiles.length === 0) return

    setIsProcessing(true)
    setProcessingStatus({})
    setResults([])
    setProcessingStartTime(new Date())
    setElapsedTime(0)

    // Initialize processing status with start times
    const initialStatus: { [key: string]: ProcessingStatus } = {}
    uploadedFiles.forEach(file => {
      initialStatus[file.public_id] = {
        status: 'Processing',
        stage: 'Reading',
        startTime: new Date()
      }
    })
    setProcessingStatus(initialStatus)

    try {
      console.log('Files to process:', uploadedFiles)
      const fileUrls = uploadedFiles.map(file => file.secure_url)
      console.log('File URLs to send:', fileUrls)

      const response = await fetch('/api/process-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({
          fileUrls
        })
      })

      // Update status to Analyzing stage
      const analyzingStatus: { [key: string]: ProcessingStatus } = {}
      uploadedFiles.forEach(file => {
        analyzingStatus[file.public_id] = {
          ...processingStatus[file.public_id],
          stage: 'Analyzing'
        }
      })
      setProcessingStatus(analyzingStatus)

      console.log('Response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))

      const data = await response.json()
      console.log('Response data:', data)
      
      if (data.success) {
        setResults(data.results)
        // Update processing status for each file
        const newStatus: { [key: string]: ProcessingStatus } = {}
        data.results.forEach((result: any) => {
          const fileId = uploadedFiles.find(f => f.secure_url === result.fileUrl)?.public_id
          if (fileId) {
            const startTime = processingStatus[fileId]?.startTime
            const endTime = new Date()
            const duration = startTime ? endTime.getTime() - startTime.getTime() : undefined

            newStatus[fileId] = {
              status: result.success ? 'Processed' : 'Failed',
              stage: result.success ? 'Completed' : 'Error',
              startTime,
              endTime,
              duration,
              error: result.error
            }
          }
        })
        setProcessingStatus(newStatus)
      } else {
        throw new Error(data.error || 'Failed to process invoices')
      }
    } catch (error) {
      console.error('Error processing invoices:', error)
      // Update status for all files to show error
      const newStatus: { [key: string]: ProcessingStatus } = {}
      uploadedFiles.forEach(file => {
        const startTime = processingStatus[file.public_id]?.startTime
        const endTime = new Date()
        const duration = startTime ? endTime.getTime() - startTime.getTime() : undefined

        newStatus[file.public_id] = {
          status: 'Error',
          stage: 'Error',
          startTime,
          endTime,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      setProcessingStatus(newStatus)
    } finally {
      setIsProcessing(false)
      setProcessingStartTime(null)
    }
  }

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.public_id !== fileId))
    setProcessingStatus(prev => {
      const newStatus = { ...prev }
      delete newStatus[fileId]
      return newStatus
    })
    setResults(prev => prev.filter(result => {
      const file = uploadedFiles.find(f => f.public_id === fileId)
      return result.fileUrl !== file?.secure_url
    }))
  }

  const formatDuration = (ms: number | undefined) => {
    if (!ms) return 'N/A'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Invoice Processing Test</h1>
            <button
              onClick={signOut}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Sign Out
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Invoices</h2>
              <CldUploadButton
                uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
                onSuccess={handleUploadSuccess}
                onError={handleUploadError}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              />
            </div>

            {uploadedFiles.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-gray-900 mb-4">Uploaded Files</h2>
                <div className="space-y-2">
                  {uploadedFiles.map((file) => (
                    <div key={`${file.public_id}-${file.secure_url}`} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-600">{file.original_filename}</span>
                        <div className="flex flex-col">
                          <span className={`px-2 py-1 text-xs rounded ${
                            processingStatus[file.public_id]?.status === 'Error' 
                              ? 'bg-red-100 text-red-800'
                              : processingStatus[file.public_id]?.status === 'Processed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {processingStatus[file.public_id]?.status || 'Ready'}
                          </span>
                          {processingStatus[file.public_id]?.stage && (
                            <span className={`text-xs ${
                              processingStatus[file.public_id]?.stage === 'Reading'
                                ? 'text-blue-600'
                                : processingStatus[file.public_id]?.stage === 'Analyzing'
                                ? 'text-purple-600'
                                : processingStatus[file.public_id]?.stage === 'Completed'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}>
                              {processingStatus[file.public_id]?.stage}
                            </span>
                          )}
                          {processingStatus[file.public_id]?.startTime && (
                            <span className="text-xs text-gray-500">
                              Started: {processingStatus[file.public_id]?.startTime?.toLocaleTimeString()}
                            </span>
                          )}
                          {processingStatus[file.public_id]?.duration !== undefined && (
                            <span className="text-xs text-gray-500">
                              Duration: {formatDuration(processingStatus[file.public_id]?.duration)}
                            </span>
                          )}
                          {processingStatus[file.public_id]?.error && (
                            <span className="text-xs text-red-600">
                              Error: {processingStatus[file.public_id]?.error}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(file.public_id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className={`mt-4 px-4 py-2 rounded ${
                    isProcessing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex items-center space-x-2">
                      <span>Processing...</span>
                      <span className="text-sm">
                        ({formatElapsedTime(elapsedTime)}s)
                      </span>
                    </div>
                  ) : (
                    'Process All Invoices'
                  )}
                </button>
              </div>
            )}

            {results.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-gray-900 mb-4">Processing Results</h2>
                <div className="space-y-4">
                  {results.map((result, index) => {
                    const file = uploadedFiles.find(f => f.secure_url === result.fileUrl)
                    return (
                      <div key={`${file?.public_id || index}-${result.fileUrl}`} className="p-4 bg-gray-50 rounded">
                        <h3 className="font-medium text-gray-900 mb-2">
                          File: {file?.original_filename}
                        </h3>
                        {result.success ? (
                          <pre className="bg-white p-4 rounded overflow-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        ) : (
                          <div className="text-red-600">
                            Error: {result.error}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 