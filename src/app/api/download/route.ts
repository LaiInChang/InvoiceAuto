import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import axios from 'axios'

export async function POST(req: Request) {
  try {
    const { files } = await req.json()
    console.log(`Received request to download ${files.length} files:`, files.map(f => f.fileName))
    
    const zip = new JSZip()
    
    // Track successfully processed files
    let successCount = 0
    let failedFiles = []
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

    // Process files with a more memory-efficient approach - process sequentially with await
    console.log('Starting to process files...')
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file ${i + 1}/${files.length}: ${file.fileName}`)
      
      try {
        const { fileName, fileUrl, type } = file
        
        // Handle download based on file type
        let fileData;
        
        if (type === 'invoice') {
          // For invoices (Cloudinary), create proper download URL
          const downloadUrl = getDownloadUrl(fileUrl, fileName)
          console.log(`Fetching invoice: ${fileName} from ${downloadUrl.substring(0, 50)}...`)
          
          // Use fetch instead of axios for better memory handling
          const response = await fetch(downloadUrl, {
            method: 'GET',
          })
          
          if (!response.ok) {
            throw new Error(`Failed to fetch invoice: ${response.status} ${response.statusText}`)
          }
          
          fileData = await response.arrayBuffer()
          console.log(`Successfully downloaded invoice: ${fileName}, size: ${fileData.byteLength} bytes`)
        } else {
          // For reports (Firebase Storage)
          console.log(`Fetching report: ${fileName} from ${fileUrl.substring(0, 50)}...`)
          
          const response = await fetch(fileUrl, {
            method: 'GET',
            cache: 'no-store'  // Add cache control to prevent caching issues
          })
          
          if (!response.ok) {
            throw new Error(`Failed to fetch report: ${response.status} ${response.statusText}`)
          }
          
          fileData = await response.arrayBuffer()
          console.log(`Successfully downloaded report: ${fileName}, size: ${fileData.byteLength} bytes`)
        }
        
        // Add file to zip with proper error handling
        if (!fileData || fileData.byteLength === 0) {
          throw new Error(`No data received for file: ${fileName}`)
        }
        
        // Add to zip and increment success counter
        zip.file(fileName, fileData)
        successCount++
        console.log(`Added ${fileName} to zip. Success count: ${successCount}/${totalFiles}`)
      } catch (fileError) {
        console.error(`Error processing file ${file.fileName}:`, fileError)
        failedFiles.push(file.fileName)
        // Continue with other files even if one fails
      }
    }
    
    // If no files were successfully processed, throw an error
    if (successCount === 0) {
      throw new Error(`Failed to process any of the ${totalFiles} files`)
    }
    
    if (failedFiles.length > 0) {
      console.warn(`Failed to download ${failedFiles.length} files:`, failedFiles)
    }

    // Generate zip file with optimal compression
    console.log(`Generating zip file with ${successCount} files`)
    const zipContent = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6 // Balanced between speed and compression
      }
    })
    console.log(`Zip file generated: ${zipContent.byteLength} bytes`)

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