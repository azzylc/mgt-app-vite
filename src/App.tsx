import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RoleProvider } from './context/RoleProvider'
import AuthLayout from './layouts/AuthLayout'
import Login from './pages/Login'
import Home from './pages/Home'

// Ana sayfalar
import Takvim from './pages/Takvim'
import Personel from './pages/Personel'
import Gorevler from './pages/Gorevler'
import Ayarlar from './pages/Ayarlar'
import Duyurular from './pages/Duyurular'
import Vardiya from './pages/Vardiya'
import QRGiris from './pages/QRGiris'
import CalismaSaatleri from './pages/CalismaSaatleri'

// İzinler
import Izinler from './pages/Izinler'
import IzinlerEkle from './pages/izinler/Ekle'
import IzinlerDuzenle from './pages/izinler/Duzenle'
import IzinlerTalepler from './pages/izinler/Talepler'
import IzinlerHaklar from './pages/izinler/Haklar'
import IzinlerHakkiEkle from './pages/izinler/HakkiEkle'
import IzinlerHakkiDuzenle from './pages/izinler/HakkiDuzenle'
import IzinlerDegisiklikler from './pages/izinler/Degisiklikler'
import IzinlerToplamlar from './pages/izinler/Toplamlar'

// Giriş-Çıkış
import GirisCikis from './pages/GirisCikis'
import GirisCikisPuantaj from './pages/giris-cikis/Puantaj'
import GirisCikisIslemEkle from './pages/giris-cikis/IslemEkle'
import GirisCikisIslemListesi from './pages/giris-cikis/IslemListesi'
import GirisCikisTopluIslemEkle from './pages/giris-cikis/TopluIslemEkle'
import GirisCikisVardiyaPlani from './pages/giris-cikis/VardiyaPlani'
import GirisCikisDegisiklikKayitlari from './pages/giris-cikis/DegisiklikKayitlari'

// Raporlar
import Raporlar from './pages/Raporlar'
import RaporlarGunlukCalismaSureleri from './pages/raporlar/GunlukCalismaSureleri'
import RaporlarHaftalikCalismaSureleri from './pages/raporlar/HaftalikCalismaSureleri'
import RaporlarGecKalanlar from './pages/raporlar/GecKalanlar'
import RaporlarGelmeyenler from './pages/raporlar/Gelmeyenler'
import RaporlarGirisCikisKayitlari from './pages/raporlar/GirisCikisKayitlari'

// Yönetim
import Yonetim from './pages/Yonetim'
import YonetimCompare from './pages/yonetim/Compare'

export default function App() {
  return (
    <HashRouter>
      <RoleProvider>
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
            <Route path="/izinler/:id/duzenle" element={<IzinlerDuzenle />} /> {/* Parametreli route EN SONDA! */}
            
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
      </RoleProvider>
    </HashRouter>
  )
}
