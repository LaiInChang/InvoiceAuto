import { useState } from 'react'

interface PhoneInputProps {
  value: string
  countryCode: string
  onChange: (phoneNumber: string, countryCode: string) => void
  disabled?: boolean
  className?: string
}

const countryCodes = [
  { code: '+31', country: '🇳🇱 Netherlands' },
  { code: '+32', country: '🇧🇪 Belgium' },
  { code: '+49', country: '🇩🇪 Germany' },
  { code: '+33', country: '🇫🇷 France' },
  { code: '+44', country: '🇬🇧 United Kingdom' },
  { code: '+39', country: '🇮🇹 Italy' },
  { code: '+34', country: '🇪🇸 Spain' },
  { code: '+351', country: '🇵🇹 Portugal' },
  { code: '+45', country: '🇩🇰 Denmark' },
  { code: '+46', country: '🇸🇪 Sweden' },
  { code: '+47', country: '🇳🇴 Norway' },
  { code: '+358', country: '🇫🇮 Finland' },
]

export function PhoneInput({ value, countryCode, onChange, disabled, className }: PhoneInputProps) {
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove any non-digit characters except for the plus sign
    const cleaned = e.target.value.replace(/[^\d]/g, '')
    onChange(cleaned, countryCode)
  }

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(value, e.target.value)
  }

  return (
    <div className={`flex ${className}`}>
      <select
        value={countryCode}
        onChange={handleCountryChange}
        disabled={disabled}
        className="rounded-l-md border-r-0 border-gray-300 focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
      >
        {countryCodes.map(({ code, country }) => (
          <option key={code} value={code}>
            {country}
          </option>
        ))}
      </select>
      <input
        type="tel"
        value={value}
        onChange={handlePhoneChange}
        disabled={disabled}
        placeholder="6123456789"
        className="rounded-r-md border-l-0 border-gray-300 focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 flex-1 h-12"
      />
    </div>
  )
} 