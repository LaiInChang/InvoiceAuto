import { NextResponse } from 'next/server'
import { auth } from '@/lib/firebase-admin'
import { storage } from '@/lib/firebase-admin'

export async function POST(request: Request) {
  try {
    // Verify Firebase token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]
    await auth.verifyIdToken(token)

    // Get form data
    const formData = await request.formData()
    const excelFile = formData.get('excelFile') as File
    const invoiceData = JSON.parse(formData.get('invoiceData') as string)
    const columns = JSON.parse(formData.get('columns') as string)

    if (!excelFile) {
      return NextResponse.json({ error: 'No Excel file provided' }, { status: 400 })
    }

    // Create a more logical filename with relevant information
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '') // HHMMSS
    
    // Get invoice numbers from the data if available
    let invoiceNumberPart = ''
    if (invoiceData && invoiceData.length > 0) {
      if (invoiceData.length === 1) {
        // Single invoice - include the invoice number
        invoiceNumberPart = `-INV${invoiceData[0].invoiceNumber.replace(/[^a-zA-Z0-9]/g, '')}`
      } else {
        // Multiple invoices - include count
        invoiceNumberPart = `-${invoiceData.length}INVs`
      }
    }
    
    // Create a filename with format: InvoiceReport-YYYY-MM-DD-HHMMSS-INVxxxx.xlsx
    const fileName = `InvoiceReport-${dateStr}-${timeStr}${invoiceNumberPart}.xlsx`
    
    // Convert the Excel file to buffer
    const buffer = await excelFile.arrayBuffer()

    // Upload to Firebase Storage in the reports directory
    const fileRef = storage.bucket().file(`reports/${fileName}`)
    
    await fileRef.save(Buffer.from(buffer), {
      metadata: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })

    // Get download URL
    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    })

    return NextResponse.json({
      success: true,
      fileUrl: url,
      fileName: fileName
    })
  } catch (error) {
    console.error('Error processing invoices:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process invoices' },
      { status: 500 }
    )
  }
} 