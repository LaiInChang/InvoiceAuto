# InvoiceAuto

A Next.js application for automated invoice processing using Azure Document Intelligence and OpenAI GPT-4.

## Features

- Multiple invoice upload and processing
- Real-time processing status updates
- Azure Document Intelligence integration
- OpenAI GPT-4 analysis
- Firebase Authentication
- Cloudinary file storage

## Tech Stack

- Next.js 14
- TypeScript
- Firebase Authentication
- Azure Document Intelligence
- OpenAI GPT-4
- Cloudinary
- Tailwind CSS

## Prerequisites

- Node.js 18+ and npm
- Firebase project
- Azure Document Intelligence service
- OpenAI API key
- Cloudinary account

## Environment Variables

Create a `.env.local` file with the following variables:

```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Azure
AZURE_DOCUMENT_ENDPOINT=
AZURE_DOCUMENT_KEY=

# OpenAI
OPENAI_API_KEY=

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=
```

## Getting Started

1. Clone the repository:
```bash
git clone [repository-url]
cd InvoiceAuto
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables in `.env.local`

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

- `/src/app` - Next.js app router pages and API routes
- `/src/components` - Reusable React components
- `/src/contexts` - React context providers
- `/src/lib` - Utility functions and configurations

## License

MIT 