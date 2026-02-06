import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, useRole } from '../context/RoleProvider'
import { usePushNotifications } from '../hooks/usePushNotifications'
import Sidebar from '../components/Sidebar'

export default function AuthLayout() {
  const user = useAuth()
  const { loading, authReady } = useRole()

  // Push notification: login olunca token al, Firestore'a kaydet
  usePushNotifications(user?.email)

  // Auth henüz hazır değilse veya roller yükleniyorsa bekle
  if (!authReady || loading) {
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
      <div className="md:ml-56 pb-20 md:pb-0">
        <Outlet />
      </div>
    </>
  )
}
