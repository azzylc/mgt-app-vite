import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Capacitor } from '@capacitor/core'
import { RoleProvider } from './context/RoleProvider'
import AuthLayout from './layouts/AuthLayout'
import RouteGuard from './components/RouteGuard'

// Login ve Home hemen yüklenir (ilk açılışta lazım)
import Login from './pages/Login'
import Home from './pages/Home'

// Geri kalan her şey LAZY — sadece tıklanınca yüklenir
// Ana sayfalar
const Takvim = lazy(() => import('./pages/Takvim'))
const Personel = lazy(() => import('./pages/Personel'))
const Gorevler = lazy(() => import('./pages/Gorevler'))
const Ayarlar = lazy(() => import('./pages/Ayarlar'))
const Duyurular = lazy(() => import('./pages/Duyurular'))
const Vardiya = lazy(() => import('./pages/Vardiya'))
const QRGiris = lazy(() => import('./pages/QRGiris'))
const CalismaSaatleri = lazy(() => import('./pages/CalismaSaatleri'))

// İzinler
const Izinler = lazy(() => import('./pages/Izinler'))
const IzinlerEkle = lazy(() => import('./pages/izinler/Ekle'))
const IzinlerDuzenle = lazy(() => import('./pages/izinler/Duzenle'))
const IzinlerTalepler = lazy(() => import('./pages/izinler/Talepler'))
const IzinlerHaklar = lazy(() => import('./pages/izinler/Haklar'))
const IzinlerHakkiEkle = lazy(() => import('./pages/izinler/HakkiEkle'))
const IzinlerHakkiDuzenle = lazy(() => import('./pages/izinler/HakkiDuzenle'))
const IzinlerDegisiklikler = lazy(() => import('./pages/izinler/Degisiklikler'))
const IzinlerToplamlar = lazy(() => import('./pages/izinler/Toplamlar'))

// Giriş-Çıkış
const GirisCikis = lazy(() => import('./pages/GirisCikis'))
const GirisCikisPuantaj = lazy(() => import('./pages/giris-cikis/Puantaj'))
const GirisCikisIslemEkle = lazy(() => import('./pages/giris-cikis/IslemEkle'))
const GirisCikisIslemListesi = lazy(() => import('./pages/giris-cikis/IslemListesi'))
const GirisCikisTopluIslemEkle = lazy(() => import('./pages/giris-cikis/TopluIslemEkle'))
const GirisCikisVardiyaPlani = lazy(() => import('./pages/giris-cikis/VardiyaPlani'))
const GirisCikisDegisiklikKayitlari = lazy(() => import('./pages/giris-cikis/DegisiklikKayitlari'))

// Raporlar
const Raporlar = lazy(() => import('./pages/Raporlar'))
const RaporlarGunlukCalismaSureleri = lazy(() => import('./pages/raporlar/GunlukCalismaSureleri'))
const RaporlarHaftalikCalismaSureleri = lazy(() => import('./pages/raporlar/HaftalikCalismaSureleri'))
const RaporlarGecKalanlar = lazy(() => import('./pages/raporlar/GecKalanlar'))
const RaporlarGelmeyenler = lazy(() => import('./pages/raporlar/Gelmeyenler'))
const RaporlarGirisCikisKayitlari = lazy(() => import('./pages/raporlar/GirisCikisKayitlari'))

// Yönetim
const Yonetim = lazy(() => import('./pages/Yonetim'))
const YonetimCompare = lazy(() => import('./pages/yonetim/Compare'))

