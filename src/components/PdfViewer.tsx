'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

// Set worker path to use CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  fileUrl: string
  fileName: string
  zoomLevel: number
}

export default function PdfViewer({ fileUrl, fileName, zoomLevel }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Check if the file is an image
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
    setIsLoading(false)
    setError(null)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF document:', error)
    setError(`Failed to load PDF: ${error.message}`)
    setIsLoading(false)
  }

  const changePage = (offset: number) => {
    if (!numPages) return
    setPageNumber(prevPageNumber => {
      const newPageNumber = prevPageNumber + offset
      return Math.max(1, Math.min(numPages, newPageNumber))
    })
  }

  return (
    <div className="pdf-container flex flex-col items-center">
      {isLoading && !isImage && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-2 text-gray-600">Loading PDF...</p>
        </div>
      )}
      
      {error ? (
        <div className="text-center py-8">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-red-700">{error}</p>
            <div className="mt-4">
              <a 
                href={fileUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Open file in new tab
              </a>
            </div>
          </div>
        </div>
      ) : isImage ? (
        <div className="w-full h-full flex justify-center items-center">
          <img 
            src={fileUrl} 
            alt={fileName}
            className="max-w-full max-h-full object-contain"
            onLoad={() => setIsLoading(false)}
            onError={(e) => {
              console.error('Error loading image:', e)
              setError('Failed to load image')
              setIsLoading(false)
            }}
          />
        </div>
      ) : (
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null} // We handle loading state ourselves
          error={null} // We handle error state ourselves
        >
          {!isLoading && (
            <Page 
              pageNumber={pageNumber} 
              scale={zoomLevel}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              error={
                <div className="text-center py-8 text-red-500">
                  Failed to render page {pageNumber}
                </div>
              }
            />
          )}
        </Document>
      )}

      {!isImage && numPages && numPages > 1 && (
        <div className="flex justify-between items-center mt-4 bg-gray-100 p-2 rounded w-full max-w-md">
          <button 
            onClick={() => changePage(-1)} 
            disabled={pageNumber <= 1}
            className={`px-2 py-1 rounded flex items-center ${pageNumber <= 1 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-100'}`}
          >
            <ChevronLeftIcon className="h-4 w-4 mr-1" />
            Previous
          </button>
          <p className="text-sm">
            Page {pageNumber} of {numPages}
          </p>
          <button 
            onClick={() => changePage(1)} 
            disabled={pageNumber >= numPages}
            className={`px-2 py-1 rounded flex items-center ${pageNumber >= numPages ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-100'}`}
          >
            Next
            <ChevronRightIcon className="h-4 w-4 ml-1" />
          </button>
        </div>
      )}
    </div>
  )
} 