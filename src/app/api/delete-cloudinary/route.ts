import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

// Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

export async function POST(request: Request) {
  try {
    const { publicId } = await request.json()

    if (!publicId) {
      return NextResponse.json(
        { error: 'Public ID is required' },
        { status: 400 }
      )
    }

    console.log('Deleting file from Cloudinary:', publicId)
    
    // Delete the file from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId)
    console.log('Cloudinary deletion result:', result)

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error)
    return NextResponse.json(
      { error: 'Failed to delete file from Cloudinary' },
      { status: 500 }
    )
  }
} 