import { useState, useEffect } from 'react'
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id: string
  name: string
  showValidation?: boolean
  isRounded?: 'top' | 'bottom' | 'both' | 'none'
}

interface ValidationState {
  hasMinLength: boolean
  hasUpperCase: boolean
  hasLowerCase: boolean
  hasSpecialChar: boolean
}

export function PasswordInput({ 
  value, 
  onChange, 
  placeholder, 
  disabled, 
  className, 
  id, 
  name,
  showValidation = false,
  isRounded = 'none'
}: PasswordInputProps) {
  const [validation, setValidation] = useState<ValidationState>({
    hasMinLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasSpecialChar: false
  })
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    setValidation({
      hasMinLength: value.length >= 8,
      hasUpperCase: /[A-Z]/.test(value),
      hasLowerCase: /[a-z]/.test(value),
      hasSpecialChar: /[^a-zA-Z0-9]/.test(value)
    })
  }, [value])

  const ValidationItem = ({ isValid, text }: { isValid: boolean; text: string }) => (
    <div className="flex items-center space-x-2">
      {isValid ? (
        <CheckIcon className="h-4 w-4 text-green-500" />
      ) : (
        <XMarkIcon className="h-4 w-4 text-red-500" />
      )}
      <span className={`text-sm ${isValid ? 'text-green-700' : 'text-red-700'}`}>{text}</span>
    </div>
  )

  const getRoundedClass = () => {
    switch (isRounded) {
      case 'top':
        return 'rounded-t-md'
      case 'bottom':
        return 'rounded-b-md'
      case 'both':
        return 'rounded-md'
      default:
        return ''
    }
  }

  return (
    <div className={className}>
      <div className="relative">
        <input
          type="password"
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={placeholder}
          className={`appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm ${getRoundedClass()}`}
        />
      </div>
      
      {showValidation && isFocused && (
        <div className="mt-2 p-2 bg-gray-50 rounded-md border border-gray-200">
          <div className="grid grid-cols-1 gap-2">
            <ValidationItem 
              isValid={validation.hasMinLength} 
              text="At least 8 characters" 
            />
            <ValidationItem 
              isValid={validation.hasUpperCase} 
              text="At least one uppercase letter" 
            />
            <ValidationItem 
              isValid={validation.hasLowerCase} 
              text="At least one lowercase letter" 
            />
            <ValidationItem 
              isValid={validation.hasSpecialChar} 
              text="At least one special character" 
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function isPasswordValid(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[^a-zA-Z0-9]/.test(password)
  )
} 