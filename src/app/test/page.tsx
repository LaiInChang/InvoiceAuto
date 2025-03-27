'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { CldUploadButton } from 'next-cloudinary'
import { User } from 'firebase/auth'
import { useDropzone } from 'react-dropzone'
import { CloudinaryUploadWidget } from '@/components/CloudinaryUploadWidget'
import { DebugPanel } from '@/components/DebugPanel'
import { InvoiceUploader } from '@/components/InvoiceUploader'
import { InvoiceList } from '@/components/InvoiceList'
import { InvoiceReport } from '@/components/InvoiceReport'
import { Invoice } from '@/types/invoice'

interface CloudinaryResponse {
  event: string
  info: {
    public_id: string
    secure_url: string
    original_filename: string
  }
}

interface ProcessedResult {
  success: boolean
  fileUrl: string
  data?: Invoice
  error?: string
}

interface BatchInfo {
  number: number
  total: number
}

export default function TestPage() {
  const { user, signOut, getIdToken } = useAuth()
  const router = useRouter()
  const [uploadedFiles, setUploadedFiles] = useState<CloudinaryResponse[]>([])
  const [processingStatus, setProcessingStatus] = useState<Map<string, ProcessingStatus>>(new Map())
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null)
  const [results, setResults] = useState<ProcessedResult[]>([])
  const [currentBatch, setCurrentBatch] = useState<BatchInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gptResults, setGptResults] = useState<Map<string, any>>(new Map())

  const handleUploadSuccess = async (result: CloudinaryResponse) => {
    console.log('Cloudinary upload result:', result)
    if (result.event === 'success') {
      const processedFileData = {
        public_id: result.info.public_id,
        secure_url: result.info.secure_url,
        original_filename: result.info.original_filename
      }
      console.log('Processed file data:', processedFileData)
      setUploadedFiles(prev => [...prev, processedFileData])
    }
  }

  const handleUploadError = (error: any) => {
    console.error('Upload error:', error)
    setError('Failed to upload file')
  }

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.public_id !== fileId))
  }

  const handleProcessInvoices = async () => {
    if (!user || uploadedFiles.length === 0) return;

    try {
      setIsProcessing(true);
      setProcessingStartTime(Date.now());
      setError(null);
      setResults([]);
      setCurrentBatch(null);
      setGptResults(new Map());

      // Get Firebase token
      const idToken = await getIdToken();

      // Clear previous statuses (simplified)
      const clearResponse = await fetch('/api/clear-statuses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!clearResponse.ok) {
        throw new Error('Authentication failed');
      }

      // Process files in batches of 5
      const batchSize = 5;
      const totalBatches = Math.ceil(uploadedFiles.length / batchSize);

      for (let batchNumber = 1; batchNumber <= totalBatches; batchNumber++) {
        setCurrentBatch({ number: batchNumber, total: totalBatches });
        
        const startIndex = (batchNumber - 1) * batchSize;
        const endIndex = Math.min(startIndex + batchSize, uploadedFiles.length);
        const batchFiles = uploadedFiles.slice(startIndex, endIndex);

        // Process current batch
        const response = await fetch('/api/process-invoice', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileUrls: batchFiles.map(file => file.secure_url),
            batchNumber,
            totalBatches,
            batchSize
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to process batch ${batchNumber}`);
        }

        const batchResults = await response.json();
        
        // Update results with current batch
        setResults(prev => [...prev, ...batchResults.results]);
        
        // Update GPT-4 results
        batchResults.results.forEach((result: ProcessedResult) => {
          if (result.success && result.data) {
            setGptResults(prev => {
              const newResults = new Map(prev);
              newResults.set(result.fileUrl, result.data);
              return newResults;
            });
          }
        });
        
        // Update processing status for each file in the batch
        batchResults.results.forEach((result: ProcessedResult) => {
          setProcessingStatus(prev => {
            const newStatus = new Map(prev);
            newStatus.set(result.fileUrl, {
              status: result.success ? 'Processed' : 'Error',
              stage: result.success ? 'Completed' : 'Error',
              error: result.error
            });
            return newStatus;
          });
        });

        // If this is the last batch, stop processing
        if (batchNumber === totalBatches) {
          setIsProcessing(false);
          setProcessingStartTime(null);
          setCurrentBatch(null);
        }
      }
    } catch (error) {
      console.error('Error processing invoices:', error);
      setError(error instanceof Error ? error.message : 'Failed to process invoices');
      setIsProcessing(false);
      setProcessingStartTime(null);
      setCurrentBatch(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4">Please sign in to continue</h1>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Invoice Processing</h1>
          <button
            onClick={signOut}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Upload Invoices</h2>
              <CloudinaryUploadWidget
                onSuccess={handleUploadSuccess}
                onError={handleUploadError}
              />
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Uploaded Files</h2>
              <InvoiceList
                invoices={uploadedFiles.map(file => ({
                  fileUrl: file.secure_url,
                  fileName: file.original_filename,
                  status: processingStatus.get(file.secure_url)?.status || 'Pending'
                }))}
                onRemove={handleRemoveFile}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Processing Status</h2>
              <div className="space-y-4">
                {currentBatch && (
                  <div className="bg-blue-50 p-4 rounded">
                    <h3 className="text-blue-800 font-medium">Current Batch</h3>
                    <p className="text-lg font-semibold text-blue-600">
                      Processing batch {currentBatch.number} of {currentBatch.total}
                    </p>
                  </div>
                )}
                {isProcessing && processingStartTime && (
                  <div className="bg-yellow-50 p-4 rounded">
                    <h3 className="text-yellow-800 font-medium">Processing Time</h3>
                    <p className="text-lg font-semibold text-yellow-600">
                      {Math.floor((Date.now() - processingStartTime) / 1000)} seconds
                    </p>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 p-4 rounded">
                    <h3 className="text-red-800 font-medium">Error</h3>
                    <p className="text-red-600">{error}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Processing Report</h2>
              <InvoiceReport invoices={results.map(result => ({
                ...result.data,
                fileUrl: result.fileUrl,
                status: result.success ? 'Processed' : 'Error',
                error: result.error
              }))} />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={handleProcessInvoices}
            disabled={isProcessing || uploadedFiles.length === 0}
            className={`w-full py-3 px-4 rounded-lg text-white font-semibold ${
              isProcessing || uploadedFiles.length === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isProcessing ? 'Processing...' : 'Process Invoices'}
          </button>
        </div>

        {gptResults.size > 0 && (
          <div className="mt-8 bg-white p-6 rounded-lg shadow overflow-x-auto">
            <h2 className="text-xl font-semibold mb-4">GPT-4 Analysis Results</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">Invoice Number</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Date</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Quarter</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Month</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Category</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Supplier</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Description</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">VAT Region</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Currency</th>
                    <th className="border border-gray-200 px-4 py-2 text-right">Amount (Incl. VAT)</th>
                    <th className="border border-gray-200 px-4 py-2 text-right">Amount (Excl. VAT)</th>
                    <th className="border border-gray-200 px-4 py-2 text-right">VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(gptResults.entries()).map(([fileUrl, data]) => (
                    <tr key={fileUrl} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-4 py-2">{data.InvoiceNumber || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.InvoiceDate || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.InvoiceQuarter || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.InvoiceMonth || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.Category || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.Supplier || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.Description || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.VATRegion || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2">{data.Currency || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2 text-right">{data.AmountInclVAT || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2 text-right">{data.AmountExVAT || '-'}</td>
                      <td className="border border-gray-200 px-4 py-2 text-right">{data.VAT || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 