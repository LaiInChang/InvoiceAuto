'use client'

import { useEffect } from 'react'

interface CloudinaryUploadWidgetProps {
  onSuccess: (result: any) => void
  onError: (error: any) => void
  autoOpen: boolean
}

declare global {
  interface Window {
    cloudinary: any
  }
}

export function CloudinaryUploadWidget({ onSuccess, onError, autoOpen }: CloudinaryUploadWidgetProps) {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://upload-widget.cloudinary.com/global/all.js'
    script.async = true
    document.body.appendChild(script)

    script.onload = () => {
      if (window.cloudinary) {
        const widget = window.cloudinary.createUploadWidget(
          {
            cloudName: 'dxxqjzq6c',
            uploadPreset: 'invoice_auto',
            sources: ['local', 'camera'],
            multiple: true,
            maxFiles: 10,
            resourceType: 'auto',
            folder: 'invoices',
            maxFileSize: 5000000, // 5MB
            allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
            styles: {
              palette: {
                window: '#FFFFFF',
                windowBorder: '#90A0B3',
                tabIcon: '#0078FF',
                menuIcons: '#5A616A',
                textDark: '#000000',
                textLight: '#FFFFFF',
                link: '#0078FF',
                action: '#FF620C',
                inactiveTabIcon: '#0E2F5A',
                error: '#F44235',
                inProgress: '#0078FF',
                complete: '#20B832',
                sourceBg: '#E4EBF1',
                folderBg: '#C7C7C7',
              },
            },
            language: 'en',
            text: {
              'queue.title': 'Upload your invoices',
              'queue.title_uploading_with_count': 'Uploading %s files...',
              'queue.title_processing_with_count': 'Processing %s files...',
              'queue.title_complete': 'Upload complete',
              'queue.title_complete_with_count': 'Upload complete. %s file(s) uploaded.',
              'queue.title_error': 'Upload error',
              'queue.title_error_with_count': 'Upload error. %s file(s) failed.',
            },
            singleUploadAutoClose: true,
            showUploadMoreButton: true,
            showSkipCropButton: true,
            showAdvancedOptions: false,
            showPoweredBy: false,
            showCompletedButton: false,
            showInsecurePreview: false,
            tabInsideWidget: true,
            usePreBatchCallback: false,
            useTagsCallback: false,
            useUploadPresetsCallback: false,
            useMetadataCallback: false,
            debug: false,
          },
          (error: any, result: any) => {
            if (!error && result && result.event === 'success') {
              onSuccess(result)
            } else if (error) {
              onError(error)
            }
          }
        )

        if (autoOpen) {
          widget.open()
        }
      }
    }

    return () => {
      document.body.removeChild(script)
    }
  }, [onSuccess, onError, autoOpen])

  return null
} 