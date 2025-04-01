import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    const uploadPromises = files.map(async (file) => {
      try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'invoices',
              resource_type: 'auto',
            },
            (error, result) => {
              if (error) {
                reject(error)
                return
              }
              resolve({
                fileName: file.name,
                fileUrl: result?.secure_url,
                publicId: result?.public_id
              })
            }
          )

          uploadStream.end(buffer)
        })
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error)
        return {
          fileName: file.name,
          error: 'Upload failed'
        }
      }
    })

    const results = await Promise.all(uploadPromises)
    const successful = results.filter(r => !('error' in r))
    const failed = results.filter(r => 'error' in r)

    return NextResponse.json({
      success: true,
      successful,
      failed
    })
  } catch (error) {
    console.error('Batch upload error:', error)
    return NextResponse.json(
      { error: 'Failed to process batch upload' },
      { status: 500 }
    )
  }
} 