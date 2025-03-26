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

// Cache for processed results
const processingCache = new Map<string, any>()

// Function to download file
async function downloadFile(fileUrl: string): Promise<Buffer> {
  const fileResponse = await fetch(fileUrl)
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`)
  }

  const fileBuffer = await fileResponse.arrayBuffer()
  if (!fileBuffer || fileBuffer.byteLength === 0) {
    throw new Error('Downloaded file is empty')
  }

  return Buffer.from(fileBuffer)
}

// Function to process text with GPT-4
async function processWithGPT4(text: string): Promise<any> {
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
            content: text || 'No text extracted from document'
          }
        ],
        response_format: { type: "json_object" }
      })

      const content = completion.choices[0].message.content
      if (!content) {
        throw new Error('No content received from GPT-4')
      }
      
      return JSON.parse(content)
      
    } catch (error) {
      console.error('GPT-4 processing error:', error)
      retryCount++;
      if (retryCount > maxRetries) {
        throw new Error(`GPT-4 processing failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
    }
  }
}

// Function to process a single invoice
async function processInvoice(fileUrl: string) {
  try {
    if (!fileUrl) {
      console.error('❌ Invalid file URL: URL is empty')
      throw new Error('File URL is required')
    }

    console.log(`\n📄 Starting to process invoice: ${fileUrl}`)

    // Check cache first
    if (processingCache.has(fileUrl)) {
      console.log('✅ Using cached result for:', fileUrl)
      return processingCache.get(fileUrl)
    }

    // Download file
    console.log('📥 Downloading file...')
    const buffer = await downloadFile(fileUrl)
    console.log(`✅ File downloaded successfully. Size: ${buffer.length} bytes`)

    // Process with Azure
    console.log('🔍 Starting Azure document analysis...')
    const poller = await documentAnalysisClient.beginAnalyzeDocument(
      'prebuilt-invoice',
      buffer
    )
    console.log('⏳ Azure analysis in progress...')
    const result = await poller.pollUntilDone()
    console.log('✅ Azure analysis completed')
    
    // Extract text
    if (!result.pages || result.pages.length === 0) {
      console.error('❌ No pages found in the document')
      throw new Error('No pages found in the document')
    }

    console.log(`📄 Document has ${result.pages.length} pages`)

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

    if (!extractedText || extractedText.trim().length === 0) {
      console.error('❌ No text was extracted from the document')
      throw new Error('No text was extracted from the document')
    }

    console.log(`✅ Extracted ${extractedText.length} characters of text`)

    // Process with GPT-4
    console.log('🤖 Processing with GPT-4...')
    const extractedData = await processWithGPT4(extractedText)
    console.log('✅ GPT-4 processing completed')

    const response = {
      success: true,
      data: extractedData,
      rawText: extractedText,
      fileUrl
    }

    // Cache the result
    processingCache.set(fileUrl, response)
    console.log('✅ Invoice processing completed successfully')
    return response

  } catch (error) {
    console.error('❌ Invoice processing error:', {
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

interface ProcessedResult {
  success: boolean;
  data?: any;
  error?: string;
  fileUrl: string;
  rawText?: string;
}

interface FailedUrl {
  url: string;
  error: string;
}

interface BatchResult {
  results: ProcessedResult[];
  failedUrls: FailedUrl[];
}

// Function to process a batch of invoices with Azure
async function processBatchWithAzure(fileUrls: string[]): Promise<Map<string, string>> {
  console.log(`\n🔍 Starting Azure analysis for batch of ${fileUrls.length} files`)
  const extractedTexts = new Map<string, string>()
  
  try {
    // Process all files in the batch with Azure in parallel
    const azureResults = await Promise.allSettled(
      fileUrls.map(async (fileUrl) => {
        const fileName = fileUrl.split('/').pop()
        console.log(`📄 Processing ${fileName} with Azure...`)
        
        const buffer = await downloadFile(fileUrl)
        const poller = await documentAnalysisClient.beginAnalyzeDocument(
          'prebuilt-invoice',
          buffer
        )
        const result = await poller.pollUntilDone()
        
        if (!result.pages || result.pages.length === 0) {
          throw new Error('No pages found in the document')
        }

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

        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text was extracted from the document')
        }

        console.log(`✅ Azure analysis completed for ${fileName}`)
        return { fileUrl, extractedText }
      })
    )

    // Collect successful results
    azureResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        extractedTexts.set(result.value.fileUrl, result.value.extractedText)
      } else {
        console.error(`❌ Azure analysis failed for ${fileUrls[index].split('/').pop()}:`, result.reason)
      }
    })

  } catch (error) {
    console.error('❌ Batch Azure processing error:', error)
  }

  return extractedTexts
}

