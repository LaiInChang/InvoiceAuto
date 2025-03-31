import { AzureKeyCredential } from '@azure/ai-form-recognizer'
import { DocumentAnalysisClient } from '@azure/ai-form-recognizer'
import OpenAI from 'openai'

// Azure Form Recognizer configuration
const azureEndpoint = process.env.NEXT_PUBLIC_AZURE_FORM_RECOGNIZER_ENDPOINT || ''
const azureKey = process.env.NEXT_PUBLIC_AZURE_FORM_RECOGNIZER_KEY || ''

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || ''
})

// Initialize Azure client
const client = new DocumentAnalysisClient(azureEndpoint, new AzureKeyCredential(azureKey))

export interface InvoiceAnalysisResult {
  id: string
  quarter: string
  year: string
  month: string
  date: string
  invoiceNumber: string
  category: string
  supplier: string
  description: string
  vatRegion: string
  currency: string
  amountInclVat: string
  vatPercentage: string
  amountExVat: string
  vat: string
}

export async function analyzeInvoice(fileUrl: string, invoiceId: string): Promise<InvoiceAnalysisResult> {
  console.log(`[Azure] Starting analysis for invoice ${invoiceId}`)
  
  try {
    // Start the Azure Form Recognizer analysis
    console.log(`[Azure] Sending invoice to Form Recognizer: ${fileUrl}`)
    const poller = await client.beginAnalyzeDocumentFromUrl(
      'prebuilt-invoice',
      fileUrl
    )

    // Wait for the analysis to complete
    console.log('[Azure] Waiting for analysis to complete...')
    const result = await poller.pollUntilDone()
    console.log('[Azure] Analysis completed successfully')

    // Extract relevant fields from the analysis result
    const invoice = result.documents[0]
    if (!invoice) {
      throw new Error('No invoice document found in the analysis result')
    }

    // Extract date and calculate quarter
    const invoiceDate = invoice.fields['InvoiceDate']?.valueDate
    const date = invoiceDate ? new Date(invoiceDate) : new Date()
    const quarter = `Q${Math.floor((date.getMonth() / 3)) + 1}`
    const year = date.getFullYear().toString()
    const month = date.toLocaleString('default', { month: 'long' })

    // Extract amounts and VAT information
    const amountInclVat = invoice.fields['InvoiceTotal']?.valueNumber?.toString() || '0'
    const vatPercentage = invoice.fields['VATRate']?.valueNumber?.toString() || '0'
    const amountExVat = (parseFloat(amountInclVat) / (1 + parseFloat(vatPercentage) / 100)).toFixed(2)
    const vat = (parseFloat(amountInclVat) - parseFloat(amountExVat)).toFixed(2)

    // Extract other fields
    const invoiceNumber = invoice.fields['InvoiceNumber']?.valueString || ''
    const supplier = invoice.fields['VendorName']?.valueString || ''
    const description = invoice.fields['Description']?.valueString || ''
    const currency = invoice.fields['Currency']?.valueString || 'EUR'
    const vatRegion = invoice.fields['VATRegion']?.valueString || 'EU'

    console.log('[Azure] Extracted data:', {
      invoiceNumber,
      date: date.toLocaleDateString(),
      amountInclVat,
      vatPercentage,
      supplier,
      description
    })

    // Use GPT to categorize the invoice
    console.log('[GPT] Starting invoice categorization')
    const category = await categorizeInvoice(description, supplier)
    console.log('[GPT] Categorized as:', category)

    const analysisResult = {
      id: invoiceId,
      quarter,
      year,
      month,
      date: date.toLocaleDateString(),
      invoiceNumber,
      category,
      supplier,
      description,
      vatRegion,
      currency,
      amountInclVat,
      vatPercentage: `${vatPercentage}%`,
      amountExVat,
      vat
    }

    console.log('[AI Processing] Final analysis result:', analysisResult)
    return analysisResult
  } catch (error) {
    console.error('[AI Processing] Error analyzing invoice:', error)
    throw error
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