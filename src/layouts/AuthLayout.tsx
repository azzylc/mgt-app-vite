import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { usePushNotifications } from '../hooks/usePushNotifications'
import Sidebar from '../components/Sidebar'

export default function AuthLayout() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Push notification: login olunca token al, Firestore'a kaydet
  usePushNotifications(user?.email)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setUser(null)
      setLoading(false)
    }, 1500)

    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(timeout)
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
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <Sidebar user={user} />
      {/*
        Mobile UX:
        - Sidebar shows a fixed bottom navigation (z-40). Add padding-bottom so page content
          doesn't get hidden behind it on small screens.
        - On md+ we keep the classic left sidebar layout.
      */}
      <div className="md:ml-56 pb-20 md:pb-0">
        <Outlet />
      </div>
    </>
  )
}
