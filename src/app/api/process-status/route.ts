import { NextResponse } from 'next/server'
import { auth } from '@/lib/firebase-admin'

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

// In-memory storage for processing status
const processingStatus = new Map<string, ProcessingStatus>()

export async function GET(request: Request) {
  try {
    // Get the token from the URL
    const url = new URL(request.url)
    const token = url.searchParams.get('token')

    if (!token) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Verify the token
    try {
      await auth.verifyIdToken(token)
    } catch (error) {
      console.error('Token verification failed:', error)
      return new Response('Unauthorized', { status: 401 })
    }

    // Create a ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        controller.enqueue('data: ' + JSON.stringify({ type: 'connected' }) + '\n\n')

        // Set up interval to send updates
        const intervalId = setInterval(() => {
          const status = Object.fromEntries(processingStatus)
          if (Object.keys(status).length > 0) {
            controller.enqueue('data: ' + JSON.stringify({ type: 'status', status }) + '\n\n')
          }
        }, 1000)

        // Clean up on client disconnect
        request.signal.addEventListener('abort', () => {
          clearInterval(intervalId)
          controller.close()
        })
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    console.error('SSE setup error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

// Function to update processing status
export function updateProcessingStatus(fileId: string, status: ProcessingStatus) {
  processingStatus.set(fileId, status)
}

// Function to clear processing status
export function clearProcessingStatus() {
  processingStatus.clear()
} 