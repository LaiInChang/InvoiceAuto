'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Navbar } from '@/components/layout/Navbar'
import { PhoneInput } from '@/components/PhoneInput'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { db } from '@/lib/firebase'

interface UserProfile {
  firstName: string
  lastName: string
  email: string
  phone: string
  phoneCountryCode: string
  company: string
  address: {
    street: string
    houseNumber: string
    addition: string
    postalCode: string
    city: string
    country: string
  }
  paymentMethod: string
}

const EU_COUNTRIES = [
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'DK', name: 'Denmark' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'FI', name: 'Finland' },
]

export default function Account() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [profile, setProfile] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    phoneCountryCode: '+31',
    company: '',
    address: {
      street: '',
      houseNumber: '',
      addition: '',
      postalCode: '',
      city: '',
      country: 'Netherlands'
    },
    paymentMethod: 'ideal'
  })
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'users', user.uid)
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = docSnap.data()
          setProfile({
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            email: user.email || '',
            phone: data.phone || '',
            phoneCountryCode: data.phoneCountryCode || '+31',
            company: data.company || '',
            address: {
              street: data.address?.street || '',
              houseNumber: data.address?.houseNumber || '',
              addition: data.address?.addition || '',
              postalCode: data.address?.postalCode || '',
              city: data.address?.city || '',
              country: data.address?.country || 'Netherlands'
            },
            paymentMethod: data.paymentMethod || 'ideal'
          })
        } else {
          // Initialize with email if no profile exists
          setProfile(prev => ({
            ...prev,
            firstName: user.displayName?.split(' ')[0] || '',
            lastName: user.displayName?.split(' ')[1] || '',
            email: user.email || ''
          }))
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        setMessage({ type: 'error', text: 'Failed to load profile data. Please try again.' })
      }
    }

    fetchProfile()
  }, [user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    try {
      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: `${profile.firstName} ${profile.lastName}`.trim()
      })

      // Store in Firestore
      const docRef = doc(db, 'users', user.uid)
      await setDoc(docRef, {
        ...profile,
        email: user.email, // Ensure email is stored from auth
        updatedAt: new Date().toISOString()
      }, { merge: true })

      setMessage({ type: 'success', text: 'Profile updated successfully!' })
    } catch (error) {
      console.error('Error updating profile:', error)
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' })
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      console.error('Failed to logout:', error)
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white shadow rounded-lg">
            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`${
                    activeTab === 'profile'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Profile & Payment
                </button>
                <button
                  onClick={() => setActiveTab('invoices')}
                  className={`${
                    activeTab === 'invoices'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Invoices
                </button>
                <button
                  onClick={() => setActiveTab('reports')}
                  className={`${
                    activeTab === 'reports'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Reports
                </button>
              </nav>
            </div>

            {/* Content */}
            <div className="p-6">
              {activeTab === 'profile' && (
                <form onSubmit={handleSubmit}>
                  {message && (
                    <div className={`mb-4 p-4 rounded-lg ${
                      message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {message.text}
                    </div>
                  )}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium leading-6 text-gray-900">Personal Information</h3>
                      <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                            First Name
                          </label>
                          <input
                            type="text"
                            name="firstName"
                            id="firstName"
                            disabled={!isEditing}
                            value={profile.firstName}
                            onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                            Last Name
                          </label>
                          <input
                            type="text"
                            name="lastName"
                            id="lastName"
                            disabled={!isEditing}
                            value={profile.lastName}
                            onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                            Email
                          </label>
                          <div className="mt-1 flex rounded-md shadow-sm h-12">
                            <input
                              type="email"
                              name="email"
                              id="email"
                              readOnly
                              value={profile.email}
                              className="block w-full rounded-md border-gray-300 bg-gray-100 text-gray-500 sm:text-sm cursor-not-allowed h-12"
                            />
                          </div>
                        
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                            Phone Number
                          </label>
                          <PhoneInput
                            value={profile.phone}
                            countryCode={profile.phoneCountryCode}
                            onChange={(phone, countryCode) => 
                              setProfile({ ...profile, phone, phoneCountryCode: countryCode })}
                            disabled={!isEditing}
                            className="mt-1"
                          />
                        </div>

                        <div className="sm:col-span-6">
                          <label htmlFor="company" className="block text-sm font-medium text-gray-700">
                            Company Name
                          </label>
                          <input
                            type="text"
                            name="company"
                            id="company"
                            disabled={!isEditing}
                            value={profile.company}
                            onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium leading-6 text-gray-900">Address</h3>
                      <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                        <div className="sm:col-span-2">
                          <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                            Country
                          </label>
                          <select
                            id="country"
                            name="country"
                            disabled={!isEditing}
                            value={profile.address.country}
                            onChange={(e) => setProfile({
                              ...profile,
                              address: { ...profile.address, country: e.target.value }
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          >
                            {EU_COUNTRIES.map(country => (
                              <option key={country.code} value={country.code}>
                                {country.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="street" className="block text-sm font-medium text-gray-700">
                            Street
                          </label>
                          <input
                            type="text"
                            name="street"
                            id="street"
                            disabled={!isEditing}
                            value={profile.address.street}
                            onChange={(e) => setProfile({
                              ...profile,
                              address: { ...profile.address, street: e.target.value }
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label htmlFor="houseNumber" className="block text-sm font-medium text-gray-700">
                            House No.
                          </label>
                          <input
                            type="text"
                            name="houseNumber"
                            id="houseNumber"
                            disabled={!isEditing}
                            value={profile.address.houseNumber}
                            onChange={(e) => setProfile({
                              ...profile,
                              address: { ...profile.address, houseNumber: e.target.value }
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label htmlFor="addition" className="block text-sm font-medium text-gray-700">
                            Addition
                          </label>
                          <input
                            type="text"
                            name="addition"
                            id="addition"
                            disabled={!isEditing}
                            value={profile.address.addition}
                            onChange={(e) => setProfile({
                              ...profile,
                              address: { ...profile.address, addition: e.target.value }
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700">
                            Postal Code
                          </label>
                          <input
                            type="text"
                            name="postalCode"
                            id="postalCode"
                            disabled={!isEditing}
                            value={profile.address.postalCode}
                            onChange={(e) => setProfile({
                              ...profile,
                              address: { ...profile.address, postalCode: e.target.value }
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                            City
                          </label>
                          <input
                            type="text"
                            name="city"
                            id="city"
                            disabled={!isEditing}
                            value={profile.address.city}
                            onChange={(e) => setProfile({
                              ...profile,
                              address: { ...profile.address, city: e.target.value }
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 h-12"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium leading-6 text-gray-900">Payment Method</h3>
                      <div className="mt-4">
                        <select
                          id="payment"
                          name="payment"
                          disabled={!isEditing}
                          value={profile.paymentMethod}
                          onChange={(e) => setProfile({ ...profile, paymentMethod: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500"
                        >
                          <option value="credit_card">Credit Card</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="paypal">PayPal</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-3">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
                          >
                            {loading ? 'Saving...' : 'Save Changes'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditing(true)}
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700"
                        >
                          Edit Profile
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {activeTab === 'invoices' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Your Invoices</h3>
                  <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200">
                      {/* TODO: Replace with actual invoice data */}
                      <li className="px-4 py-4 flex items-center justify-between">
                        <div className="text-sm text-gray-900">No invoices found</div>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Excel Reports</h3>
                  <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200">
                      {/* TODO: Replace with actual reports data */}
                      <li className="px-4 py-4 flex items-center justify-between">
                        <div className="text-sm text-gray-900">No reports found</div>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          
        </div>
      </div>
    </>
  )
} 