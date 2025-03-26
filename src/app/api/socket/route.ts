import { NextResponse } from 'next/server';
import { getIO } from '@/lib/socket';

export async function GET(request: Request) {
  try {
    const io = getIO();
    return new NextResponse('Socket.IO server is running', { status: 200 });
  } catch (error) {
    console.error('Socket.IO server error:', error);
    return new NextResponse('Socket.IO server error', { status: 500 });
  }
} 