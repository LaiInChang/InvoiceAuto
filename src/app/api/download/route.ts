import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import axios from 'axios'

export async function POST(req: Request) {
  try {
    const { files } = await req.json()
    const zip = new JSZip()
    
    // Track successfully processed files
    let successCount = 0
    const totalFiles = files.length
    
    // Helper function to modify Cloudinary URLs for direct download
    const getDownloadUrl = (url, fileName) => {
      if (url.includes('cloudinary.com')) {
        const uploadIndex = url.indexOf('/upload/')
        const versionIndex = url.indexOf('/v', uploadIndex)
        const baseUrl = url.substring(0, uploadIndex + 8) // Include '/upload/' and trailing slash
        const versionAndRest = url.substring(versionIndex) // Keep everything from version
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
        
        // Construct proper download URL with fl_attachment
        return `${baseUrl}fl_attachment/${fileNameWithoutExt}${versionAndRest}`
      }
      return url
    }

    // Process files with a more memory-efficient approach
    for (const file of files) {
      try {
        const { fileName, fileUrl, type } = file
        
        // Handle download based on file type
        let fileData;
        
        if (type === 'invoice') {
          // For invoices (Cloudinary), create proper download URL
          const downloadUrl = getDownloadUrl(fileUrl, fileName)
          
          // Use fetch instead of axios for better memory handling
          const response = await fetch(downloadUrl, {
            method: 'GET',
          })
          
          if (!response.ok) {
            throw new Error(`Failed to fetch invoice: ${response.status} ${response.statusText}`)
          }
          
          fileData = await response.arrayBuffer()
        } else {
          // For reports (Firebase Storage)
          const response = await fetch(fileUrl, {
            method: 'GET',
          })
          
          if (!response.ok) {
            throw new Error(`Failed to fetch report: ${response.status} ${response.statusText}`)
          }
          
          fileData = await response.arrayBuffer()
        }
        
        // Add file to zip with proper error handling
        if (!fileData || fileData.byteLength === 0) {
          throw new Error(`No data received for file: ${fileName}`)
        }
        
        zip.file(fileName, fileData)
        successCount++
      } catch (fileError) {
        console.error(`Error processing file ${file.fileName}:`, fileError)
        // Continue with other files even if one fails
      }
    }
    
    // If no files were successfully processed, throw an error
    if (successCount === 0) {
      throw new Error(`Failed to process any of the ${totalFiles} files`)
    }

    // Generate zip file with optimal compression
    const zipContent = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9 // Maximum compression
      }
    })

    // Return the zip file
    return new NextResponse(zipContent, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=${files[0].type}s.zip`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('Error creating zip:', error)
    
    // Return a more detailed error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new NextResponse(
      JSON.stringify({
        error: 'Failed to create zip file',
        details: errorMessage
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }
} 