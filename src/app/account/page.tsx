'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Navbar } from '@/components/layout/Navbar'
import { PhoneInput } from '@/components/PhoneInput'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore'
import { format } from 'date-fns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { TextField, Button, Box, Select, MenuItem, FormControl, InputLabel } from '@mui/material'
import { ArrowUpIcon, ArrowDownIcon, CalendarIcon, ChevronUpIcon, ChevronDownIcon, MagnifyingGlassIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { DateRangeFilter } from '@/components/DateRangeFilter'

interface UserProfile {
  uid: string
  firstName: string
  lastName: string
  email: string
  phone: string
  phoneCountryCode: string
  company: string
  address: {
    country: string
    street: string
    houseNumber: string
    addition: string
    postalCode: string
    city: string
  }
  paymentMethod: string
  displayName: string
  createdAt: Date
}

interface Invoice {
  id: string
  fileName: string
  fileUrl: string
  processedAt: Date
  publicId: string
  status: string
  userId: string
}

interface Report {
  id: string
  fileName: string
  fileUrl: string
  processedAt: Date
  userId: string
  status: string
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
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [profile, setProfile] = useState<UserProfile>({
    uid: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    phoneCountryCode: '+31',
    company: '',
    address: {
      country: 'NL',
      street: '',
      houseNumber: '',
      addition: '',
      postalCode: '',
      city: ''
    },
    paymentMethod: 'ideal',
    displayName: '',
    createdAt: new Date()
  })
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([])
  const [allReports, setAllReports] = useState<Report[]>([])
  const [displayedInvoices, setDisplayedInvoices] = useState<Invoice[]>([])
  const [displayedReports, setDisplayedReports] = useState<Report[]>([])
  const [invoiceStartDate, setInvoiceStartDate] = useState<Date | null>(null)
  const [invoiceEndDate, setInvoiceEndDate] = useState<Date | null>(null)
  const [reportStartDate, setReportStartDate] = useState<Date | null>(null)
  const [reportEndDate, setReportEndDate] = useState<Date | null>(null)
  const [invoiceSort, setInvoiceSort] = useState<'asc' | 'desc'>('desc')
  const [reportSort, setReportSort] = useState<'asc' | 'desc'>('desc')
  const [showInvoiceFilter, setShowInvoiceFilter] = useState(false)
  const [showReportFilter, setShowReportFilter] = useState(false)
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [reportSearch, setReportSearch] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        console.log('No user found, redirecting to login')
        router.push('/login')
        return
      }

      console.log('Fetching data for user:', user.uid)
      setLoading(true)

      try {
        // Fetch user profile
        console.log('Fetching user profile...')
        const userDocRef = doc(db, 'users', user.uid)
        const userDoc = await getDoc(userDocRef)
        
        if (userDoc.exists()) {
          console.log('User profile found:', userDoc.data())
          setProfile(userDoc.data() as UserProfile)
        } else {
          console.log('No user profile found, creating new profile')
          const newProfile: UserProfile = {
            uid: user.uid,
            firstName: '',
            lastName: '',
            email: user.email || '',
            phone: '',
            phoneCountryCode: 'NL',
            company: '',
            address: {
              country: 'NL',
              street: '',
              houseNumber: '',
              addition: '',
              postalCode: '',
              city: ''
            },
            paymentMethod: 'ideal',
            displayName: user.displayName || 'User',
            createdAt: new Date()
          }
          await setDoc(userDocRef, newProfile)
          setProfile(newProfile)
        }

        // Fetch invoices
        console.log('Fetching invoices...')
        const invoicesQuery = query(
          collection(db, 'invoices'),
          where('userId', '==', user.uid),
          orderBy('processedAt', 'desc')
        )
        console.log('Invoices query parameters:', {
          collection: 'invoices',
          userId: user.uid,
          orderBy: 'processedAt'
        })
        
        try {
        const invoicesSnapshot = await getDocs(invoicesQuery)
          console.log('Filtered invoices snapshot:', {
          empty: invoicesSnapshot.empty,
          size: invoicesSnapshot.size,
          docs: invoicesSnapshot.docs.map(doc => ({
            id: doc.id,
            data: doc.data()
          }))
        })

        const invoicesData = invoicesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
            processedAt: doc.data().processedAt.toDate()
        })) as Invoice[]
          console.log('Processed invoices data:', invoicesData)

        // Fetch reports
        console.log('Fetching reports...')
        const reportsQuery = query(
          collection(db, 'reports'),
          where('userId', '==', user.uid),
          orderBy('processedAt', 'desc')
        )
        console.log('Reports query parameters:', {
          collection: 'reports',
          userId: user.uid,
          orderBy: 'processedAt'
        })

        const reportsSnapshot = await getDocs(reportsQuery)
          console.log('Filtered reports snapshot:', {
          empty: reportsSnapshot.empty,
          size: reportsSnapshot.size,
          docs: reportsSnapshot.docs.map(doc => ({
            id: doc.id,
            data: doc.data()
          }))
        })

          const reportsData = reportsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            processedAt: doc.data().processedAt.toDate()
          })) as Report[]
          console.log('Processed reports data:', reportsData)

          setAllInvoices(invoicesData)
          setAllReports(reportsData)
          setDisplayedInvoices(invoicesData)
          setDisplayedReports(reportsData)
        } catch (error) {
          console.error('Error fetching data:', error)
          if (error instanceof Error) {
            setMessage({
              type: 'error',
              text: `Error: ${error.message}`
            })
          }
        }

      } catch (error) {
        console.error('Error in fetchData:', error)
        if (error instanceof Error) {
          setMessage({
            type: 'error',
            text: `Error: ${error.message}`
          })
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user, router])

  useEffect(() => {
    const filterAndSortInvoices = () => {
      // Filter by date range
      const filterByDateRange = (date: Date) => {
        if (!invoiceStartDate && !invoiceEndDate) return true
        if (invoiceStartDate && !invoiceEndDate) return date >= invoiceStartDate
        if (!invoiceStartDate && invoiceEndDate) {
          const endOfDay = new Date(invoiceEndDate)
          endOfDay.setHours(23, 59, 59, 999)
          return date <= endOfDay
        }
        if (invoiceStartDate && invoiceEndDate) {
          const endOfDay = new Date(invoiceEndDate)
          endOfDay.setHours(23, 59, 59, 999)
          return date >= invoiceStartDate && date <= endOfDay
        }
        return true
      }

      // Filter by search term
      const filterBySearch = (invoice: Invoice) => {
        if (!invoiceSearch) return true
        return invoice.fileName.toLowerCase().includes(invoiceSearch.toLowerCase())
      }

      // Filter invoices
      const filteredInvoices = allInvoices
        .filter(invoice => filterByDateRange(invoice.processedAt))
        .filter(filterBySearch)
      
      // Sort by date
      const sortedInvoices = [...filteredInvoices].sort((a, b) => {
        if (invoiceSort === 'asc') {
          return a.processedAt.getTime() - b.processedAt.getTime()
        } else {
          return b.processedAt.getTime() - a.processedAt.getTime()
        }
      })

      setDisplayedInvoices(sortedInvoices)
    }

    filterAndSortInvoices()
  }, [allInvoices, invoiceStartDate, invoiceEndDate, invoiceSort, invoiceSearch])

  useEffect(() => {
    const filterAndSortReports = () => {
      // Filter by date range
      const filterByDateRange = (date: Date) => {
        if (!reportStartDate && !reportEndDate) return true
        if (reportStartDate && !reportEndDate) return date >= reportStartDate
        if (!reportStartDate && reportEndDate) {
          const endOfDay = new Date(reportEndDate)
          endOfDay.setHours(23, 59, 59, 999)
          return date <= endOfDay
        }
        if (reportStartDate && reportEndDate) {
          const endOfDay = new Date(reportEndDate)
          endOfDay.setHours(23, 59, 59, 999)
          return date >= reportStartDate && date <= endOfDay
        }
        return true
      }

      // Filter by search term
      const filterBySearch = (report: Report) => {
        if (!reportSearch) return true
        return report.fileName.toLowerCase().includes(reportSearch.toLowerCase())
      }

      // Filter reports
      const filteredReports = allReports
        .filter(report => filterByDateRange(report.processedAt))
        .filter(filterBySearch)
      
      // Sort by date
      const sortedReports = [...filteredReports].sort((a, b) => {
        if (reportSort === 'asc') {
          return a.processedAt.getTime() - b.processedAt.getTime()
        } else {
          return b.processedAt.getTime() - a.processedAt.getTime()
        }
      })

      setDisplayedReports(sortedReports)
    }

    filterAndSortReports()
  }, [allReports, reportStartDate, reportEndDate, reportSort, reportSearch])

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

  const handleSortInvoices = () => {
    setInvoiceSort(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  const handleSortReports = () => {
    setReportSort(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  const handleClearInvoiceDates = () => {
    setInvoiceStartDate(null)
    setInvoiceEndDate(null)
  }

  const handleClearReportDates = () => {
    setReportStartDate(null)
    setReportEndDate(null)
  }

  const handleInvoiceSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInvoiceSearch(e.target.value)
  }

  const handleReportSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReportSearch(e.target.value)
  }

  const handleDownload = async (id: string, type: 'invoice' | 'report') => {
    try {
      // Get the document from Firestore
      const docRef = doc(db, type === 'invoice' ? 'invoices' : 'reports', id)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        throw new Error(`${type} not found`)
      }

      const data = docSnap.data()
      let fileUrl = data.fileUrl
      const fileName = data.fileName

      // If it's a Cloudinary URL (for invoices), modify it to include filename
      if (type === 'invoice' && fileUrl.includes('cloudinary.com')) {
        // Extract the base URL and version number more carefully
        const uploadIndex = fileUrl.indexOf('/upload/')
        const versionIndex = fileUrl.indexOf('/v', uploadIndex)
        const baseUrl = fileUrl.substring(0, uploadIndex + 7) // Include '/upload/'
        const versionAndRest = fileUrl.substring(versionIndex + 1) // Keep everything after '/v'
        
        // Remove file extension from fileName
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
        
        // Reconstruct URL with fl_attachment and filename
        fileUrl = `${baseUrl}/fl_attachment:${fileNameWithoutExt}/${versionAndRest}`
      }

      // Create a temporary link element
      const link = document.createElement('a')
      link.href = fileUrl
      link.download = fileName // This will be used for non-Cloudinary downloads
      link.target = '_blank'
      link.rel = 'noopener noreferrer'

      // Append to body, click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error(`Error downloading ${type}:`, error)
      // You might want to show an error message to the user here
    }
  }

  // Add batch download function
  const handleBatchDownload = async (type: 'invoice' | 'report') => {
    try {
      const items = type === 'invoice' ? displayedInvoices : displayedReports
      
      // Create a temporary container for all download links
      const container = document.createElement('div')
      container.style.display = 'none'
      document.body.appendChild(container)

      // Create and trigger downloads for each item
      for (const item of items) {
        let fileUrl = item.fileUrl
        const fileName = item.fileName

        // If it's a Cloudinary URL (for invoices), modify it to include filename
        if (type === 'invoice' && fileUrl.includes('cloudinary.com')) {
          // Extract the base URL and version number more carefully
          const uploadIndex = fileUrl.indexOf('/upload/')
          const versionIndex = fileUrl.indexOf('/v', uploadIndex)
          const baseUrl = fileUrl.substring(0, uploadIndex + 7) // Include '/upload/'
          const versionAndRest = fileUrl.substring(versionIndex + 1) // Keep everything after '/v'
          
          // Remove file extension from fileName
          const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
          
          // Reconstruct URL with fl_attachment and filename
          fileUrl = `${baseUrl}fl_attachment:${fileNameWithoutExt}/${versionAndRest}`
        }

        const link = document.createElement('a')
        link.href = fileUrl
        link.download = fileName // This will be used for non-Cloudinary downloads
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        container.appendChild(link)
        link.click()
      }

      // Clean up
      document.body.removeChild(container)
    } catch (error) {
      console.error(`Error in batch download:`, error)
      // You might want to show an error message to the user here
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-red-600">{error}</div>
        </div>
      </div>
    )
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
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">Your Invoices</h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search invoices..."
                          value={invoiceSearch}
                          onChange={handleInvoiceSearch}
                          className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                      </div>
                      <button
                        onClick={() => setShowInvoiceFilter(!showInvoiceFilter)}
                        className="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title="Filter by date"
                      >
                        <CalendarIcon className="h-5 w-5" />
                      </button>
                      {/* <button
                        onClick={handleSortInvoices}
                        className="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title={`Sort by date ${invoiceSort === 'asc' ? 'ascending' : 'descending'}`}
                      >
                        {invoiceSort === 'asc' ? (
                          <ArrowUpIcon className="h-5 w-5" />
                        ) : (
                          <ArrowDownIcon className="h-5 w-5" />
                        )}
                      </button> */}
                      <button
                        onClick={() => handleBatchDownload('invoice')}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        disabled={displayedInvoices.length === 0}
                      >
                        <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                        Download All
                      </button>
                              </div>
                                </div>

                  {showInvoiceFilter && (
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-gray-700">Filter by Date Range</h4>
                        <button
                          onClick={handleClearInvoiceDates}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Clear Dates
                        </button>
                              </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <LocalizationProvider dateAdapter={AdapterDateFns}>
                            <DatePicker
                              value={invoiceStartDate}
                              onChange={(newValue) => setInvoiceStartDate(newValue)}
                              slotProps={{
                                textField: {
                                  size: "small",
                                  fullWidth: true,
                                  placeholder: "Select start date"
                                }
                              }}
                            />
                          </LocalizationProvider>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                          <LocalizationProvider dateAdapter={AdapterDateFns}>
                            <DatePicker
                              value={invoiceEndDate}
                              onChange={(newValue) => setInvoiceEndDate(newValue)}
                              slotProps={{
                                textField: {
                                  size: "small",
                                  fullWidth: true,
                                  placeholder: "Select end date"
                                }
                              }}
                            />
                          </LocalizationProvider>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            File Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              onClick={handleSortInvoices}
                              className="inline-flex items-center group"
                            >
                              Upload Time
                              <span className="ml-1">
                                {invoiceSort === 'asc' ? (
                                  <ChevronUpIcon className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                ) : (
                                  <ChevronDownIcon className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                )}
                              </span>
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {displayedInvoices.length > 0 ? (
                          displayedInvoices.map((invoice) => (
                            <tr key={invoice.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {invoice.fileName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {invoice.processedAt.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <button
                                  onClick={() => handleDownload(invoice.id, 'invoice')}
                                  className="text-primary-600 hover:text-primary-900"
                                >
                                  <ArrowDownTrayIcon className="h-5 w-5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                              No invoices found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">Your Reports</h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search reports..."
                          value={reportSearch}
                          onChange={handleReportSearch}
                          className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                      </div>
                      <button
                        onClick={() => setShowReportFilter(!showReportFilter)}
                        className="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title="Filter by date"
                      >
                        <CalendarIcon className="h-5 w-5" />
                      </button>
                      {/* <button
                        onClick={handleSortReports}
                        className="inline-flex items-center p-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        title={`Sort by date ${reportSort === 'asc' ? 'ascending' : 'descending'}`}
                      >
                        {reportSort === 'asc' ? (
                          <ArrowUpIcon className="h-5 w-5" />
                        ) : (
                          <ArrowDownIcon className="h-5 w-5" />
                        )}
                      </button> */}
                      <button
                        onClick={() => handleBatchDownload('report')}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        disabled={displayedReports.length === 0}
                      >
                        <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                        Download All
                      </button>
                              </div>
                                </div>

                  {showReportFilter && (
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-gray-700">Filter by Date Range</h4>
                        <button
                          onClick={handleClearReportDates}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Clear Dates
                        </button>
                              </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <LocalizationProvider dateAdapter={AdapterDateFns}>
                            <DatePicker
                              value={reportStartDate}
                              onChange={(newValue) => setReportStartDate(newValue)}
                              slotProps={{
                                textField: {
                                  size: "small",
                                  fullWidth: true,
                                  placeholder: "Select start date"
                                }
                              }}
                            />
                          </LocalizationProvider>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                          <LocalizationProvider dateAdapter={AdapterDateFns}>
                            <DatePicker
                              value={reportEndDate}
                              onChange={(newValue) => setReportEndDate(newValue)}
                              slotProps={{
                                textField: {
                                  size: "small",
                                  fullWidth: true,
                                  placeholder: "Select end date"
                                }
                              }}
                            />
                          </LocalizationProvider>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            File Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              onClick={handleSortReports}
                              className="inline-flex items-center group"
                            >
                              Upload Time
                              <span className="ml-1">
                                {reportSort === 'asc' ? (
                                  <ChevronUpIcon className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                ) : (
                                  <ChevronDownIcon className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                                )}
                              </span>
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {displayedReports.length > 0 ? (
                          displayedReports.map((report) => (
                            <tr key={report.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {report.fileName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {report.processedAt.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <button
                                  onClick={() => handleDownload(report.id, 'report')}
                                  className="text-primary-600 hover:text-primary-900"
                                >
                                  <ArrowDownTrayIcon className="h-5 w-5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                              No reports found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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