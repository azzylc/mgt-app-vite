import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { RoleProvider } from './context/RoleProvider'
import AuthLayout from './layouts/AuthLayout'
import RouteGuard from './components/RouteGuard'
import PageErrorBoundary from './components/PageErrorBoundary'
import PinGuard from './components/PinGuard'

// Login ve Home hemen yüklenir (ilk açılışta lazım)
import Login from './pages/Login'
import Home from './pages/Home'

// Chunk yükleme hatası olursa sayfayı yenile (deploy sonrası eski cache sorunu)
function lazyWithRetry(importFn: () => Promise<any>) {
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

// RouteGuard + PageErrorBoundary birleşik wrapper
function GuardedRoute({ permission, title, children }: { permission: string; title: string; children: React.ReactNode }) {
  return (
    <RouteGuard requiredPermission={permission}>
      <PageErrorBoundary fallbackTitle={title}>
        {children}
      </PageErrorBoundary>
    </RouteGuard>
  );
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
                <Route path="/" element={<PageErrorBoundary fallbackTitle="Ana Sayfa"><Home /></PageErrorBoundary>} />
                <Route path="/profilim" element={<Suspense fallback={<PageLoader />}><PageErrorBoundary fallbackTitle="Profilim"><Profilim /></PageErrorBoundary></Suspense>} />
                <Route path="/taleplerim" element={<Suspense fallback={<PageLoader />}><PageErrorBoundary fallbackTitle="Taleplerim"><Taleplerim /></PageErrorBoundary></Suspense>} />
                <Route path="/talepler-merkezi" element={<Suspense fallback={<PageLoader />}><PageErrorBoundary fallbackTitle="Talepler Merkezi"><TaleplerMerkezi /></PageErrorBoundary></Suspense>} />
                
                {/* Ana sayfalar */}
                <Route path="/takvim" element={<GuardedRoute permission="takvim" title="Takvim"><Takvim /></GuardedRoute>} />
                <Route path="/personel" element={<GuardedRoute permission="personel" title="Personel"><Personel /></GuardedRoute>} />
                <Route path="/gorevler" element={<GuardedRoute permission="gorevler" title="Görevler"><Gorevler /></GuardedRoute>} />
                <Route path="/ayarlar" element={<GuardedRoute permission="ayarlar" title="Ayarlar"><Ayarlar /></GuardedRoute>} />
                <Route path="/duyurular" element={<GuardedRoute permission="duyurular" title="Duyurular"><Duyurular /></GuardedRoute>} />
                <Route path="/notlar" element={<GuardedRoute permission="notlar" title="Notlar"><Notlar /></GuardedRoute>} />
                <Route path="/vardiya" element={<GuardedRoute permission="personel" title="Vardiya"><Vardiya /></GuardedRoute>} />
                <Route path="/qr-giris" element={<GuardedRoute permission="qr-giris" title="QR Giriş"><QRGiris /></GuardedRoute>} />
                <Route path="/calisma-saatleri" element={<GuardedRoute permission="personel" title="Çalışma Saatleri"><CalismaSaatleri /></GuardedRoute>} />
                
                {/* İzinler routes */}
                <Route path="/izinler" element={<GuardedRoute permission="izinler" title="İzinler"><Izinler /></GuardedRoute>} />
                <Route path="/izinler/ekle" element={<GuardedRoute permission="izinler" title="İzin Ekle"><IzinlerEkle /></GuardedRoute>} />
                <Route path="/izinler/talepler" element={<GuardedRoute permission="izinler" title="İzin Talepleri"><IzinlerTalepler /></GuardedRoute>} />
                <Route path="/izinler/haklar" element={<GuardedRoute permission="izinler" title="İzin Hakları"><IzinlerHaklar /></GuardedRoute>} />
                <Route path="/izinler/hakki-ekle" element={<GuardedRoute permission="izinler" title="İzin Hakkı Ekle"><IzinlerHakkiEkle /></GuardedRoute>} />
                <Route path="/izinler/hakki-duzenle" element={<GuardedRoute permission="izinler" title="İzin Hakkı Düzenle"><IzinlerHakkiDuzenle /></GuardedRoute>} />
                <Route path="/izinler/degisiklikler" element={<GuardedRoute permission="izinler" title="İzin Değişiklikleri"><IzinlerDegisiklikler /></GuardedRoute>} />
                <Route path="/izinler/toplamlar" element={<GuardedRoute permission="izinler" title="İzin Toplamları"><IzinlerToplamlar /></GuardedRoute>} />
                <Route path="/izinler/:id/duzenle" element={<GuardedRoute permission="izinler" title="İzin Düzenle"><IzinlerDuzenle /></GuardedRoute>} />
                
                {/* Giriş-Çıkış routes */}
                <Route path="/giris-cikis" element={<GuardedRoute permission="giris-cikis-islemleri" title="Giriş Çıkış"><GirisCikis /></GuardedRoute>} />
                <Route path="/giris-cikis/puantaj" element={<GuardedRoute permission="giris-cikis-islemleri" title="Puantaj"><GirisCikisPuantaj /></GuardedRoute>} />
                <Route path="/giris-cikis/islem-ekle" element={<GuardedRoute permission="giris-cikis-islemleri" title="İşlem Ekle"><GirisCikisIslemEkle /></GuardedRoute>} />
                <Route path="/giris-cikis/islem-listesi" element={<GuardedRoute permission="giris-cikis-islemleri" title="İşlem Listesi"><GirisCikisIslemListesi /></GuardedRoute>} />
                <Route path="/giris-cikis/toplu-islem-ekle" element={<GuardedRoute permission="giris-cikis-islemleri" title="Toplu İşlem"><GirisCikisTopluIslemEkle /></GuardedRoute>} />
                <Route path="/giris-cikis/vardiya-plani" element={<GuardedRoute permission="giris-cikis-islemleri" title="Vardiya Planı"><GirisCikisVardiyaPlani /></GuardedRoute>} />
                <Route path="/giris-cikis/degisiklik-kayitlari" element={<GuardedRoute permission="giris-cikis-islemleri" title="Değişiklik Kayıtları"><GirisCikisDegisiklikKayitlari /></GuardedRoute>} />
                
                {/* Raporlar routes */}
                <Route path="/raporlar" element={<GuardedRoute permission="raporlar" title="Raporlar"><Raporlar /></GuardedRoute>} />
                <Route path="/raporlar/haftalik-calisma-sureleri" element={<GuardedRoute permission="raporlar" title="Haftalık Çalışma"><RaporlarHaftalikCalismaSureleri /></GuardedRoute>} />
                <Route path="/raporlar/gec-kalanlar" element={<GuardedRoute permission="raporlar" title="Geç Kalanlar"><RaporlarGecKalanlar /></GuardedRoute>} />
                <Route path="/raporlar/gelmeyenler" element={<GuardedRoute permission="raporlar" title="Gelmeyenler"><RaporlarGelmeyenler /></GuardedRoute>} />
                <Route path="/raporlar/giris-cikis-kayitlari" element={<GuardedRoute permission="raporlar" title="Giriş Çıkış Kayıtları"><RaporlarGirisCikisKayitlari /></GuardedRoute>} />
                
                {/* Yönetim routes */}
                <Route path="/yonetim" element={<GuardedRoute permission="yonetim-paneli" title="Yönetim"><PinGuard><Yonetim /></PinGuard></GuardedRoute>} />
                <Route path="/yonetim/compare" element={<GuardedRoute permission="yonetim-paneli" title="Karşılaştır"><PinGuard><YonetimCompare /></PinGuard></GuardedRoute>} />
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
