import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../lib/firebase'
import Sidebar from '../components/Sidebar'

export default function AuthLayout() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('🔥 [AUTH] Setting up observer...')

    const timeout = setTimeout(() => {
      console.warn('⚠️ [AUTH] Observer timeout, assuming guest')
      setUser(null)
      setLoading(false)
    }, 1500)

    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(timeout)
      console.log('🌐 [AUTH] State Changed:', u ? 'User' : 'Guest')
      setUser(u)
      setLoading(false)
    })

    return () => {
      clearTimeout(timeout)
      unsub()
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
      </div>
    )
  }

  if (!user) {
    console.warn('⚠️ [AUTH] No user, redirecting to login')
    return <Navigate to="/login" replace />
  }

  console.log('✅ [AUTH] User authenticated, rendering page')
  
  return (
    <>
      <Sidebar user={user} />
      <div className="md:ml-56">
        <Outlet />
      </div>
    </>
  )
}
