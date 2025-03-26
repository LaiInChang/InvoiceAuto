'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { CldUploadButton } from 'next-cloudinary'
import { User } from 'firebase/auth'
import { io, Socket } from 'socket.io-client'

interface CloudinaryResponse {
  public_id: string
  secure_url: string
  original_filename: string
}

interface ProcessedResult {
  success: boolean;
  data?: any;
  error?: string;
  fileUrl: string;
}

interface FailedUrl {
  url: string;
  error: string;
}

interface ProcessingStatus {
  status: 'Pending' | 'Processing' | 'Processed' | 'Error' | 'Failed';
  stage: 'Reading' | 'Analyzing' | 'Completed' | 'Error';
  currentStage?: 'Azure' | 'GPT4';
  startTime?: number;
  endTime?: number;
  duration?: number;
  error?: string;
  batchNumber?: number;
  totalBatches?: number;
  fileName?: string;
  data?: {
    InvoiceYear?: string;
    InvoiceQuarter?: string;
    InvoiceMonth?: string;
    InvoiceDate?: string;
    InvoiceNumber?: string;
    Category?: string;
    Supplier?: string;
    Description?: string;
    VATRegion?: string;
    Currency?: string;
    AmountInclVAT?: number;
    AmountExVAT?: number;
    VAT?: number;
  };
}

interface BatchResult {
  results: ProcessedResult[];
  failedUrls: FailedUrl[];
  totalBatches: number;
  batchSize: number;
}

