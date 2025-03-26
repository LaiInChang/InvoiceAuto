import { NextResponse } from 'next/server'
import { auth } from '@/lib/firebase-admin'
import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer'
import OpenAI from 'openai'
import { v2 as cloudinary } from 'cloudinary'
import { updateProcessingStatus, clearProcessingStatus } from '../process-status/route'
import { getIO } from '@/lib/socket'

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
  totalBatches: number;
  batchSize: number;
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
  data?: any;
}

// Update the updateProcessingStatus function to emit Socket.IO events
function emitStatusUpdate(fileUrl: string, status: ProcessingStatus) {
  const io = getIO();
  io.emit('processingStatus', {
    fileUrl,
    status
  });
}

// Update the processBatchWithAzure function
async function processBatchWithAzure(fileUrls: string[]): Promise<Map<string, string>> {
  console.log(`\n🔍 Starting Azure analysis for batch of ${fileUrls.length} files`);
  const extractedTexts = new Map<string, string>();
  
  try {
    const azureResults = await Promise.allSettled(
      fileUrls.map(async (fileUrl) => {
        const fileName = fileUrl.split('/').pop();
        const fileId = fileUrl;
        
        // Update status and emit event
        const status: ProcessingStatus = {
          status: 'Processing',
          stage: 'Reading',
          currentStage: 'Azure',
          fileName
        };
        updateProcessingStatus(fileId, status);
        emitStatusUpdate(fileId, status);
        
        console.log(`📄 Processing ${fileName} with Azure...`);
        
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

        // Update status after Azure processing
        const completedStatus: ProcessingStatus = {
          status: 'Processing',
          stage: 'Analyzing',
          currentStage: 'Azure',
          fileName: fileUrl.split('/').pop()
        };
        updateProcessingStatus(fileUrl, completedStatus);
        emitStatusUpdate(fileUrl, completedStatus);

        return { fileUrl, extractedText }
      })
    )

    // Collect successful results
    azureResults.forEach((result, index) => {
      const fileUrl = fileUrls[index]
      if (result.status === 'fulfilled') {
        extractedTexts.set(result.value.fileUrl, result.value.extractedText)
        // Update status to Azure completed
        updateProcessingStatus(fileUrl, {
          status: 'Processing',
          stage: 'Analyzing',
          currentStage: 'Azure',
          fileName: fileUrl.split('/').pop()
        })
      } else {
        console.error(`❌ Azure analysis failed for ${fileUrl.split('/').pop()}:`, result.reason)
        // Update status to error
        updateProcessingStatus(fileUrl, {
          status: 'Error',
          stage: 'Error',
          error: result.reason,
          fileName: fileUrl.split('/').pop()
        })
      }
    })

  } catch (error) {
    console.error('❌ Batch Azure processing error:', error)
  }

  return extractedTexts
}

// Update the processBatchWithGPT4 function
async function processBatchWithGPT4(texts: string[], batchNumber: number, totalBatches: number, fileUrls: string[]): Promise<ProcessedResult[]> {
  console.log(`\n🤖 Starting GPT-4 processing for batch ${batchNumber}/${totalBatches}`);
  const results = await Promise.allSettled(texts.map(async (text, index) => {
    const fileUrl = fileUrls[index];
    console.log(`\n📝 Processing file ${index + 1}/${texts.length} with GPT-4:`, fileUrl);
    
    try {
      // Update status and emit event for GPT-4 processing
      const processingStatus: ProcessingStatus = {
        status: 'Processing',
        stage: 'Analyzing',
        currentStage: 'GPT4',
        batchNumber,
        totalBatches,
        fileName: fileUrl.split('/').pop()
      };
      updateProcessingStatus(fileUrl, processingStatus);
      emitStatusUpdate(fileUrl, processingStatus);

      console.log('📤 Sending request to OpenAI API...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: `You are an expert at analyzing invoice data. Your task is to extract specific information from invoice text and return it in a JSON format.

Required fields to extract:
- InvoiceYear: The year of the invoice (YYYY)
- InvoiceQuarter: The quarter number (1-4)
- InvoiceMonth: The month number (MM)
- InvoiceDate: The day of the month (DD)
- InvoiceNumber: The invoice number
- Category: The invoice category (infer if not explicit)
- Supplier: The supplier name
- Description: The invoice description
- VATRegion: The VAT region (infer if not explicit)
- Currency: The currency code (infer if not explicit)
- AmountInclVAT: The total amount including VAT
- AmountExVAT: The amount excluding VAT
- VAT: The VAT amount

Important:
1. Return ONLY a valid JSON object
2. Use null for any fields that cannot be found
3. Do not include any text before or after the JSON object
4. Ensure all numeric values are numbers, not strings
5. Format dates as numbers (e.g., "01" for January)

Example response format:
{
  "InvoiceYear": 2024,
  "InvoiceQuarter": 1,
  "InvoiceMonth": 3,
  "InvoiceDate": 15,
  "InvoiceNumber": "INV-001",
  "Category": "Office Supplies",
  "Supplier": "Example Corp",
  "Description": "Monthly office supplies",
  "VATRegion": "EU",
  "Currency": "EUR",
  "AmountInclVAT": 121.00,
  "AmountExVAT": 100.00,
  "VAT": 21.00
}`
            },
            {
              role: "user",
              content: text
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ OpenAI API error:', response.status, errorText);
        throw new Error(`GPT-4 API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Received response from OpenAI API');
      
      // Parse the extracted data
      console.log('🔍 Parsing GPT-4 response...');
      const extractedData = JSON.parse(data.choices[0].message.content);
      console.log('📊 Extracted data:', extractedData);

      // Update status after successful GPT-4 processing
      const completedStatus: ProcessingStatus = {
        status: 'Processed',
        stage: 'Completed',
        fileName: fileUrl.split('/').pop(),
        endTime: new Date().getTime(),
        data: extractedData
      };
      updateProcessingStatus(fileUrl, completedStatus);
      emitStatusUpdate(fileUrl, completedStatus);

      console.log(`✅ Successfully processed ${fileUrl.split('/').pop()}`);
      return {
        success: true,
        data: extractedData,
        fileUrl
      };
    } catch (error) {
      console.error(`❌ Error processing ${fileUrl.split('/').pop()} with GPT-4:`, error);
      
      // Update status for error
      const errorStatus: ProcessingStatus = {
        status: 'Error',
        stage: 'Error',
        error: error instanceof Error ? error.message : 'Failed to process with GPT-4',
        fileName: fileUrl.split('/').pop(),
        endTime: new Date().getTime()
      };
      updateProcessingStatus(fileUrl, errorStatus);
      emitStatusUpdate(fileUrl, errorStatus);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process with GPT-4',
        fileUrl
      };
    }
  }));

  // Convert PromiseSettledResult to ProcessedResult[]
  const processedResults: ProcessedResult[] = results.map(result => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        success: false,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        fileUrl: fileUrls[results.indexOf(result)]
      };
    }
  });

  console.log(`\n✅ Completed GPT-4 processing for batch ${batchNumber}/${totalBatches}`);
  return processedResults;
}

