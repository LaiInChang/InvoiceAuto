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
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

interface Invoice {
  id: string;
  fileName: string;
  fileUrl: string;
  processedAt: Date;
  userId: string;
}

interface Report {
  id: string;
  fileName: string;
  fileUrl: string;
  processedAt: Date;
  userId: string;
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
  const [batchSize, setBatchSize] = useState<number>(10); // Default batch size of 10
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [editableResults, setEditableResults] = useState<Map<string, any>>(new Map());
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

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

  const saveInvoiceToFirebase = async (fileUrl: string, fileName: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const invoiceData = {
        fileName,
        fileUrl,
        processedAt: new Date(),
        userId: user.uid
      };

      const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
      return docRef.id;
    } catch (error) {
      console.error('Error saving invoice to Firebase:', error);
      throw error;
    }
  };

  const saveReportToFirebase = async (fileUrl: string, fileName: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const reportData = {
        fileName,
        fileUrl,
        processedAt: new Date(),
        userId: user.uid
      };

      const docRef = await addDoc(collection(db, 'reports'), reportData);
      return docRef.id;
    } catch (error) {
      console.error('Error saving report to Firebase:', error);
      throw error;
    }
  };

  const loadInvoices = async () => {
    if (!user) {
      console.log('User not authenticated, skipping invoice load');
      return;
    }

    try {
      setIsLoadingInvoices(true);
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('userId', '==', user.uid),
        orderBy('processedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(invoicesQuery);
      const invoicesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[];
      
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Error loading invoices:', error);
      if (error instanceof Error) {
        // Check if the error is due to index building
        if (error.message.includes('index is currently building')) {
          setError('Indexes are still building. Please wait a few minutes and try again.');
        } else {
          setError(`Failed to load invoices: ${error.message}`);
        }
      } else {
        setError('Failed to load invoices');
      }
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const loadReports = async () => {
    if (!user) {
      console.log('User not authenticated, skipping report load');
      return;
    }

    try {
      setIsLoadingReports(true);
      const reportsQuery = query(
        collection(db, 'reports'),
        where('userId', '==', user.uid),
        orderBy('processedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(reportsQuery);
      const reportsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[];
      
      setReports(reportsData);
    } catch (error) {
      console.error('Error loading reports:', error);
      if (error instanceof Error) {
        // Check if the error is due to index building
        if (error.message.includes('index is currently building')) {
          setError('Indexes are still building. Please wait a few minutes and try again.');
        } else {
          setError(`Failed to load reports: ${error.message}`);
        }
      } else {
        setError('Failed to load reports');
      }
    } finally {
      setIsLoadingReports(false);
    }
  };

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

      // Process files in batches
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
        
        // Save invoices to Firebase
        for (const file of batchFiles) {
          await saveInvoiceToFirebase(file.secure_url, file.original_filename);
        }
        
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

      // Load updated invoices after processing
      await loadInvoices();
    } catch (error) {
      console.error('Error processing invoices:', error);
      setError(error instanceof Error ? error.message : 'Failed to process invoices');
      setIsProcessing(false);
      setProcessingStartTime(null);
      setCurrentBatch(null);
    }
  };

  const handleGenerateReport = async () => {
    if (!user || gptResults.size === 0) return;

    try {
      setIsGeneratingReport(true);
      setError(null);

      // Create Excel file from GPT results
      const excelData = Array.from(gptResults.entries()).map(([fileUrl, data]) => ({
        ...data,
        fileUrl
      }));

      // Generate Excel file
      const response = await fetch('/api/generate-excel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: excelData })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate Excel file');
      }

      const { fileUrl, fileName } = await response.json();

      // Save report to Firebase
      await saveReportToFirebase(fileUrl, fileName);

      // Load updated reports
      await loadReports();

      // Show success message
      setError('Report generated successfully!');
    } catch (error) {
      console.error('Error generating report:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadInvoices();
      loadReports();
    }
  }, [user]);

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

        <div className="mt-8 space-y-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Processing Settings</h2>
            <div className="flex items-center space-x-4">
              <label htmlFor="batchSize" className="text-gray-700">
                Batch Size:
              </label>
              <input
                type="number"
                id="batchSize"
                min="1"
                max="10"
                value={batchSize}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value >= 1 && value <= 10) {
                    setBatchSize(value);
                  }
                }}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">
                (1-10 files per batch)
              </span>
            </div>
          </div>

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

        <div className="mt-8 bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Uploaded Invoices</h2>
            <button
              onClick={loadInvoices}
              disabled={isLoadingInvoices}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isLoadingInvoices ? 'Loading...' : 'Refresh Invoices'}
            </button>
          </div>

          {isLoadingInvoices ? (
            <div className="text-center py-4">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No invoices available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">File Name</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Uploaded At</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-4 py-2">
                        <a
                          href={invoice.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {invoice.fileName}
                        </a>
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        {new Date(invoice.processedAt).toLocaleString()}
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        <span className="px-2 py-1 rounded-full text-sm bg-green-100 text-green-800">
                          Uploaded
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8 bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Generated Reports</h2>
            <button
              onClick={loadReports}
              disabled={isLoadingReports}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isLoadingReports ? 'Loading...' : 'Refresh Reports'}
            </button>
          </div>

          {isLoadingReports ? (
            <div className="text-center py-4">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No reports available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">File Name</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Generated At</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-4 py-2">
                        <a
                          href={report.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {report.fileName}
                        </a>
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        {new Date(report.processedAt).toLocaleString()}
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        <span className="px-2 py-1 rounded-full text-sm bg-green-100 text-green-800">
                          Generated
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {gptResults.size > 0 && (
          <div className="mt-8 bg-white p-6 rounded-lg shadow overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">GPT-4 Analysis Results</h2>
              <button
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
                className={`px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400`}
              >
                {isGeneratingReport ? 'Generating Report...' : 'Generate Excel Report'}
              </button>
            </div>
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