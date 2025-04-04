import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    // Get the URL from the query parameters
    const url = new URL(req.url)
    const fileUrl = url.searchParams.get('url')
    
    if (!fileUrl) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
    }

    // Make the request using the server (bypassing CORS)
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Accept': '*/*'
      }
    })

    if (!response.ok) {
      return NextResponse.json({ 
        error: 'Failed to fetch file', 
        details: `Status ${response.status}: ${response.statusText}` 
      }, { status: response.status })
    }

    // Get the file data
    const fileData = await response.arrayBuffer()
    
    // Return the file with the correct headers
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    
    return new NextResponse(fileData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment'
      }
    })
  } catch (error) {
    console.error('Error in proxy route:', error)
    return NextResponse.json({ 
      error: 'Failed to proxy file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 