// Function to determine optimal batch size based on system load
function determineBatchSize(totalFiles: number): number {
  // Always use 5 files per batch
  return 5
}

// Process invoices in batches
async function processBatch(fileUrls: string[]): Promise<BatchResult> {
  console.log(`\n🔄 Starting batch processing of ${fileUrls.length} invoices`)
  
  // Clear previous status
  clearProcessingStatus()
  
  const results: ProcessedResult[] = []
  const failedUrls: FailedUrl[] = []
  const batchSize = determineBatchSize(fileUrls.length)
  const totalBatches = Math.ceil(fileUrls.length/batchSize)
  
  console.log(`📦 Using batch size: ${batchSize}`)
  
  for (let i = 0; i < fileUrls.length; i += batchSize) {
    const batch = fileUrls.slice(i, i + batchSize)
    const batchNumber = Math.floor(i/batchSize) + 1
    
    // Update batch status for all files in this batch
    batch.forEach(fileUrl => {
      const status: ProcessingStatus = {
        status: 'Processing',
        stage: 'Reading',
        batchNumber,
        totalBatches,
        fileName: fileUrl.split('/').pop(),
        startTime: new Date().getTime()
      };
      updateProcessingStatus(fileUrl, status);
      emitStatusUpdate(fileUrl, status);
    })
    
    console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} invoices)`)
    console.log('📄 Files in this batch:', batch.map(url => url.split('/').pop()))

    try {
      // Step 1: Process batch with Azure
      const extractedTexts = await processBatchWithAzure(batch)
      
      // Step 2: Process extracted texts with GPT-4
      const batchResults = await processBatchWithGPT4(Array.from(extractedTexts.values()), batchNumber, totalBatches, batch)
      
      // Step 3: Collect results and emit updates for this batch
      batchResults.forEach(result => {
        if (result.success) {
          results.push(result)
          // Update status with success and data
          const completedStatus: ProcessingStatus = {
            status: 'Processed',
            stage: 'Completed',
            fileName: result.fileUrl.split('/').pop(),
            endTime: new Date().getTime(),
            data: result.data
          };
          updateProcessingStatus(result.fileUrl, completedStatus);
          emitStatusUpdate(result.fileUrl, completedStatus);
        } else {
          failedUrls.push({ url: result.fileUrl, error: result.error || 'Unknown error' })
          // Update status with error
          const errorStatus: ProcessingStatus = {
            status: 'Error',
            stage: 'Error',
            error: result.error || 'Unknown error',
            fileName: result.fileUrl.split('/').pop(),
            endTime: new Date().getTime()
          };
          updateProcessingStatus(result.fileUrl, errorStatus);
          emitStatusUpdate(result.fileUrl, errorStatus);
        }
      })

      // Step 4: Report batch progress and emit batch completion event
      console.log(`\n📊 Batch ${batchNumber} Summary:`)
      console.log(`✅ Successfully processed: ${batchResults.length} invoices`)
      console.log(`❌ Failed to process: ${failedUrls.length} invoices in this batch`)

      // Emit batch completion event
      const io = getIO();
      io.emit('batchComplete', {
        batchNumber,
        totalBatches,
        results: batchResults,
        failedUrls: failedUrls.filter(f => batch.includes(f.url))
      });

      // Wait a moment to ensure all updates are processed
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`❌ Error processing batch ${batchNumber}:`, error)
      batch.forEach(url => {
        const fileName = url.split('/').pop()
        console.error(`❌ Failed to process ${fileName} due to batch error:`, error)
        failedUrls.push({ url, error: error instanceof Error ? error.message : 'Unknown error' })
        // Update status to error
        const errorStatus: ProcessingStatus = {
          status: 'Error',
          stage: 'Error',
          error: error instanceof Error ? error.message : 'Unknown error',
          fileName,
          endTime: new Date().getTime()
        };
        updateProcessingStatus(url, errorStatus);
        emitStatusUpdate(url, errorStatus);
      });
    }
  }

  return {
    results,
    failedUrls,
    totalBatches,
    batchSize
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
    const { results, failedUrls, totalBatches, batchSize } = await processBatch(validUrls)

    console.log('\n✨ Request completed successfully')
    return NextResponse.json({
      success: failedUrls.length === 0,
      results,
      failedUrls,
      totalProcessed: results.length,
      totalFailed: failedUrls.length,
      totalInvoices: validUrls.length,
      totalBatches,
      batchSize
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