// Function to process a batch of texts with GPT-4
async function processBatchWithGPT4(texts: Map<string, string>): Promise<ProcessedResult[]> {
  console.log(`\n🤖 Starting GPT-4 processing for batch of ${texts.size} files`)
  const results: ProcessedResult[] = []

  try {
    // Process all texts in the batch with GPT-4 in parallel
    const gptResults = await Promise.allSettled(
      Array.from(texts.entries()).map(async ([fileUrl, text]) => {
        const fileName = fileUrl.split('/').pop()
        console.log(`📝 Processing ${fileName} with GPT-4...`)
        
        const extractedData = await processWithGPT4(text)
        console.log(`✅ GPT-4 processing completed for ${fileName}`)
        
        return {
          success: true,
          data: extractedData,
          rawText: text,
          fileUrl
        }
      })
    )

    // Collect successful results
    gptResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        console.error('❌ GPT-4 processing failed:', result.reason)
      }
    })

  } catch (error) {
    console.error('❌ Batch GPT-4 processing error:', error)
  }

  return results
}

// Function to determine optimal batch size based on system load
function determineBatchSize(totalFiles: number): number {
  // Start with a base batch size
  let batchSize = 3
  
  // Adjust based on total files
  if (totalFiles > 10) {
    batchSize = 4
  }
  if (totalFiles > 20) {
    batchSize = 5
  }
  
  // Ensure we don't exceed 5 files per batch
  return Math.min(batchSize, 5)
}

// Process invoices in batches
async function processBatch(fileUrls: string[]): Promise<BatchResult> {
  console.log(`\n🔄 Starting batch processing of ${fileUrls.length} invoices`)
  
  const results: ProcessedResult[] = []
  const failedUrls: FailedUrl[] = []
  const batchSize = determineBatchSize(fileUrls.length)
  
  console.log(`📦 Using batch size: ${batchSize}`)
  
  for (let i = 0; i < fileUrls.length; i += batchSize) {
    const batch = fileUrls.slice(i, i + batchSize)
    const batchNumber = Math.floor(i/batchSize) + 1
    const totalBatches = Math.ceil(fileUrls.length/batchSize)
    
    console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} invoices)`)
    console.log('📄 Files in this batch:', batch.map(url => url.split('/').pop()))

    try {
      // Step 1: Process batch with Azure
      const extractedTexts = await processBatchWithAzure(batch)
      
      // Step 2: Process extracted texts with GPT-4
      const batchResults = await processBatchWithGPT4(extractedTexts)
      
      // Step 3: Collect results
      batchResults.forEach(result => {
        if (result.success) {
          results.push(result)
        } else {
          failedUrls.push({ url: result.fileUrl, error: result.error })
        }
      })

      // Step 4: Report batch progress
      console.log(`\n📊 Batch ${batchNumber} Summary:`)
      console.log(`✅ Successfully processed: ${batchResults.length} invoices`)
      console.log(`❌ Failed to process: ${failedUrls.length} invoices in this batch`)

    } catch (error) {
      console.error(`❌ Error processing batch ${batchNumber}:`, error)
      batch.forEach(url => {
        const fileName = url.split('/').pop()
        console.error(`❌ Failed to process ${fileName} due to batch error:`, error)
        failedUrls.push({ url, error: error instanceof Error ? error.message : 'Unknown error' })
      })
    }
  }

  console.log('\n📊 Final Processing Summary:')
  console.log(`✅ Successfully processed: ${results.length} invoices`)
  console.log(`❌ Failed to process: ${failedUrls.length} invoices`)
  console.log(`📄 Total invoices: ${fileUrls.length}`)
  
  if (failedUrls.length > 0) {
    console.log('\n❌ Failed invoices:')
    failedUrls.forEach(({ url, error }) => {
      console.log(`- ${url.split('/').pop()}: ${error}`)
    })
  }

  return {
    results,
    failedUrls
  }
}

export async function POST(request: Request) {
  try {
    console.log('\n🚀 Starting invoice processing request')
    
    // Verify Firebase token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ Unauthorized: No Bearer token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]
    try {
      await auth.verifyIdToken(token)
      console.log('✅ Firebase authentication successful')
    } catch (error) {
      console.error('❌ Firebase authentication failed:', error)
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get file URLs from request body
    const body = await request.json()
    const { fileUrls } = body
    if (!fileUrls || !Array.isArray(fileUrls) || fileUrls.length === 0) {
      console.error('❌ Invalid request: No file URLs provided')
      return NextResponse.json({ error: 'File URLs array is required' }, { status: 400 })
    }

    console.log(`📄 Received ${fileUrls.length} file URLs`)

    // Validate all URLs before processing
    const validUrls = fileUrls.filter(url => url && typeof url === 'string')
    if (validUrls.length === 0) {
      console.error('❌ No valid file URLs provided')
      return NextResponse.json({ error: 'No valid file URLs provided' }, { status: 400 })
    }

    console.log(`✅ Validated ${validUrls.length} file URLs`)

    // Process invoices in batches
    const { results, failedUrls } = await processBatch(validUrls)

    console.log('\n✨ Request completed successfully')
    return NextResponse.json({
      success: failedUrls.length === 0,
      results,
      failedUrls,
      totalProcessed: results.length,
      totalFailed: failedUrls.length,
      totalInvoices: validUrls.length
    })

  } catch (error) {
    console.error('❌ API route error:', {
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