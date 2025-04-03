'use client'

import CookieConsent from "react-cookie-consent"

export default function CookieConsentBanner() {
  return (
    <CookieConsent
      location="bottom"
      buttonText="Accept All Cookies"
      declineButtonText="Reject Non-Essential Cookies"
      enableDeclineButton
      cookieName="invoiceauto_cookie_consent"
      style={{ 
        background: "#2B373B",
        zIndex: 9999,
        padding: "1rem",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center"
      }}
      buttonStyle={{ 
        background: "#4CAF50", 
        color: "white", 
        fontSize: "13px",
        padding: "0.5rem 1rem"
      }}
      declineButtonStyle={{ 
        background: "#f44336", 
        color: "white", 
        fontSize: "13px",
        padding: "0.5rem 1rem"
      }}
      expires={365} // Cookie expires after 1 year
      onAccept={() => {
        // Enable optional cookies (analytics, marketing)
        localStorage.setItem('cookieConsent', 'accepted')
      }}
      onDecline={() => {
        // Disable optional cookies
        localStorage.setItem('cookieConsent', 'rejected')
      }}
    >
      We use cookies to ensure secure login and improve your experience. You can choose to accept or reject non-essential cookies.
    </CookieConsent>
  )
} 