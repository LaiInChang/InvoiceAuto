'use client'

import dynamic from 'next/dynamic'

const CookieConsentBanner = dynamic(() => import('./CookieConsent'), {
  ssr: false
})

export default function ClientCookieConsent() {
  return <CookieConsentBanner />
} 