export default function Test() {
  const { user, signOut, getIdToken } = useAuth()
  const router = useRouter()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<CloudinaryResponse[]>([])
  const [processingStatus, setProcessingStatus] = useState<Map<string, ProcessingStatus>>(new Map())
  const [results, setResults] = useState<any[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStartTime, setProcessingStartTime] = useState<Date | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [currentBatch, setCurrentBatch] = useState<{ number: number; total: number } | null>(null)
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!socket && user) {
      const initSocket = async () => {
        try {
          const idToken = await user.getIdToken();
          const newSocket = io({
            path: '/api/socketio',
            auth: { token: idToken }
          });

          newSocket.on('connect', () => {
            console.log('Socket.IO connected');
          });

          newSocket.on('disconnect', () => {
            console.log('Socket.IO disconnected');
          });

          newSocket.on('processingStatus', (data) => {
            console.log('Received processing status:', data);
            setProcessingStatus(prev => {
              const newStatus = new Map(prev);
              newStatus.set(data.fileUrl, data.status);
              return newStatus;
            });
          });

          newSocket.on('batchComplete', (data) => {
            console.log('Batch completed:', data);
            // Update batch information
            setCurrentBatch({
              number: data.batchNumber,
              total: data.totalBatches
            });

            // Update results for this batch
            setResults(prev => {
              const newResults = [...prev];
              data.results.forEach((result: ProcessedResult) => {
                if (result.success) {
                  newResults.push(result);
                }
              });
              return newResults;
            });

            // If this is the last batch, stop processing
            if (data.batchNumber === data.totalBatches) {
              setIsProcessing(false);
              setProcessingStartTime(null);
              setCurrentBatch(null);
            }
          });

          setSocket(newSocket);

          return () => {
            newSocket.close();
          };
        } catch (error) {
          console.error('Failed to initialize Socket.IO:', error);
        }
      };

      initSocket();
    }
  }, [socket, user]);

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

    setProcessingStatus(prev => {
      const newStatus = new Map(prev)
      newStatus.set(info.secure_url, {
        status: 'Pending',
        stage: 'Reading',
        startTime: new Date().getTime()
      })
      return newStatus
    })
  }

  const handleUploadError = (error: any) => {
    console.error('Upload error:', error)
  }

  const formatElapsedTime = (seconds: number) => {
    return seconds.toFixed(1)
  }

  const handleProcess = async () => {
    if (!uploadedFiles.length) return;

    console.log('Starting processing with files:', uploadedFiles);
    setIsProcessing(true);
    setProcessingStartTime(new Date());
    setProcessingStatus(new Map());
    setBatchResults([]);
    setElapsedTime(0);

    try {
      const idToken = await getIdToken();
      console.log('Sending request to process-invoice with files:', uploadedFiles.map(f => f.secure_url));
      const response = await fetch('/api/process-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          fileUrls: uploadedFiles.map(file => file.secure_url)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process invoices');
      }

      const data = await response.json();
      console.log('Received processing response:', data);
      setBatchResults(prev => [...prev, data]);
      
      // Update batch information
      if (data.totalBatches) {
        setCurrentBatch({
          number: 1,
          total: data.totalBatches
        });
      }
      
      // Update final status
      data.results.forEach((result: ProcessedResult) => {
        console.log('Processing result:', result);
        if (result.success) {
          setProcessingStatus(prev => {
            const newStatus = new Map(prev);
            newStatus.set(result.fileUrl, {
              status: 'Processed',
              stage: 'Completed',
              fileName: result.fileUrl.split('/').pop(),
              endTime: new Date().getTime(),
              data: result.data // Add the extracted data here
            });
            return newStatus;
          });
        }
      });

      data.failedUrls.forEach((failed: FailedUrl) => {
        console.log('Processing failed URL:', failed);
        setProcessingStatus(prev => {
          const newStatus = new Map(prev);
          newStatus.set(failed.url, {
            status: 'Error',
            stage: 'Error',
            error: failed.error,
            fileName: failed.url.split('/').pop(),
            endTime: new Date().getTime()
          });
          return newStatus;
        });
      });

    } catch (error) {
      console.error('Processing error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process invoices');
    } finally {
      setIsProcessing(false);
      setProcessingStartTime(null);
      setCurrentBatch(null);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    const file = uploadedFiles.find(f => f.public_id === fileId)
    if (!file) return

    setUploadedFiles(prev => prev.filter(f => f.public_id !== fileId))
    setProcessingStatus(prev => {
      const newStatus = new Map(prev)
      newStatus.delete(file.secure_url)
      return newStatus
    })
    setResults(prev => prev.filter(result => result.fileUrl !== file.secure_url))
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
                {currentBatch && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-blue-800">
                        Processing Batch {currentBatch.number} of {currentBatch.total}
                      </span>
                      <span className="text-sm text-blue-600">
                        {formatElapsedTime(elapsedTime)}s
                      </span>
                    </div>
                    <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(currentBatch.number / currentBatch.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {uploadedFiles.map((file) => {
                    const status = processingStatus.get(file.secure_url);
                    return (
                      <div key={`${file.public_id}-${file.secure_url}`} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm text-gray-600">{file.original_filename}</span>
                          <div className="flex flex-col">
                            <span className={`px-2 py-1 text-xs rounded ${
                              status?.status === 'Error' 
                                ? 'bg-red-100 text-red-800'
                                : status?.status === 'Processed'
                                ? 'bg-green-100 text-green-800'
                                : status?.status === 'Processing'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {status?.status || 'Ready'}
                            </span>
                            {status?.stage && (
                              <span className={`text-xs ${
                                status.stage === 'Reading'
                                  ? 'text-blue-600'
                                  : status.stage === 'Analyzing'
                                  ? 'text-purple-600'
                                  : status.stage === 'Completed'
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}>
                                {status.currentStage === 'Azure' 
                                  ? 'Reading with Azure...'
                                  : status.currentStage === 'GPT4'
                                  ? 'Analyzing with GPT-4...'
                                  : status.stage}
                              </span>
                            )}
                            {status?.startTime && (
                              <span className="text-xs text-gray-500">
                                Started: {new Date(status.startTime).toLocaleTimeString()}
                              </span>
                            )}
                            {status?.duration !== undefined && (
                              <span className="text-xs text-gray-500">
                                Duration: {formatDuration(status.duration)}
                              </span>
                            )}
                            {status?.error && (
                              <span className="text-xs text-red-600">
                                Error: {status.error}
                              </span>
                            )}
                            {status?.data && (
                              <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {Object.entries(status.data).map(([key, value]) => (
                                    value && (
                                      <div key={key} className="flex justify-between">
                                        <span className="text-gray-600">{key}:</span>
                                        <span className="font-medium">{value}</span>
                                      </div>
                                    )
                                  ))}
                                </div>
                              </div>
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
                    );
                  })}
                </div>

                {/* Batch Results */}
                {batchResults.length > 0 && (
                  <div className="mt-8">
                    <h2 className="text-xl font-semibold mb-4">Processing Results</h2>
                    {batchResults.map((batch, index) => (
                      <div key={index} className="bg-white p-4 rounded-lg shadow mb-4">
                        <h3 className="font-medium mb-2">Batch {index + 1}</h3>
                        <div className="space-y-2">
                          <p>Successfully processed: {batch.results.length} invoices</p>
                          <p>Failed: {batch.failedUrls.length} invoices</p>
                          <p>Batch size: {batch.batchSize}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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