import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { RoleProvider } from './context/RoleProvider'
import AuthLayout from './layouts/AuthLayout'
import RouteGuard from './components/RouteGuard'
import PinGuard from './components/PinGuard'

// Login ve Home hemen yüklenir (ilk açılışta lazım)
import Login from './pages/Login'
import Home from './pages/Home'

// Chunk yükleme hatası olursa sayfayı yenile (deploy sonrası eski cache sorunu)
function lazyWithRetry(importFn: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    importFn().catch(() => {
      const lastReload = sessionStorage.getItem('chunk_reload');
      const now = Date.now();
      if (lastReload && now - Number(lastReload) < 10000) {
        return Promise.reject(new Error('Sayfa yüklenemedi'));
      }
      sessionStorage.setItem('chunk_reload', String(now));
      window.location.reload();
      return new Promise(() => {});
    })
  );
}

// Geri kalan her şey LAZY — sadece tıklanınca yüklenir
// Ana sayfalar
const Takvim = lazyWithRetry(() => import('./pages/Takvim'))
const Personel = lazyWithRetry(() => import('./pages/Personel'))
const Gorevler = lazyWithRetry(() => import('./pages/Gorevler'))
const Ayarlar = lazyWithRetry(() => import('./pages/Ayarlar'))
const Duyurular = lazyWithRetry(() => import('./pages/Duyurular'))
const Notlar = lazyWithRetry(() => import('./pages/Notlar'))
const Vardiya = lazyWithRetry(() => import('./pages/Vardiya'))
const QRGiris = lazyWithRetry(() => import('./pages/QRGiris'))
const CalismaSaatleri = lazyWithRetry(() => import('./pages/CalismaSaatleri'))

// İzinler
const Izinler = lazyWithRetry(() => import('./pages/Izinler'))
const IzinlerEkle = lazyWithRetry(() => import('./pages/izinler/Ekle'))
const IzinlerDuzenle = lazyWithRetry(() => import('./pages/izinler/Duzenle'))
const IzinlerTalepler = lazyWithRetry(() => import('./pages/izinler/Talepler'))
const IzinlerHaklar = lazyWithRetry(() => import('./pages/izinler/Haklar'))
const IzinlerHakkiEkle = lazyWithRetry(() => import('./pages/izinler/HakkiEkle'))
const IzinlerHakkiDuzenle = lazyWithRetry(() => import('./pages/izinler/HakkiDuzenle'))
const IzinlerDegisiklikler = lazyWithRetry(() => import('./pages/izinler/Degisiklikler'))
const IzinlerToplamlar = lazyWithRetry(() => import('./pages/izinler/Toplamlar'))

// Giriş-Çıkış
const GirisCikis = lazyWithRetry(() => import('./pages/GirisCikis'))
const GirisCikisPuantaj = lazyWithRetry(() => import('./pages/giris-cikis/Puantaj'))
const GirisCikisIslemEkle = lazyWithRetry(() => import('./pages/giris-cikis/IslemEkle'))
const GirisCikisIslemListesi = lazyWithRetry(() => import('./pages/giris-cikis/IslemListesi'))
const GirisCikisTopluIslemEkle = lazyWithRetry(() => import('./pages/giris-cikis/TopluIslemEkle'))
const GirisCikisVardiyaPlani = lazyWithRetry(() => import('./pages/giris-cikis/VardiyaPlani'))
const GirisCikisDegisiklikKayitlari = lazyWithRetry(() => import('./pages/giris-cikis/DegisiklikKayitlari'))

// Raporlar
const Raporlar = lazyWithRetry(() => import('./pages/Raporlar'))

const RaporlarHaftalikCalismaSureleri = lazyWithRetry(() => import('./pages/raporlar/HaftalikCalismaSureleri'))
const RaporlarGecKalanlar = lazyWithRetry(() => import('./pages/raporlar/GecKalanlar'))
const RaporlarGelmeyenler = lazyWithRetry(() => import('./pages/raporlar/Gelmeyenler'))
const RaporlarGirisCikisKayitlari = lazyWithRetry(() => import('./pages/raporlar/GirisCikisKayitlari'))

// Yönetim
const Yonetim = lazyWithRetry(() => import('./pages/Yonetim'))
const YonetimCompare = lazyWithRetry(() => import('./pages/yonetim/Compare'))

// Profil & Talepler
const Profilim = lazyWithRetry(() => import('./pages/Profilim'))
const Taleplerim = lazyWithRetry(() => import('./pages/Taleplerim'))
const TaleplerMerkezi = lazyWithRetry(() => import('./pages/TaleplerMerkezi'))

// Sayfa yüklenirken gösterilecek loading spinner
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#8FAF9A] mx-auto"></div>
        <p className="mt-3 text-[#8A8A8A] text-sm">Yükleniyor...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<div className="min-h-screen flex items-center justify-center bg-white"><div className="text-center"><p className="text-2xl mb-2">😵</p><p className="text-[#2F2F2F] font-medium">Bir hata oluştu</p><button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-rose-500 text-white rounded-lg text-sm">Yenile</button></div></div>}>
      <HashRouter>
        <RoleProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected routes */}
              <Route element={<AuthLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/profilim" element={<Suspense fallback={<PageLoader />}><Profilim /></Suspense>} />
                <Route path="/taleplerim" element={<Suspense fallback={<PageLoader />}><Taleplerim /></Suspense>} />
                <Route path="/talepler-merkezi" element={<Suspense fallback={<PageLoader />}><TaleplerMerkezi /></Suspense>} />
                
                {/* Ana sayfalar */}
                <Route path="/takvim" element={<RouteGuard requiredPermission="takvim"><Takvim /></RouteGuard>} />
                <Route path="/personel" element={<RouteGuard requiredPermission="personel"><Personel /></RouteGuard>} />
                <Route path="/gorevler" element={<RouteGuard requiredPermission="gorevler"><Gorevler /></RouteGuard>} />
                <Route path="/ayarlar" element={<RouteGuard requiredPermission="ayarlar"><Ayarlar /></RouteGuard>} />
                <Route path="/duyurular" element={<RouteGuard requiredPermission="duyurular"><Duyurular /></RouteGuard>} />
                <Route path="/notlar" element={<RouteGuard requiredPermission="notlar"><Notlar /></RouteGuard>} />
                <Route path="/vardiya" element={<RouteGuard requiredPermission="personel"><Vardiya /></RouteGuard>} />
                <Route path="/qr-giris" element={<RouteGuard requiredPermission="qr-giris"><QRGiris /></RouteGuard>} />
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

                <Route path="/raporlar/haftalik-calisma-sureleri" element={<RouteGuard requiredPermission="raporlar"><RaporlarHaftalikCalismaSureleri /></RouteGuard>} />
                <Route path="/raporlar/gec-kalanlar" element={<RouteGuard requiredPermission="raporlar"><RaporlarGecKalanlar /></RouteGuard>} />
                <Route path="/raporlar/gelmeyenler" element={<RouteGuard requiredPermission="raporlar"><RaporlarGelmeyenler /></RouteGuard>} />
                <Route path="/raporlar/giris-cikis-kayitlari" element={<RouteGuard requiredPermission="raporlar"><RaporlarGirisCikisKayitlari /></RouteGuard>} />
                
                {/* Yönetim routes */}
                <Route path="/yonetim" element={<RouteGuard requiredPermission="yonetim-paneli"><PinGuard><Yonetim /></PinGuard></RouteGuard>} />
                <Route path="/yonetim/compare" element={<RouteGuard requiredPermission="yonetim-paneli"><PinGuard><YonetimCompare /></PinGuard></RouteGuard>} />
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
