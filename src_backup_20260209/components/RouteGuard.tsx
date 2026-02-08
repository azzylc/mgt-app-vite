import { Navigate } from 'react-router-dom';
import { useRole } from '../context/RoleProvider';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredPermission: string;
}

/**
 * Route Guard - Sayfalara yetkisiz erişimi engeller
 * 
 * Kullanım:
 * <RouteGuard requiredPermission="yonetim-paneli">
 *   <Yonetim />
 * </RouteGuard>
 */
export default function RouteGuard({ children, requiredPermission }: RouteGuardProps) {
  const { rol, loading } = useRole();

  // Rol yüklenirken spinner göster
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
      </div>
    );
  }

  // Rol yoksa login'e yönlendir
  if (!rol) {
    return <Navigate to="/login" replace />;
  }

  // Kullanıcının yetkili olduğu menü id'lerini al
  const kullaniciTuru = Object.keys(rol)[0];
  const allowedMenus: string[] = rol[kullaniciTuru] || [];

  // Yetkisi yoksa ana sayfaya yönlendir
  if (!allowedMenus.includes(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
