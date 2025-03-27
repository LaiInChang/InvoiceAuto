import { NextResponse } from 'next/server';
import { auth, storage } from '@/lib/firebase-admin';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    await auth.verifyIdToken(token);

    // Get request body
    const { data } = await request.json();

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoice Analysis');

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Generate unique filename
    const fileName = `invoice_report_${uuidv4()}.xlsx`;

    // Get storage bucket
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      throw new Error('Storage bucket name is not configured');
    }

    // Upload to Firebase Storage
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(`reports/${fileName}`);
    
    // Create a write stream
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    });

    // Write the buffer to the stream
    stream.end(excelBuffer);

    // Wait for the upload to complete
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Get download URL
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // URL expires in 7 days
    });

    return NextResponse.json({ fileUrl: url, fileName });
  } catch (error) {
    console.error('Error generating Excel file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate Excel file' },
      { status: 500 }
    );
  }
} 