// Sayfa yüklenirken gösterilecek loading spinner
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400 mx-auto"></div>
        <p className="mt-3 text-stone-500 text-sm">Yükleniyor...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<div className="min-h-screen flex items-center justify-center bg-white"><div className="text-center"><p className="text-2xl mb-2">😵</p><p className="text-stone-600 font-medium">Bir hata oluştu</p><button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-rose-500 text-white rounded-lg text-sm">Yenile</button></div></div>}>
      <HashRouter>
        <RoleProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected routes */}
              <Route element={<AuthLayout />}>
                <Route path="/" element={<Home />} />
                
                {/* Ana sayfalar */}
                <Route path="/takvim" element={<RouteGuard requiredPermission="takvim"><Takvim /></RouteGuard>} />
                <Route path="/personel" element={<RouteGuard requiredPermission="personel"><Personel /></RouteGuard>} />
                <Route path="/gorevler" element={<RouteGuard requiredPermission="gorevler"><Gorevler /></RouteGuard>} />
                <Route path="/ayarlar" element={<RouteGuard requiredPermission="ayarlar"><Ayarlar /></RouteGuard>} />
                <Route path="/duyurular" element={<RouteGuard requiredPermission="duyurular"><Duyurular /></RouteGuard>} />
                <Route path="/vardiya" element={<RouteGuard requiredPermission="personel"><Vardiya /></RouteGuard>} />
                <Route path="/qr-giris" element={Capacitor.isNativePlatform() ? <RouteGuard requiredPermission="qr-giris"><QRGiris /></RouteGuard> : <Navigate to="/" replace />} />
                <Route path="/calisma-saatleri" element={<RouteGuard requiredPermission="personel"><CalismaSaatleri /></RouteGuard>} />
                
                {/* İzinler routes */}
                <Route path="/izinler" element={<RouteGuard requiredPermission="izinler"><Izinler /></RouteGuard>} />
                <Route path="/izinler/ekle" element={<RouteGuard requiredPermission="izinler"><IzinlerEkle /></RouteGuard>} />
                <Route path="/izinler/talepler" element={<RouteGuard requiredPermission="izinler"><IzinlerTalepler /></RouteGuard>} />
                <Route path="/izinler/haklar" element={<RouteGuard requiredPermission="izinler"><IzinlerHaklar /></RouteGuard>} />
                <Route path="/izinler/hakki-ekle" element={<RouteGuard requiredPermission="izinler"><IzinlerHakkiEkle /></RouteGuard>} />
                <Route path="/izinler/hakki-duzenle" element={<RouteGuard requiredPermission="izinler"><IzinlerHakkiDuzenle /></RouteGuard>} />
                <Route path="/izinler/degisiklikler" element={<RouteGuard requiredPermission="izinler"><IzinlerDegisiklikler /></RouteGuard>} />
                <Route path="/izinler/toplamlar" element={<RouteGuard requiredPermission="izinler"><IzinlerToplamlar /></RouteGuard>} />
                <Route path="/izinler/:id/duzenle" element={<RouteGuard requiredPermission="izinler"><IzinlerDuzenle /></RouteGuard>} />
                
                {/* Giriş-Çıkış routes */}
                <Route path="/giris-cikis" element={<RouteGuard requiredPermission="giris-cikis-islemleri"><GirisCikis /></RouteGuard>} />
                <Route path="/giris-cikis/puantaj" element={<RouteGuard requiredPermission="giris-cikis-islemleri"><GirisCikisPuantaj /></RouteGuard>} />
                <Route path="/giris-cikis/islem-ekle" element={<RouteGuard requiredPermission="giris-cikis-islemleri"><GirisCikisIslemEkle /></RouteGuard>} />
                <Route path="/giris-cikis/islem-listesi" element={<RouteGuard requiredPermission="giris-cikis-islemleri"><GirisCikisIslemListesi /></RouteGuard>} />
                <Route path="/giris-cikis/toplu-islem-ekle" element={<RouteGuard requiredPermission="giris-cikis-islemleri"><GirisCikisTopluIslemEkle /></RouteGuard>} />
                <Route path="/giris-cikis/vardiya-plani" element={<RouteGuard requiredPermission="giris-cikis-islemleri"><GirisCikisVardiyaPlani /></RouteGuard>} />
                <Route path="/giris-cikis/degisiklik-kayitlari" element={<RouteGuard requiredPermission="giris-cikis-islemleri"><GirisCikisDegisiklikKayitlari /></RouteGuard>} />
                
                {/* Raporlar routes */}
                <Route path="/raporlar" element={<RouteGuard requiredPermission="raporlar"><Raporlar /></RouteGuard>} />
                <Route path="/raporlar/gunluk-calisma-sureleri" element={<RouteGuard requiredPermission="raporlar"><RaporlarGunlukCalismaSureleri /></RouteGuard>} />
                <Route path="/raporlar/haftalik-calisma-sureleri" element={<RouteGuard requiredPermission="raporlar"><RaporlarHaftalikCalismaSureleri /></RouteGuard>} />
                <Route path="/raporlar/gec-kalanlar" element={<RouteGuard requiredPermission="raporlar"><RaporlarGecKalanlar /></RouteGuard>} />
                <Route path="/raporlar/gelmeyenler" element={<RouteGuard requiredPermission="raporlar"><RaporlarGelmeyenler /></RouteGuard>} />
                <Route path="/raporlar/giris-cikis-kayitlari" element={<RouteGuard requiredPermission="raporlar"><RaporlarGirisCikisKayitlari /></RouteGuard>} />
                
                {/* Yönetim routes */}
                <Route path="/yonetim" element={<RouteGuard requiredPermission="yonetim-paneli"><Yonetim /></RouteGuard>} />
                <Route path="/yonetim/compare" element={<RouteGuard requiredPermission="yonetim-paneli"><YonetimCompare /></RouteGuard>} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </RoleProvider>
      </HashRouter>
    </Sentry.ErrorBoundary>
  )
}
