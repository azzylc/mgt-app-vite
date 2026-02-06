import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { RoleProvider } from './context/RoleProvider'
import AuthLayout from './layouts/AuthLayout'

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
                <Route path="/takvim" element={<Takvim />} />
                <Route path="/personel" element={<Personel />} />
                <Route path="/gorevler" element={<Gorevler />} />
                <Route path="/ayarlar" element={<Ayarlar />} />
                <Route path="/duyurular" element={<Duyurular />} />
                <Route path="/vardiya" element={<Vardiya />} />
                <Route path="/qr-giris" element={<QRGiris />} />
                <Route path="/calisma-saatleri" element={<CalismaSaatleri />} />
                
                {/* İzinler routes */}
                <Route path="/izinler" element={<Izinler />} />
                <Route path="/izinler/ekle" element={<IzinlerEkle />} />
                <Route path="/izinler/talepler" element={<IzinlerTalepler />} />
                <Route path="/izinler/haklar" element={<IzinlerHaklar />} />
                <Route path="/izinler/hakki-ekle" element={<IzinlerHakkiEkle />} />
                <Route path="/izinler/hakki-duzenle" element={<IzinlerHakkiDuzenle />} />
                <Route path="/izinler/degisiklikler" element={<IzinlerDegisiklikler />} />
                <Route path="/izinler/toplamlar" element={<IzinlerToplamlar />} />
                <Route path="/izinler/:id/duzenle" element={<IzinlerDuzenle />} />
                
                {/* Giriş-Çıkış routes */}
                <Route path="/giris-cikis" element={<GirisCikis />} />
                <Route path="/giris-cikis/puantaj" element={<GirisCikisPuantaj />} />
                <Route path="/giris-cikis/islem-ekle" element={<GirisCikisIslemEkle />} />
                <Route path="/giris-cikis/islem-listesi" element={<GirisCikisIslemListesi />} />
                <Route path="/giris-cikis/toplu-islem-ekle" element={<GirisCikisTopluIslemEkle />} />
                <Route path="/giris-cikis/vardiya-plani" element={<GirisCikisVardiyaPlani />} />
                <Route path="/giris-cikis/degisiklik-kayitlari" element={<GirisCikisDegisiklikKayitlari />} />
                
                {/* Raporlar routes */}
                <Route path="/raporlar" element={<Raporlar />} />
                <Route path="/raporlar/gunluk-calisma-sureleri" element={<RaporlarGunlukCalismaSureleri />} />
                <Route path="/raporlar/haftalik-calisma-sureleri" element={<RaporlarHaftalikCalismaSureleri />} />
                <Route path="/raporlar/gec-kalanlar" element={<RaporlarGecKalanlar />} />
                <Route path="/raporlar/gelmeyenler" element={<RaporlarGelmeyenler />} />
                <Route path="/raporlar/giris-cikis-kayitlari" element={<RaporlarGirisCikisKayitlari />} />
                
                {/* Yönetim routes */}
                <Route path="/yonetim" element={<Yonetim />} />
                <Route path="/yonetim/compare" element={<YonetimCompare />} />
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
