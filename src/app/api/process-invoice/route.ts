import { NextResponse } from 'next/server'
import { auth } from '@/lib/firebase-admin'
import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer'
import OpenAI from 'openai'
import { v2 as cloudinary } from 'cloudinary'

// Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Initialize Azure Document Analysis client
const endpoint = process.env.AZURE_DOCUMENT_ENDPOINT
const key = process.env.AZURE_DOCUMENT_KEY

if (!endpoint || !key) {
  throw new Error('Azure Document Intelligence credentials are not properly configured')
}

console.log('Initializing Azure client with endpoint:', endpoint)
const documentAnalysisClient = new DocumentAnalysisClient(
  endpoint,
  new AzureKeyCredential(key)
)

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Function to process a single invoice
async function processInvoice(fileUrl: string) {
  try {
    if (!fileUrl) {
      throw new Error('File URL is required')
    }

    console.log('Processing invoice with URL:', fileUrl)

    // Download the file using fetch with the original URL
    const fileResponse = await fetch(fileUrl)
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`)
    }

    const contentType = fileResponse.headers.get('content-type')
    console.log('File content type:', contentType)

    const fileBuffer = await fileResponse.arrayBuffer()
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      throw new Error('Downloaded file is empty')
    }

    const buffer = Buffer.from(fileBuffer)
    console.log('Buffer size:', buffer.length, 'bytes')

    console.log('Starting Azure document analysis for file:', fileUrl)
    console.log('Buffer size:', buffer.length, 'bytes')

    const poller = await documentAnalysisClient.beginAnalyzeDocument(
      'prebuilt-invoice',
      buffer
    )
    console.log('Azure analysis started, waiting for completion...')
    const result = await poller.pollUntilDone()
    console.log('Azure analysis completed')
    
    // Extract text from the document
    if (!result.pages || result.pages.length === 0) {
      throw new Error('No pages found in the document')
    }

    // Extract text and key-value pairs
    const extractedText = result.pages
      .map(page => {
        if (!page.lines || page.lines.length === 0) return ''
        return page.lines
          .filter(line => line && line.content)
          .map(line => line.content)
          .join(' ')
      })
      .filter(text => text.trim().length > 0)
      .join('\n')

    // Log the Azure result for debugging
    console.log('Azure Result:', {
      pages: result.pages.length,
      extractedTextLength: extractedText.length,
      hasContent: extractedText.trim().length > 0
    })

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text was extracted from the document')
    }

    // Use GPT-4 to structure the data with retry logic
    let extractedData;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: `Extract these fields from the invoice text:
                InvoiceYear, InvoiceQuarter (1-4), InvoiceMonth (MM), InvoiceDate (DD),
                InvoiceNumber, Category, Supplier, Description, VATRegion, Currency,
                AmountInclVAT, AmountExVAT, VAT
                
                Return as JSON. Leave empty if not found. Infer Category, VATRegion, and Currency if not explicit.`
            },
            {
              role: "user",
              content: extractedText || 'No text extracted from document'
            }
          ],
          response_format: { type: "json_object" }
        })

        const content = completion.choices[0].message.content
        if (!content) {
          throw new Error('No content received from GPT-4')
        }
        
        extractedData = JSON.parse(content)
        break; // Success, exit the retry loop
        
      } catch (error) {
        console.error('GPT-4 processing error:', error)
        retryCount++;
        if (retryCount > maxRetries) {
          throw new Error(`GPT-4 processing failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
      }
    }

    return {
      success: true,
      data: extractedData,
      rawText: extractedText,
      fileUrl
    }

  } catch (error) {
    console.error('Invoice processing error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      fileUrl
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fileUrl
    }
  }
}

export async function POST(request: Request) {
  try {
    // Verify Firebase token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]
    try {
      await auth.verifyIdToken(token)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get file URLs from request body
    const body = await request.json()
    const { fileUrls } = body
    if (!fileUrls || !Array.isArray(fileUrls) || fileUrls.length === 0) {
      return NextResponse.json({ error: 'File URLs array is required' }, { status: 400 })
    }

    // Validate all URLs before processing
    const validUrls = fileUrls.filter(url => url && typeof url === 'string')
    if (validUrls.length === 0) {
      return NextResponse.json({ error: 'No valid file URLs provided' }, { status: 400 })
    }

    // Process all invoices in parallel
    const results = await Promise.all(validUrls.map(fileUrl => processInvoice(fileUrl)))

    // Check if any invoices failed to process
    const failedInvoices = results.filter(result => !result.success)
    if (failedInvoices.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Some invoices failed to process',
        results
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      results
    })

  } catch (error) {
    console.error('API route error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json(
      { 
        error: 'Failed to process invoices',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
} 