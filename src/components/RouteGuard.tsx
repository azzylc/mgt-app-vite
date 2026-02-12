import { Navigate } from 'react-router-dom';
import { useRole } from '../context/RoleProvider';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredPermission: string;
}

// Sidebar ile aynı DEFAULT_MENU — yeni menü eklenince buraya da ekle
const DEFAULT_MENU: Record<string, string[]> = {
  Kurucu: ["genel-bakis", "qr-giris", "giris-cikis-islemleri", "personel", "duyurular", "gorevler", "notlar", "takvim", "izinler", "raporlar", "ayarlar", "yonetim-paneli", "talepler-merkezi", "taleplerim"],
  Yönetici: ["genel-bakis", "giris-cikis-islemleri", "duyurular", "gorevler", "notlar", "takvim", "izinler", "raporlar", "qr-giris", "taleplerim"],
  Personel: ["genel-bakis", "qr-giris", "duyurular", "gorevler", "notlar", "takvim", "izinler", "taleplerim"],
};

/**
 * Route Guard - Sayfalara yetkisiz erişimi engeller
 * 
 * Sidebar ile aynı "yeni menü otomatik ekleme" mantığını kullanır:
 * Firestore'da hiçbir rolde tanımlı olmayan ama DEFAULT_MENU'de olan
 * menüler otomatik olarak izinli kabul edilir.
 */
export default function RouteGuard({ children, requiredPermission }: RouteGuardProps) {
  const { rol, loading, personelData } = useRole();

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
  const kullaniciTuru = personelData?.kullaniciTuru || Object.keys(rol)[0];
  const firestoreIds: string[] = rol[kullaniciTuru] || [];
  const defaultIds = DEFAULT_MENU[kullaniciTuru] || DEFAULT_MENU.Personel;

  // Sidebar ile aynı mantık: Firestore'da hiçbir rolde tanımlı olmayan yeni menüleri otomatik ekle
  const allFirestoreIds = new Set<string>();
  Object.values(rol || {}).forEach((ids: unknown) => {
    if (Array.isArray(ids)) ids.forEach((id: string) => allFirestoreIds.add(id));
  });
  const yeniMenuler = defaultIds.filter(id => !allFirestoreIds.has(id));
  const allowedMenus = [...firestoreIds, ...yeniMenuler];

  // Yetkisi yoksa ana sayfaya yönlendir
  if (!allowedMenus.includes(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
