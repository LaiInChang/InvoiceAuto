import { NextResponse } from 'next/server'
import { auth } from '@/lib/firebase-admin'
import { AzureKeyCredential, DocumentAnalysisClient, AnalyzedDocument } from '@azure/ai-form-recognizer'
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
              InvoiceYear, InvoiceMonth (MM), InvoiceDate (DD),
              InvoiceNumber, Category, Supplier, Description, VATRegion, Currency,
              AmountInclVAT, AmountExVAT, VAT
              
              Rules:
              1. Date extraction: 
                 - Look for any date format (DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, etc.)
                 - Extract the day number (e.g., "30-05-2024" -> 30)
                 - Extract the month number (e.g., "30-05-2024" -> 5)
                 - Extract the year (e.g., "30-05-2024" -> 2024)
                 - If multiple dates found, prefer the invoice date over other dates
                 - If no date found, use the current date
              2. Month format: 
                 - Must be a number (1-12)
                 - Convert month names to numbers (e.g., "January" -> 1)
              3. VAT/BTW extraction: 
                 - Look for any percentage values, especially those marked with %, BTW, or VAT
                 - Extract both the percentage and the amounts
              4. Return as JSON. Leave empty if not found. Infer Category, VATRegion, and Currency if not explicit.
              
              Example response format:
              {
                "InvoiceYear": 2024,
                "InvoiceMonth": 5,
                "InvoiceDate": 30,
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

// Function to analyze region from country
async function analyzeRegionFromCountry(country: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a VAT region analyzer. Your task is to determine the VAT region based on the country code or name.

Rules:
1. If the country is Netherlands (NL), return 'NL'
2. If the country is United Kingdom (UK/GB), return 'UK'
3. If the country is United States (US), return 'US'
4. If the country is Germany (DE), return 'DE'
5. If the country is Belgium (BE), return 'BE'
6. If the country is France (FR), return 'FR'
7. If the country is Spain (ES), return 'ES'
8. If the country is Italy (IT), return 'IT'
9. If the country is Poland (PL), return 'PL'
10. If the country is Switzerland (CH), return 'CH'
11. If the country is Austria (AT), return 'AT'
12. For any other EU country, return 'EU'
13. For any other country, return 'Other'

Important:
- Return ONLY the region code (NL, UK, US, DE, BE, FR, ES, IT, PL, CH, AT, EU, or Other)
- Do not include any explanation or additional text
- If the country is unclear or missing, return 'EU' as default
- Be strict about the exact country codes/names
- Consider both country codes and full names (e.g., "Netherlands" or "NL" should both return "NL")`
        },
        {
          role: "user",
          content: country || 'No country provided'
        }
      ],
      temperature: 0.1, // Lower temperature for more consistent results
      max_tokens: 10
    })

    const region = completion.choices[0].message.content?.trim().toUpperCase() || 'EU'
    console.log('Country analysis:', { country, region })
    return region
  } catch (error) {
    console.error('Error analyzing region:', error)
    return 'EU'
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

    // Log Azure document fields for debugging
    console.log('📄 Azure Document Fields:', {
      hasDocuments: !!result.documents,
      documentCount: result.documents?.length,
      fields: result.documents?.[0]?.fields ? Object.keys(result.documents[0].fields) : [],
      vendorAddress: result.documents?.[0]?.fields?.VendorAddress,
      billingAddress: result.documents?.[0]?.fields?.BillingAddress,
      shippingAddress: result.documents?.[0]?.fields?.ShippingAddress
    })

    // Extract country from Azure result with detailed logging
    const vendorAddress = result.documents?.[0]?.fields?.VendorAddress
    const billingAddress = result.documents?.[0]?.fields?.BillingAddress
    const shippingAddress = result.documents?.[0]?.fields?.ShippingAddress

    console.log('🏢 Azure Address Details:', {
      vendorAddress: vendorAddress ? {
        hasValue: !!vendorAddress.value,
        country: vendorAddress.value?.country,
        fullAddress: vendorAddress.value
      } : 'Not found',
      billingAddress: billingAddress ? {
        hasValue: !!billingAddress.value,
        country: billingAddress.value?.country,
        fullAddress: billingAddress.value
      } : 'Not found',
      shippingAddress: shippingAddress ? {
        hasValue: !!shippingAddress.value,
        country: shippingAddress.value?.country,
        fullAddress: shippingAddress.value
      } : 'Not found'
    })

    const country = vendorAddress?.value?.country || 
                   billingAddress?.value?.country ||
                   shippingAddress?.value?.country

    console.log('🌍 Final extracted country:', country)

    // Analyze region from country using GPT-4
    const vatRegion = await analyzeRegionFromCountry(country)

    // Process with GPT-4
    console.log('🤖 Processing with GPT-4...')
    const extractedData = await processWithGPT4(extractedText)
    console.log('✅ GPT-4 processing completed')

    // Update the extracted data with the analyzed region
    const response = {
      success: true,
      data: {
        ...extractedData,
        VATRegion: vatRegion // Override the region with our analyzed value
      },
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
- InvoiceMonth: The month number (MM) - Extract from any date format (e.g., from "30-05-2024" extract 5)
- InvoiceDate: The day number (DD) - Extract from any date format (e.g., from "30-05-2024" extract 30)
- InvoiceNumber: The invoice number
- Category: The invoice category (infer if not explicit)
- Supplier: The supplier name
- Description: The invoice description
- VATRegion: The VAT region (infer if not explicit)
- Currency: The currency code (infer if not explicit)
- AmountInclVAT: The total amount including VAT
- AmountExVAT: The amount excluding VAT
- VAT: The VAT amount

Rules for extraction:
1. Date extraction: 
   - Look for any date format (DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, etc.)
   - Extract the day number (e.g., "30-05-2024" -> 30)
   - Extract the month number (e.g., "30-05-2024" -> 5)
   - Extract the year (e.g., "30-05-2024" -> 2024)
   - If multiple dates found, prefer the invoice date over other dates
   - If no date found, use the current date
2. Month format: 
   - Must be a number (1-12)
   - Convert month names to numbers (e.g., "January" -> 1)
3. VAT/BTW extraction: 
   - Look for any percentage values, especially those marked with %, BTW, or VAT
   - Extract both the percentage and the amounts
4. Return ONLY a valid JSON object
5. Use null for any fields that cannot be found
6. Do not include any text before or after the JSON object
7. Ensure all numeric values are numbers, not strings

Example response format:
{
  "InvoiceYear": 2024,
  "InvoiceQuarter": 1,
  "InvoiceMonth": 5,
  "InvoiceDate": 30,
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
function determineBatchSize(totalFiles: number, requestedBatchSize?: number): number {
  // Use the requested batch size if provided, otherwise default to 3
  return requestedBatchSize || 10;
}

// Process invoices in batches
async function processBatch(fileUrls: string[], batchSize: number): Promise<BatchResult> {
  console.log(`\n🔄 Starting batch processing of ${fileUrls.length} invoices`)
  
  // Clear previous status
  clearProcessingStatus()
  
  const results: ProcessedResult[] = []
  const failedUrls: FailedUrl[] = []
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

interface InvoiceDocument extends AnalyzedDocument {
  fields: {
    InvoiceDate?: { value: string }
    InvoiceTotal?: { value: number }
    VATRate?: { value: number }
    InvoiceNumber?: { value: string }
    VendorName?: { value: string }
    Description?: { value: string }
    Currency?: { value: string }
    VATRegion?: { value: string }
    VendorAddress?: { value: { country: string } }
    BillingAddress?: { value: { country: string } }
    ShippingAddress?: { value: { country: string } }
  }
}

export async function POST(request: Request) {
  try {
    const { fileUrls, batchNumber, totalBatches, batchSize } = await request.json()
    
    console.log(`[API] Processing batch ${batchNumber} of ${totalBatches}`)
    console.log(`[API] Batch size: ${batchSize}`)
    console.log(`[API] Files to process: ${fileUrls.length}`)

    // Process the batch using the robust processing function
    const batchResult = await processBatch(fileUrls, batchSize)
    
    // Transform the results to match the expected format
    const results = batchResult.results.map(result => {
      if (!result.success) {
        return {
          success: false,
          fileUrl: result.fileUrl,
          error: result.error
        }
      }

      // Calculate VAT percentage from VAT and AmountExVAT
      const vatAmount = parseFloat(result.data.VAT?.toString() || '0');
      const amountExVat = parseFloat(result.data.AmountExVAT?.toString() || '0');
      const vatPercentage = amountExVat > 0 ? Math.round((vatAmount / amountExVat) * 100) : 0;

      // Calculate quarter based on month number
      const month = parseInt(result.data.InvoiceMonth?.toString() || new Date().getMonth().toString()) + 1;
      let quarter;
      if (month >= 1 && month <= 3) {
        quarter = 'Q1';
      } else if (month >= 4 && month <= 6) {
        quarter = 'Q2';
      } else if (month >= 7 && month <= 9) {
        quarter = 'Q3';
      } else {
        quarter = 'Q4';
      }

      // Format the data to match the ExcelRow interface
      const data = {
        quarter,
        year: result.data.InvoiceYear?.toString() || new Date().getFullYear().toString(),
        month: result.data.InvoiceMonth || new Date(result.data.InvoiceDate).getMonth() + 1,
        date: result.data.InvoiceDate || new Date().getDate(),
        invoiceNumber: result.data.InvoiceNumber || '',
        category: result.data.Category || 'Other',
        supplier: result.data.Supplier || '',
        description: result.data.Description || '',
        vatRegion: result.data.VATRegion || 'EU',
        currency: result.data.Currency || 'EUR',
        amountInclVat: result.data.AmountInclVAT?.toString() || '0',
        vatPercentage: `${vatPercentage}%`,
        amountExVat: result.data.AmountExVAT?.toString() || '0',
        vat: result.data.VAT?.toString() || '0'
      }

      return {
        success: true,
        fileUrl: result.fileUrl,
        data
      }
    })

    console.log('[API] Batch processing completed:', results)
    return NextResponse.json({ results })
  } catch (error) {
    console.error('[API] Error in process-invoice route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process invoices' },
      { status: 500 }
    )
  }
}

async function categorizeInvoice(description: string, supplier: string): Promise<string> {
  console.log('[GPT] Preparing prompt for categorization')
  
  const prompt = `Categorize this invoice based on the following information:
    Description: ${description}
    Supplier: ${supplier}
    
    Please categorize it into one of these categories:
    - Office Supplies
    - Equipment
    - Services
    - Software
    - Travel
    - Utilities
    - Marketing
    - Other
    
    Respond with just the category name.`

  try {
    console.log('[GPT] Sending request to OpenAI')
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    })

    const category = completion.choices[0].message.content?.trim() || 'Other'
    console.log('[GPT] Received category:', category)
    return category
  } catch (error) {
    console.error('[GPT] Error during categorization:', error)
    return 'Other'
  }
} 