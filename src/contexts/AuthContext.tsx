'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  User,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastActivity, setLastActivity] = useState<number>(Date.now())

  // Auto logout after 30 minutes of inactivity
  useEffect(() => {
    const inactivityTimeout = 30 * 60 * 1000 // 30 minutes in milliseconds
    let inactivityTimer: NodeJS.Timeout

    const resetInactivityTimer = () => {
      setLastActivity(Date.now())
      if (inactivityTimer) {
        clearTimeout(inactivityTimer)
      }
      if (user) {
        inactivityTimer = setTimeout(() => {
          signOut()
        }, inactivityTimeout)
      }
    }

    // Reset timer on user activity
    const handleUserActivity = () => {
      resetInactivityTimer()
    }

    // Add event listeners for user activity
    window.addEventListener('mousemove', handleUserActivity)
    window.addEventListener('keydown', handleUserActivity)
    window.addEventListener('click', handleUserActivity)
    window.addEventListener('scroll', handleUserActivity)

    // Initial setup
    resetInactivityTimer()

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleUserActivity)
      window.removeEventListener('keydown', handleUserActivity)
      window.removeEventListener('click', handleUserActivity)
      window.removeEventListener('scroll', handleUserActivity)
      if (inactivityTimer) {
        clearTimeout(inactivityTimer)
      }
    }
  }, [user])

  useEffect(() => {
    if (!auth) {
      console.error('Firebase Auth is not initialized');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const getIdToken = async () => {
    if (!user) {
      throw new Error('User not authenticated')
    }
    return await user.getIdToken()
  }

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
      setLastActivity(Date.now())
    } catch (error) {
      console.error('Error signing in:', error)
      throw error
    }
  }

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (error) {
      throw error
    }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (error) {
      throw error
    }
  }

  const signOut = async () => {
    try {
      await firebaseSignOut(auth)
      // Clear any stored data
      localStorage.removeItem('processingResult')
      localStorage.removeItem('cookieConsent')
      // Clear any other stored data as needed
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  const value = {
    user,
    loading,
    signInWithEmail,
    signInWithGoogle,
    signUpWithEmail,
    signOut,
    getIdToken,
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 