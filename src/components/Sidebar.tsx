
import { useState, useEffect, Suspense, createContext, useContext } from "react";
import { useRole } from "../context/RoleProvider";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";

import * as Sentry from '@sentry/react';
import BildirimPaneli from './BildirimPaneli';

// Sidebar Context - mobilde açık/kapalı durumu için
const SidebarContext = createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}>({ isOpen: false, setIsOpen: () => {} });

export const useSidebar = () => useContext(SidebarContext);

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  submenu?: { label: string; path?: string; type?: string }[];
  mobileOnly?: boolean;
  excludeKurucu?: boolean;
}

interface SidebarProps {
  user: { email?: string | null } | null;
}

function SidebarContent({ user }: SidebarProps) {
  const { rol: rolYetkileri, loading: rolLoading, personelData } = useRole();
  const location = useLocation();
  const pathname = location.pathname;
  const [searchParams] = useSearchParams();
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Mobil kontrolü
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sayfa değişince mobil menüyü kapat
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // personelData artık context'ten geliyor — duplicate onSnapshot SİLİNDİ

  const isKurucu = personelData?.kullaniciTuru === "Kurucu";
  const isYonetici = personelData?.kullaniciTuru === "Yönetici";
  const isPersonel = personelData?.kullaniciTuru === "Personel" || (!isKurucu && !isYonetici);

  const DEFAULT_MENU: Record<string, string[]> = {
    Kurucu: ["genel-bakis", "qr-giris", "giris-cikis-islemleri", "personel", "duyurular", "gorevler", "notlar", "takvim", "izinler", "raporlar", "ayarlar", "yonetim-paneli", "talepler-merkezi", "taleplerim"],
    Yönetici: ["genel-bakis", "giris-cikis-islemleri", "duyurular", "gorevler", "notlar", "takvim", "izinler", "raporlar", "qr-giris", "taleplerim"],
    Personel: ["genel-bakis", "qr-giris", "duyurular", "gorevler", "notlar", "takvim", "izinler", "taleplerim"],
  };

  const getFilteredMenuItems = () => {
    const kullaniciTuru = personelData?.kullaniciTuru || "Kurucu";
    
    // Firestore'dan gelen yetkileri kullan, yoksa DEFAULT_MENU
    // Yeni eklenen menü öğeleri: DEFAULT_MENU'de var ama Firestore'da henüz tanımlı değilse otomatik ekle
    const firestoreIds = (rolYetkileri && rolYetkileri[kullaniciTuru]) ? rolYetkileri[kullaniciTuru] : null;
    const defaultIds = DEFAULT_MENU[kullaniciTuru] || DEFAULT_MENU.Personel;
    
    let allowedIds: string[];
    if (firestoreIds) {
      // Firestore'da kayıtlı olan menü ID'lerinin tamamı (tüm roller)
      const allFirestoreIds = new Set<string>();
      Object.values(rolYetkileri || {}).forEach((ids: unknown) => {
        if (Array.isArray(ids)) ids.forEach((id: string) => allFirestoreIds.add(id));
      });
      // DEFAULT'ta olup Firestore'da hiçbir rolde tanımlı olmayan = yeni eklenen menü
      const yeniMenuler = defaultIds.filter(id => !allFirestoreIds.has(id));
      allowedIds = [...firestoreIds, ...yeniMenuler];
    } else {
      allowedIds = defaultIds;
    }

    let items: MenuItem[] = [
      { id: "genel-bakis", label: "Genel Bakış", icon: "📊", path: "/" },
      { id: "qr-giris", label: "Giriş-Çıkış", icon: "📱", path: "/qr-giris", mobileOnly: true },
      {
        id: "giris-cikis-islemleri", label: "Giriş - Çıkış / Vardiya", icon: "🔄",
        submenu: [
          { label: "İşlem Listesi", path: "/giris-cikis/islem-listesi" },
          { label: "Manuel İşlem Ekle", path: "/giris-cikis/islem-ekle" },
          { label: "İşlem Ekle (Puantaj)", path: "/giris-cikis/puantaj" },
          { label: "Vardiya Planı", path: "/giris-cikis/vardiya-plani" },
          { label: "Toplu İşlem Ekle", path: "/giris-cikis/toplu-islem-ekle" },
          { label: "Değişiklik Kayıtları", path: "/giris-cikis/degisiklik-kayitlari" },
        ],
      },
      { id: "duyurular", label: "Duyurular", icon: "📢", path: "/duyurular" },
      { id: "gorevler", label: "Görevler", icon: "✅", path: "/gorevler" },
      { id: "notlar", label: "Notlar", icon: "📝", path: "/notlar" },
      { id: "takvim", label: "Takvim", icon: "📅", path: "/takvim" },
      {
        id: "personel", label: "Personel", icon: "👤",
        submenu: [
          { label: "Tüm Personel", path: "/personel" },
          { label: "Kurucular", path: "/personel?grup=kurucu" },
          { label: "Yöneticiler", path: "/personel?grup=yönetici" },
          { label: "Ayrılanlar", path: "/personel?ayrilanlar=true" },
          { label: "Giriş-Çıkış Kayıtları", path: "/giris-cikis" },
          { label: "Vardiya Planları", path: "/vardiya" },
          { label: "Çalışma Saatleri", path: "/calisma-saatleri" },
        ],
      },
      {
        id: "izinler", label: "İzinler", icon: "🏖️",
        submenu: [
          { label: "İzin Ekle", path: "/izinler/ekle" },
          { label: "İzin Listesi", path: "/izinler" },
          { label: "İzin Toplamları", path: "/izinler/toplamlar" },
          { label: "İzin Talepleri", path: "/izinler/talepler" },
          { label: "İzin Hakkı Ekle", path: "/izinler/hakki-ekle" },
          { label: "İzin Haklarını Listele", path: "/izinler/haklar" },
          { label: "İzin Değişiklik Kayıtları", path: "/izinler/degisiklikler" },
        ],
      },
      {
        id: "raporlar", label: "Raporlar", icon: "📈",
        submenu: [
          { label: "Günlük", type: "header" },
          { label: "Giriş - Çıkış Kayıtları", path: "/raporlar/giris-cikis-kayitlari" },

          { label: "Gelmeyenler", path: "/raporlar/gelmeyenler" },
          { label: "Geç Kalanlar", path: "/raporlar/gec-kalanlar" },
          { label: "Haftalık", type: "header" },
          { label: "Toplam Çalışma Süreleri", path: "/raporlar/haftalik-calisma-sureleri" },
        ],
      },
      { id: "yonetim-paneli", label: "Yönetim Paneli", icon: "👑", path: "/yonetim" },
      { id: "taleplerim", label: "Taleplerim", icon: "📝", path: "/taleplerim" },
      { id: "talepler-merkezi", label: "Talepler Merkezi", icon: "📥", path: "/talepler-merkezi" },
      { id: "ayarlar", label: "Ayarlar", icon: "⚙️", path: "/ayarlar" },
    ];

    const isMobile = window.innerWidth < 768;

    return items.filter(item => {
      if (isKurucu && item.excludeKurucu) return false;
      if (item.mobileOnly && !isMobile) return false;
      return allowedIds.includes(item.id);
    });
  };

  const menuItems = getFilteredMenuItems();

  const bottomNavItems = [
    { icon: "🏠", label: "Ana Sayfa", path: "/" },
    ...(window.innerWidth < 768 ? [{ icon: "📱", label: "Giriş-Çıkış", path: "/qr-giris" }] : []),
    { icon: "📅", label: "Takvim", path: "/takvim" },
    { icon: "✅", label: "Görevler", path: "/gorevler" },
    { icon: "☰", label: "Menü", action: "menu" },
  ];

  const toggleMenu = (menuId: string) => {
    setExpandedMenu(expandedMenu === menuId ? null : menuId);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/#/login";
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const isActive = (path: string) => {
    const [cleanPath, queryString] = path.split("?");
    if (cleanPath === "/") {
      return pathname === "/" && searchParams.toString() === "";
    }
    if (pathname !== cleanPath) return false;
    if (!queryString) return searchParams.toString() === "";
    return searchParams.toString() === queryString;
  };

  const isParentActive = (submenu: { label: string; path?: string; type?: string }[]) => 
    submenu.some(sub => sub.path && isActive(sub.path));

  const MenuContent = () => (
    <>
      <div className="px-4 py-4 border-b border-[#E5E5E5]/50">
        <div className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F7F7F7] rounded-lg p-1 -m-1 transition" onClick={() => window.location.hash = "#/profilim"}>
          {personelData?.foto ? (
            <img src={personelData.foto} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 bg-[#E5E5E5] rounded-full flex items-center justify-center">
              <span className="text-[#2F2F2F] font-medium text-xs">
                {user?.email?.[0]?.toUpperCase() || "A"}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#2F2F2F] truncate">
              {personelData?.ad ? `${personelData.ad} ${personelData.soyad || ''}` : user?.email?.split("@")[0] || "Admin"}
            </p>
            <p className="text-[10px] text-[#8FAF9A] font-medium hover:underline">Profilim →</p>
          </div>
          <BildirimPaneli userEmail={user?.email} kompakt />
        </div>
      </div>

      <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto">
        {menuItems.map((item) => (
          <div key={item.id}>
            {item.submenu ? (
              <>
                <button
                  onClick={() => toggleMenu(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                    isParentActive(item.submenu)
                      ? "bg-[#8FAF9A] text-[#2F2F2F]"
                      : "text-[#2F2F2F] hover:bg-white/60"
                  }`}
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className={`text-[10px] transition-transform duration-200 ${expandedMenu === item.id ? "rotate-90" : ""}`}>▶</span>
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${expandedMenu === item.id ? "max-h-[500px]" : "max-h-0"}`}>
                  <div className="ml-7 space-y-0.5 py-1">
                    {item.submenu.map((subItem, idx) => (
                      subItem.type === "header" ? (
                        <div key={idx} className="px-3 py-1.5 text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wider mt-2 first:mt-0">
                          {subItem.label}
                        </div>
                      ) : (
                        <Link key={subItem.path} to={subItem.path}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            isActive(subItem.path) ? "bg-white text-[#2F2F2F]" : "text-[#8A8A8A] hover:bg-white/60"
                          }`}
                        >
                          <span>{subItem.label}</span>
                        </Link>
                      )
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <Link to={item.path!}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  isActive(item.path!) ? "bg-[#8FAF9A] text-[#2F2F2F]" : "text-[#2F2F2F] hover:bg-white/60"
                }`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[#E5E5E5]/50">
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[#8A8A8A] hover:bg-white/60 rounded-lg transition-all text-xs font-medium"
        >
          <span>🚪</span>
          <span>Çıkış Yap</span>
        </button>
        <div className="mt-2 text-center">
          <p className="text-[11px] font-semibold text-[#8A8A8A]/60 tracking-wide">MGT App®</p>
          <p className="text-[9px] text-[#8A8A8A]/40">powered by Aziz Erkan Yolcu</p>
        </div>
      </div>
    </>
  );

  // ============ MOBİL GÖRÜNÜM ============
  if (isMobile) {
    return (
      <>
        {/* Mobil Header - iOS safe area top */}
        <header 
          className="fixed top-0 left-0 right-0 bg-white border-b border-[#E5E5E5] flex items-center justify-between px-3 z-40"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(48px + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#8FAF9A] rounded-md flex items-center justify-center">
              <span className="text-[#2F2F2F] text-[10px] font-bold">GYS</span>
            </div>
            <span className="font-medium text-[#2F2F2F] text-sm">GYS Studio</span>
          </div>
          <div className="flex items-center gap-1">
            <BildirimPaneli userEmail={user?.email} />
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="w-9 h-9 flex items-center justify-center text-[#8A8A8A] hover:bg-[#F7F7F7] rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </header>

        {/* Mobil Drawer Overlay */}
        {isMobileOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 transition-opacity" onClick={() => setIsMobileOpen(false)} />
        )}

        {/* Mobil Drawer - iOS safe area top */}
        <div 
          className={`fixed top-0 left-0 h-full w-64 bg-[#fef7f0] z-50 transform transition-transform duration-300 ease-out flex flex-col ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <button 
            onClick={() => setIsMobileOpen(false)}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-[#8A8A8A] hover:text-[#2F2F2F] hover:bg-[#F7F7F7] rounded-full transition z-10"
            style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
          >
            ✕
          </button>
          <MenuContent />
        </div>

        {/* Bottom Navigation - iOS safe area bottom */}
        <nav 
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E5E5] flex items-center justify-around z-40 px-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
        >
          {bottomNavItems.map((item, index) => (
            item.action === "menu" ? (
              <button key={index} onClick={() => setIsMobileOpen(true)}
                className="flex flex-col items-center justify-center w-14 h-12 rounded-lg text-[#8A8A8A]"
              >
                <span className="text-xl mb-0.5">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </button>
            ) : (
              <Link key={index} to={item.path!}
                className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all ${
                  isActive(item.path!) ? "text-rose-500 bg-rose-50" : "text-[#8A8A8A]"
                }`}
              >
                <span className="text-xl mb-0.5">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </Link>
            )
          ))}
        </nav>

        {/* Top spacer - iOS safe area aware */}
        <div style={{ height: 'calc(48px + env(safe-area-inset-top, 0px))' }} />
      </>
    );
  }

  // ============ DESKTOP GÖRÜNÜM ============
  return (
    <div className="fixed left-0 top-0 h-full w-56 bg-[#fef7f0] border-r border-[#E5E5E5] flex flex-col z-40">
      <MenuContent />
    </div>
  );
}

export default function Sidebar({ user }: SidebarProps) {
  return (
    <Suspense fallback={
      <div className="fixed left-0 top-0 h-full w-56 bg-[#fef7f0] border-r border-[#E5E5E5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#8FAF9A]"></div>
      </div>
    }>
      <SidebarContent user={user} />
    </Suspense>
  );
}
