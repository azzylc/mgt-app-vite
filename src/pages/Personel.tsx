import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { auth, db, functions } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useSearchParams } from "react-router-dom";
import Cropper from "react-easy-crop";
import { useGrupEtiketleri } from "../hooks/useGrupEtiketleri";
import { getRenkStilleri } from "../lib/grupEtiketleri";
import { 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  serverTimestamp,
  where,
  getDocs
} from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";

interface Personel {
  id: string;
  sicilNo: string;
  ad: string;
  soyad: string;
  kisaltma?: string; // YENİ: Makyaj/Türban kısaltması (Optional - eski personellerde yok)
  email: string;
  telefon: string;
  foto: string;
  dogumGunu?: string; // YYYY-MM-DD formatında
  firmalar?: string[]; // Çalıştığı firma ID'leri (çoklu)
  yonettigiFirmalar?: string[]; // Yönetici ise hangi firmaları yönetiyor
  calismaSaati: string;
  iseBaslama: string;
  istenAyrilma: string;
  kullaniciTuru: string;
  yoneticiId?: string; // YENİ: Yöneticinin ID'si
  grup: string; // Grup etiketi (kurucu, yönetici, vb.)
  grupEtiketleri: string[];
  yetkiliGruplar: string[];
  aktif: boolean;
  boundDeviceId?: string;
  boundDeviceInfo?: {
    model: string;
    platform: string;
    osVersion: string;
    boundAt: string;
  };
  ayarlar: {
    otoCikis: boolean;
    qrKamerali: boolean;
    konumSecim: boolean;
    qrCihazModu: boolean;
    girisHatirlatici: boolean;
    mazeretEkran: boolean;
    konumDisi: boolean;
  };
}

interface Firma {
  id: string;
  firmaAdi: string;
  kisaltma: string;
  renk: string;
  aktif: boolean;
}

export default function PersonelPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    }>
      <PersonelPageContent />
    </Suspense>
  );
}

function PersonelPageContent() {
  const user = useAuth();
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [isKurucu, setIsKurucu] = useState(false); // Giriş yapan kullanıcı kurucu mu?
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [editingPersonel, setEditingPersonel] = useState<Personel | null>(null);
  const [selectedPersonel, setSelectedPersonel] = useState<Personel | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [fotoPreview, setFotoPreview] = useState("");
  const [searchParams] = useSearchParams();
  const grupFilter = searchParams.get("grup") || "";
  const ayrilanlarFilter = searchParams.get("ayrilanlar") === "true";

  // Grup etiketlerini Firebase'den çek
  const { grupEtiketleri, loading: grupLoading } = useGrupEtiketleri();
  
  // Firmalar state
  const [firmalar, setFirmalar] = useState<Firma[]>([]);
  const [yonettigiFirmalar, setYonettigiFirmalar] = useState<string[]>([]); // Yönetici için hangi firmaları yönetiyor
  
  const calismaSaatleri = ["serbest", "her gün 9:00-18:00", "hafta içi 9:00-18:00", "hafta sonu 10:00-17:00"];
  const kullaniciTurleri = ["Kurucu", "Yönetici", "Yetkili", "Personel"];
  const ayarlarLabels = {
    otoCikis: "Oto. Çıkış",
    qrKamerali: "QR Kameralı İşlem İzni",
    konumSecim: "Konum Seçerek İşlem İzni",
    qrCihazModu: "Kişisel QR Kod ile İşlem İzni (QR Okuyucu)",
    girisHatirlatici: "Giriş - Çıkış Hatırlatıcı Bildirim Gönderme",
    mazeretEkran: "Mazeret Ekranı Pasif",
    konumDisi: "Konum Dışı Okutma"
  };

  const tabs = [
    { id: 0, label: "👤 Kullanıcı Bilgileri" },
    { id: 1, label: "⚙️ Uygulama Ayarları" },
    { id: 2, label: "🏷️ Grup Etiketleri" },
    { id: 3, label: "🔑 Kullanıcı Türü ve Yetkileri" }
  ];

  const [formData, setFormData] = useState<Personel>({
    id: "",
    sicilNo: "",
    ad: "",
    soyad: "",
    kisaltma: "", // YENİ: Kısaltma
    email: "",
    telefon: "",
    foto: "",
    dogumGunu: "", // Doğum günü
    firmalar: [], // Çalıştığı firmalar (çoklu)
    yonettigiFirmalar: [], // Yönetici için
    calismaSaati: "serbest",
    iseBaslama: "",
    istenAyrilma: "",
    kullaniciTuru: "Personel",
    yoneticiId: "", // YENİ: Yönetici ID
    grup: "", // Grup etiketi
    grupEtiketleri: [],
    yetkiliGruplar: [],
    aktif: true,
    ayarlar: {
      otoCikis: false,
      qrKamerali: false,
      konumSecim: false,
      qrCihazModu: false,
      girisHatirlatici: false,
      mazeretEkran: false,
      konumDisi: false,
    }
  });
  const [apiLoading, setApiLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        kisaltma: "", // Default değer - eski personellerde yoksa boş string
        ...doc.data()
      } as Personel));
      setPersoneller(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Giriş yapan kullanıcının Kurucu olup olmadığını kontrol et
  useEffect(() => {
    if (!user || !personeller.length) return;
    const currentEmail = user.email || "";
    const currentUser = personeller.find(p => p.email === currentEmail);
    setIsKurucu(currentUser?.kullaniciTuru === "Kurucu");
  }, [user, personeller]);

  // Firmaları çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "companies"), orderBy("firmaAdi", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Firma));
      setFirmalar(data);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) {
        setShowModal(false);
        setEditingPersonel(null);
        resetForm();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showModal]);

  const handleAddEdit = async (action: 'close' | 'new') => {
    if (!formData.ad || !formData.soyad || !formData.sicilNo || !formData.telefon) {
      alert("Lütfen zorunlu alanları doldurun (Ad, Soyad, Sicil No, Telefon)!");
      return;
    }

    if (formData.sicilNo.length !== 11) {
      alert("Sicil No tam 11 karakter olmalıdır!");
      return;
    }

    if (formData.telefon.length !== 10) {
      alert("Telefon numarası tam 10 karakter olmalıdır!");
      return;
    }

    // Yeni personel için email ve firma zorunlu
    if (!editingPersonel) {
      if (!formData.email) {
        alert("Yeni personel için email adresi zorunludur!");
        return;
      }
    }

    if (!formData.firmalar || formData.firmalar.length === 0) {
      alert("Lütfen en az bir firma seçin!");
      return;
    }

    setApiLoading(true);

    try {
      // Yönetici için yonettigiFirmalar'ı formData'ya ekle
      const dataToSave = {
        ...formData,
        yonettigiFirmalar: formData.kullaniciTuru === "Yönetici" ? yonettigiFirmalar : []
      };

      if (editingPersonel) {
        // GÜNCELLEME - onCall
        const { id, ...dataToUpdate } = dataToSave;
        
        const result = await httpsCallable(functions, 'personelUpdate')({
          id: editingPersonel.id,
          ...dataToUpdate
        });
        
        const data = result.data as any;
        if (!data.success) {
          throw new Error(data.error || 'Güncelleme başarısız');
        }
      } else {
        // YENİ PERSONEL - onCall (Firebase Auth + Firestore)
        const { id, ...dataToAdd } = dataToSave;
        
        const result = await httpsCallable(functions, 'personelCreate')(dataToAdd);
        const data = result.data as any;
        
        if (!data.success) {
          throw new Error(data.error || 'Personel oluşturulamadı');
        }

        alert(`✅ ${formData.ad} ${formData.soyad} başarıyla eklendi!\n\n"Yeni Şifre Gönder" butonuna basarak giriş bilgilerini email ile gönderin.`);
      }

      if (action === 'close') {
        setShowModal(false);
        setEditingPersonel(null);
        resetForm();
      } else if (action === 'new') {
        resetForm();
        setActiveTab(0);
      }
    } catch (error: any) {
      Sentry.captureException(error);
      alert(`İşlem başarısız: ${error.message}`);
    } finally {
      setApiLoading(false);
    }
  };

  const handleKoparTelefon = async (id: string) => {
    const personel = personeller.find(p => p.id === id);
    if (!personel) return;
    
    if (confirm(`${personel.ad} ${personel.soyad} için telefon bağı koparılsın mı?\n\nBu işlem sonrası personel yeni bir cihazla giriş yapabilir.`)) {
      try {
        const result = await httpsCallable(functions, 'personelActions')({
          action: 'unbind-device', personelId: id
        });
        const data = result.data as any;
        
        if (data.success) {
          alert('✅ ' + data.message);
        } else {
          alert('❌ Hata: ' + data.error);
        }
      } catch (error) {
        Sentry.captureException(error);
        alert('❌ İşlem başarısız!');
      }
    }
  };

  const handleYeniSifre = async (personel: Personel) => {
    if (!personel.email) {
      alert('❌ Bu personelin email adresi yok. Önce email ekleyin.');
      return;
    }

    if (confirm(`${personel.ad} ${personel.soyad} için yeni şifre oluşturulsun mu?\n\nEmail: ${personel.email}`)) {
      try {
        const result = await httpsCallable(functions, 'personelActions')({
          action: 'reset-password', personelId: personel.id
        });
        const data = result.data as any;
        
        if (data.success) {
          if (data.emailSent) {
            alert(`✅ Yeni şifre oluşturuldu ve email gönderildi!\n\nEmail: ${data.email}\nYeni Şifre: ${data.newPassword}`);
          } else {
            alert(`✅ Yeni şifre oluşturuldu!\n\nEmail: ${data.email}\nYeni Şifre: ${data.newPassword}\n\n⚠️ Email gönderilemedi, şifreyi manuel iletin!`);
          }
        } else {
          alert('❌ Hata: ' + data.error);
        }
      } catch (error) {
        Sentry.captureException(error);
        alert('❌ İşlem başarısız!');
      }
    }
  };

  const handleDevreDisi = async (personel: Personel) => {
    const mesaj = personel.aktif 
      ? `${personel.ad} ${personel.soyad} devre dışı bırakılsın mı?\n\n⚠️ Personel sisteme giriş yapamayacak.`
      : `${personel.ad} ${personel.soyad} tekrar aktif edilsin mi?\n\n✅ Personel sisteme giriş yapabilecek.`;
    
    if (confirm(mesaj)) {
      try {
        const result = await httpsCallable(functions, 'personelActions')({
          action: 'toggle-status', personelId: personel.id
        });
        const data = result.data as any;
        
        if (data.success) {
          alert('✅ ' + data.message);
        } else {
          alert('❌ Hata: ' + data.error);
        }
      } catch (error) {
        Sentry.captureException(error);
        alert('❌ İşlem başarısız!');
      }
    }
  };

  const handleGoruntule = (personel: Personel) => {
    setSelectedPersonel(personel);
    setShowDetailModal(true);
  };

  const openEditModal = (personel: Personel) => {
    setEditingPersonel(personel);
    
    // Eski personellerde firma (tekil) varsa firmalar'a çevir
    const updatedPersonel = { ...personel };
    if (!updatedPersonel.firmalar && (personel as any).firma) {
      updatedPersonel.firmalar = [(personel as any).firma];
    }
    
    setFormData(updatedPersonel);
    setFotoPreview(personel.foto);
    
    // Yöneticinin yönettiği firmaları set et
    setYonettigiFirmalar(personel.yonettigiFirmalar || []);
    
    setActiveTab(0);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      id: "",
      sicilNo: "",
      ad: "",
      soyad: "",
      kisaltma: "",
      email: "",
      telefon: "",
      foto: "",
      dogumGunu: "", // Doğum günü
      firmalar: [], // Çalıştığı firmalar (çoklu)
      yonettigiFirmalar: [], // Yönetici için
      calismaSaati: "serbest",
      iseBaslama: "",
      istenAyrilma: "",
      kullaniciTuru: "Personel",
      yoneticiId: "",
      grup: "",
      grupEtiketleri: [],
      yetkiliGruplar: [],
      aktif: true,
      ayarlar: {
        otoCikis: false,
        qrKamerali: false,
        konumSecim: false,
        qrCihazModu: false,
        girisHatirlatici: false,
        mazeretEkran: false,
        konumDisi: false,
      }
    });
    setFotoPreview("");
    setYonettigiFirmalar([]); // Yönettiği firmaları temizle
  };

  const toggleGrup = (grup: string) => {
    if (formData.grupEtiketleri.includes(grup)) {
      setFormData({ ...formData, grupEtiketleri: formData.grupEtiketleri.filter(g => g !== grup) });
    } else {
      setFormData({ ...formData, grupEtiketleri: [...formData.grupEtiketleri, grup] });
    }
  };

  const toggleYetkiliGrup = (grup: string) => {
    const yetkiliGruplar = formData.yetkiliGruplar || [];
    if (yetkiliGruplar.includes(grup)) {
      setFormData({ ...formData, yetkiliGruplar: yetkiliGruplar.filter(g => g !== grup) });
    } else {
      setFormData({ ...formData, yetkiliGruplar: [...yetkiliGruplar, grup] });
    }
  };

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Lütfen sadece fotoğraf dosyası seçin!");
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setCropImageSrc(reader.result as string);
      setShowCropModal(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 512;
    canvas.height = 512;

    if (ctx) {
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        512,
        512
      );
    }

    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handleCropSave = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;

    try {
      const croppedImage = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      setFotoPreview(croppedImage);
      setFormData({ ...formData, foto: croppedImage });
      setShowCropModal(false);
      setCropImageSrc("");
    } catch (e) {
      Sentry.captureException(e);
      alert("Fotoğraf kırpılırken hata oluştu!");
    }
  };

  const handleFotoDelete = () => {
    setFotoPreview("");
    setFormData({ ...formData, foto: "" });
  };

  // ✅ GRUP FİLTRESİ - grupEtiketleri dizisinde arama
  const filteredPersoneller = useMemo(() => personeller.filter(p => {
    const grupMatch = !grupFilter || (p.grupEtiketleri || []).some(g => g.toLowerCase() === grupFilter.toLowerCase());
    
    // Ayrılanlar sayfasında: sadece pasifler (aktif=false)
    // Diğer sayfalarda: sadece aktifler (aktif=true)
    const aktifMatch = ayrilanlarFilter ? !p.aktif : p.aktif;
    
    return grupMatch && aktifMatch;
  }).sort((a, b) => {
    if (ayrilanlarFilter) {
      if (!a.istenAyrilma) return 1;
      if (!b.istenAyrilma) return -1;
      return new Date(b.istenAyrilma).getTime() - new Date(a.istenAyrilma).getTime();
    }

    if (a.aktif && !b.aktif) return -1;
    if (!a.aktif && b.aktif) return 1;
    
    if (a.aktif && b.aktif) {
      if (!a.iseBaslama) return 1;
      if (!b.iseBaslama) return -1;
      return new Date(a.iseBaslama).getTime() - new Date(b.iseBaslama).getTime();
    }
    
    if (!a.aktif && !b.aktif) {
      if (!a.istenAyrilma) return 1;
      if (!b.istenAyrilma) return -1;
      return new Date(b.istenAyrilma).getTime() - new Date(a.istenAyrilma).getTime();
    }
    
    return 0;
  }), [personeller, grupFilter, ayrilanlarFilter]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div>
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-800">
                👥 Personel Yönetimi
                {ayrilanlarFilter && (
                  <span className="ml-3 text-base font-normal text-red-600">
                    → Ayrılanlar
                  </span>
                )}
                {!ayrilanlarFilter && grupFilter && (
                  <span className="ml-3 text-base font-normal text-rose-600">
                    → {grupFilter === "kurucu" ? "Kurucular" : grupFilter === "yönetici" ? "Yöneticiler" : grupFilter}
                  </span>
                )}
              </h1>
              <p className="text-sm text-stone-500">
                {ayrilanlarFilter 
                  ? "İşten ayrılan personel listesi (Pasif)" 
                  : grupFilter 
                    ? `${grupFilter === "kurucu" ? "Kurucular" : grupFilter === "yönetici" ? "Yöneticiler" : grupFilter} listesi görüntüleniyor` 
                    : "Tüm personel bilgilerini yönetin"
                }
              </p>
            </div>
            <button
              onClick={() => { setShowModal(true); setEditingPersonel(null); resetForm(); }}
              className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm"
            >
              ➕ Yeni Personel
            </button>
          </div>
        </header>

        <main className="p-6">
          {filteredPersoneller.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center text-stone-500 border border-stone-100">
              <span className="text-5xl mb-4 block">👥</span>
              <p className="text-lg font-medium">Personel bulunamadı</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-stone-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-stone-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Foto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Ad Soyad</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Kısaltma</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Firma(lar)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Sicil No</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Telefon</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Grup</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">Durum</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {filteredPersoneller.map(personel => (
                      <tr key={personel.id} className={`transition ${personel.aktif ? 'hover:bg-stone-50' : 'bg-red-50 hover:bg-red-100'}`}>
                        <td className="px-6 py-4">
                          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                            {personel.foto ? (
                              <img src={personel.foto} alt={personel.ad} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <span className="text-rose-600 font-semibold">
                                {personel.ad?.[0] || '?'}{personel.soyad?.[0] || '?'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-stone-900">{personel.ad} {personel.soyad}</div>
                          {personel.email && <div className="text-xs text-stone-500">{personel.email}</div>}
                        </td>
                        <td className="px-6 py-4">
                          {personel.kisaltma ? (
                            <span className="px-3 py-1 text-sm font-semibold bg-purple-100 text-purple-700 rounded-lg">
                              {personel.kisaltma}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {personel.firmalar && personel.firmalar.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {personel.firmalar.map(firmaId => {
                                const firma = firmalar.find(f => f.id === firmaId);
                                if (firma) {
                                  return (
                                    <span key={firmaId} className={`px-2 py-1 text-xs font-medium rounded bg-${firma.renk}-100 text-${firma.renk}-700`}>
                                      {firma.kisaltma}
                                    </span>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          ) : (
                            <span className="text-xs text-stone-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-stone-900">{personel.sicilNo}</td>
                        <td className="px-6 py-4 text-sm text-stone-600">{personel.telefon}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {personel.grupEtiketleri && personel.grupEtiketleri.length > 0 ? (
                              personel.grupEtiketleri.map(g => {
                                const grupData = grupEtiketleri.find(ge => ge.grupAdi === g);
                                const stiller = getRenkStilleri(grupData?.renk || 'gray');
                                return (
                                  <span key={g} className={`px-2 py-1 text-xs ${stiller.bg} text-white rounded-full`}>{g}</span>
                                );
                              })
                            ) : (
                              <span className="text-xs text-stone-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${personel.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {personel.aktif ? 'Aktif' : 'Pasif'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleKoparTelefon(personel.id)} 
                              className="w-8 h-8 hover:bg-red-50 text-red-600 rounded flex items-center justify-center text-lg transition"
                              title="Telefon Bağını Kopar"
                            >
                              🔗
                            </button>
                            <button 
                              onClick={() => handleYeniSifre(personel)} 
                              className="w-8 h-8 hover:bg-green-50 text-green-600 rounded flex items-center justify-center text-lg transition"
                              title="Yeni Şifre Gönder"
                            >
                              ✉️
                            </button>
                            <button 
                              onClick={() => handleDevreDisi(personel)} 
                              className="w-8 h-8 hover:bg-red-50 text-red-600 rounded flex items-center justify-center text-lg transition"
                              title="Devre Dışı Bırak"
                            >
                              🚫
                            </button>
                            <button 
                              onClick={() => handleGoruntule(personel)} 
                              className="w-8 h-8 hover:bg-blue-50 text-blue-600 rounded flex items-center justify-center text-lg transition"
                              title="Görüntüle"
                            >
                              🔍
                            </button>
                            <button 
                              onClick={() => openEditModal(personel)} 
                              className="w-8 h-8 hover:bg-yellow-50 text-yellow-600 rounded flex items-center justify-center text-lg transition"
                              title="Düzenle"
                            >
                              ✏️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Yeni/Düzenle Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between z-10">
              <h3 className="text-xl font-bold text-stone-800">{editingPersonel ? "✏️ Personel Düzenle" : "➕ Yeni Personel"}</h3>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-stone-400 hover:text-stone-600 text-2xl">×</button>
            </div>

            <div className="border-b">
              <div className="flex overflow-x-auto">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition ${
                      activeTab === tab.id
                        ? 'text-rose-600 border-b-2 border-rose-600'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {activeTab === 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-32 h-32 bg-stone-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-dashed border-stone-300">
                        {fotoPreview ? (
                          <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-stone-400 text-4xl">📷</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex gap-2 mb-3">
                        <label className="cursor-pointer px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition">
                          📸 Görsel ekle
                          <input type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
                        </label>
                        {fotoPreview && (
                          <button onClick={handleFotoDelete} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">
                            🗑️ Sil
                          </button>
                        )}
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs text-blue-700 font-medium mb-1">📋 Fotoğraf Kuralları:</p>
                        <ul className="text-xs text-blue-600 space-y-1">
                          <li>• Herhangi bir boyuttaki fotoğraf yüklenebilir</li>
                          <li>• Kare olmayan fotoğraflarda <strong>crop</strong> ekranı açılır</li>
                          <li>• İstediğiniz bölgeyi seçip kırpabilirsiniz</li>
                          <li>• Otomatik olarak 512x512'ye optimize edilir</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Sicil No * (11 karakter)</label>
                      <input 
                        type="text" 
                        value={formData.sicilNo} 
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '');
                          setFormData({ ...formData, sicilNo: value });
                        }} 
                        maxLength={11}
                        className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" 
                        placeholder="12345678901" 
                      />
                      <p className="text-xs text-stone-500 mt-1">{formData.sicilNo.length}/11 karakter</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Telefon * (10 karakter)</label>
                      <input 
                        type="text" 
                        value={formData.telefon} 
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '');
                          setFormData({ ...formData, telefon: value });
                        }} 
                        maxLength={10}
                        className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" 
                        placeholder="5551234567" 
                      />
                      <p className="text-xs text-stone-500 mt-1">{formData.telefon.length}/10 karakter</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Ad *</label>
                      <input type="text" value={formData.ad} onChange={(e) => setFormData({ ...formData, ad: e.target.value })} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="Betül" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Soyad *</label>
                      <input type="text" value={formData.soyad} onChange={(e) => setFormData({ ...formData, soyad: e.target.value })} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="Aktaş" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Kısaltma (Makyaj/Türban için)</label>
                      <input 
                        type="text" 
                        value={formData.kisaltma || ""} 
                        onChange={(e) => setFormData({ ...formData, kisaltma: e.target.value })} 
                        maxLength={10}
                        className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" 
                        placeholder="Sa, Kü, Rü..." 
                      />
                      <p className="text-xs text-stone-500 mt-1">Örnek: Sa, Kübra, Rümeysa</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        Email {!isKurucu && "(Sadece Kurucular Değiştirebilir)"} {!editingPersonel && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        type="email" 
                        value={formData.email} 
                        onChange={(e) => isKurucu && setFormData({ ...formData, email: e.target.value })} 
                        disabled={!isKurucu}
                        className={`w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 ${!isKurucu ? 'bg-stone-100 cursor-not-allowed' : ''}`} 
                        placeholder="email@example.com" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-stone-700 mb-2">Firma(lar) *</label>
                      <p className="text-xs text-stone-500 mb-3">Personelin çalıştığı firma(ları) seçin</p>
                      {firmalar.filter(f => f.aktif).length === 0 ? (
                        <p className="text-sm text-stone-500">
                          Henüz firma eklenmemiş. 
                          <a href="/ayarlar" className="text-rose-600 underline ml-1">Ayarlar → Firmalar</a>
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {firmalar.filter(f => f.aktif).map(firma => {
                            const isSelected = formData.firmalar?.includes(firma.id) || false;
                            return (
                              <button
                                key={firma.id}
                                type="button"
                                onClick={() => {
                                  const current = formData.firmalar || [];
                                  if (isSelected) {
                                    setFormData({ ...formData, firmalar: current.filter(id => id !== firma.id) });
                                  } else {
                                    setFormData({ ...formData, firmalar: [...current, firma.id] });
                                  }
                                }}
                                className={`px-4 py-2 rounded-lg border-2 transition font-medium text-sm flex items-center gap-2 ${
                                  isSelected 
                                    ? `bg-${firma.renk}-100 border-${firma.renk}-500 text-${firma.renk}-700` 
                                    : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300'
                                }`}
                              >
                                {isSelected && <span>✓</span>}
                                {firma.firmaAdi} ({firma.kisaltma})
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Çalışma Saati *</label>
                      <select value={formData.calismaSaati} onChange={(e) => setFormData({ ...formData, calismaSaati: e.target.value })} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white">
                        {calismaSaatleri.map(cs => <option key={cs} value={cs}>{cs}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">İşe Başlama</label>
                      <input type="date" min="2020-01-01" max="2099-12-31" value={formData.iseBaslama} onChange={(e) => setFormData({ ...formData, iseBaslama: e.target.value })} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">İşten Ayrılma</label>
                      <input type="date" min="2020-01-01" max="2099-12-31" value={formData.istenAyrilma} onChange={(e) => setFormData({ ...formData, istenAyrilma: e.target.value })} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">🎂 Doğum Günü</label>
                      <input type="date" min="1950-01-01" max="2099-12-31" value={formData.dogumGunu || ""} onChange={(e) => setFormData({ ...formData, dogumGunu: e.target.value })} className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={formData.aktif} 
                      onChange={(e) => setFormData({ ...formData, aktif: e.target.checked })} 
                      className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500" 
                    />
                    <label className="text-sm text-stone-700">↓ Aktif</label>
                  </div>
                </div>
              )}

              {activeTab === 1 && (
                <div className="space-y-4">
                  {Object.entries(ayarlarLabels).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3 p-3 hover:bg-stone-50 rounded-lg">
                      <input
                        type="checkbox"
                        checked={formData.ayarlar[key as keyof typeof formData.ayarlar]}
                        onChange={(e) => setFormData({
                          ...formData,
                          ayarlar: { ...formData.ayarlar, [key]: e.target.checked }
                        })}
                        className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500"
                      />
                      <label className="text-sm text-stone-700 flex-1">{label}</label>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 2 && (
                <div>
                  <p className="text-sm text-stone-600 mb-4">Dahil Olduğu Grup Etiketleri:</p>
                  {grupLoading ? (
                    <div className="flex items-center gap-2 text-stone-500">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-500"></div>
                      <span className="text-sm">Yükleniyor...</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {grupEtiketleri.map(grup => {
                        const stiller = getRenkStilleri(grup.renk);
                        const isSelected = formData.grupEtiketleri.includes(grup.grupAdi);
                        return (
                          <button
                            key={grup.id}
                            type="button"
                            onClick={() => toggleGrup(grup.grupAdi)}
                            className={`px-4 py-2 rounded-lg border-2 transition flex items-center gap-2 ${
                              isSelected
                                ? `${stiller.bg} text-white border-transparent font-semibold`
                                : 'border-stone-200 hover:border-stone-300 text-stone-700'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : stiller.bg}`}></span>
                            {grup.grupAdi}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 3 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Kullanıcı Türü *</label>
                    <select 
                      value={formData.kullaniciTuru} 
                      onChange={(e) => setFormData({ ...formData, kullaniciTuru: e.target.value })} 
                      className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                    >
                      {kullaniciTurleri.map(kt => <option key={kt} value={kt}>{kt}</option>)}
                    </select>
                    <p className="text-xs text-stone-500 mt-1">Personelin sistem içindeki rolü (Personel, Yönetici, Kurucu)</p>
                  </div>

                  {/* Yönetici için: Hangi Firmaların Yöneticisi */}
                  {formData.kullaniciTuru === "Yönetici" && (
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-3">
                        Hangi Firma(lar)ın Yöneticisi?
                      </label>
                      <p className="text-xs text-stone-500 mb-3">Bu yöneticinin sorumlu olduğu firmaları seçin</p>
                      <div className="border border-stone-200 rounded-lg p-3 bg-stone-50">
                        {firmalar.filter(f => f.aktif).length === 0 ? (
                          <p className="text-sm text-stone-500 text-center py-4">
                            Henüz firma eklenmemiş. 
                            <br />
                            <span className="text-rose-500">Ayarlar → Firmalar</span> bölümünden firma ekleyin.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {firmalar.filter(f => f.aktif).map(firma => (
                              <label
                                key={firma.id}
                                className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition"
                              >
                                <input
                                  type="checkbox"
                                  checked={yonettigiFirmalar.includes(firma.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setYonettigiFirmalar([...yonettigiFirmalar, firma.id]);
                                    } else {
                                      setYonettigiFirmalar(yonettigiFirmalar.filter(id => id !== firma.id));
                                    }
                                  }}
                                  className="w-4 h-4 text-rose-500 border-stone-300 rounded focus:ring-rose-500"
                                />
                                <span className={`w-3 h-3 rounded-full bg-${firma.renk}-500`}></span>
                                <span className="text-sm text-stone-700">
                                  {firma.firmaAdi} <span className="text-stone-400">({firma.kisaltma})</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t flex gap-3">
              <button 
                onClick={() => handleAddEdit('close')} 
                disabled={apiLoading}
                className={`flex-1 px-4 py-3 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition font-medium ${apiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {apiLoading ? '⏳ Kaydediliyor...' : '💾 Kaydet & Geri dön'}
              </button>
              {!editingPersonel && (
                <button 
                  onClick={() => handleAddEdit('new')} 
                  disabled={apiLoading}
                  className={`flex-1 px-4 py-3 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition font-medium ${apiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {apiLoading ? '⏳ Kaydediliyor...' : '➕ Kaydet & Yeni ekle'}
                </button>
              )}
              <button 
                onClick={() => { setShowModal(false); resetForm(); }} 
                disabled={apiLoading}
                className={`flex-1 px-4 py-3 bg-stone-500 text-white rounded-lg hover:bg-stone-600 transition font-medium ${apiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                ↩️ Geri dön
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detay Modal */}
      {showDetailModal && selectedPersonel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-stone-800">👤 Personel Detayları</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-stone-400 hover:text-stone-600 text-3xl">×</button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-lg">
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center">
                  {selectedPersonel.foto ? (
                    <img src={selectedPersonel.foto} alt={selectedPersonel.ad} className="w-20 h-20 rounded-full object-cover" />
                  ) : (
                    <span className="text-rose-600 font-bold text-2xl">
                      {selectedPersonel.ad?.[0] || '?'}{selectedPersonel.soyad?.[0] || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-bold text-stone-800">{selectedPersonel.ad} {selectedPersonel.soyad}</h4>
                  <p className="text-sm text-stone-500">{selectedPersonel.kullaniciTuru}</p>
                  <div className="flex gap-2 mt-2">
                    {selectedPersonel.grupEtiketleri && selectedPersonel.grupEtiketleri.length > 0 ? (
                      selectedPersonel.grupEtiketleri.map(g => {
                        const grupData = grupEtiketleri.find(ge => ge.grupAdi === g);
                        const stiller = getRenkStilleri(grupData?.renk || 'gray');
                        return (
                        <span key={g} className={`px-2 py-1 text-xs ${stiller.bg} text-white rounded-full`}>{g}</span>
                      );
                    })
                    ) : (
                      <span className="text-xs text-stone-400">Grup etiketi yok</span>
                    )}
                  </div>
                </div>
                <span className={`px-4 py-2 rounded-lg text-sm font-medium ${selectedPersonel.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {selectedPersonel.aktif ? '✅ Aktif' : '❌ Pasif'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600 mb-1">📱 Telefon</p>
                  <p className="font-semibold text-stone-800">{selectedPersonel.telefon}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-purple-600 mb-1">📧 Email</p>
                  <p className="font-semibold text-stone-800 text-sm">{selectedPersonel.email || 'Belirtilmemiş'}</p>
                </div>
              </div>

              {/* Yönetici Bilgisi */}
              {selectedPersonel.yoneticiId && (
                <div className="p-4 bg-rose-50 rounded-lg border border-rose-200">
                  <p className="text-sm text-rose-600 mb-2">👔 Yöneticisi</p>
                  <p className="font-semibold text-stone-800">
                    {(() => {
                      const yonetici = personeller.find(p => p.id === selectedPersonel.yoneticiId);
                      return yonetici ? `${yonetici.ad} ${yonetici.soyad}` : 'Yönetici bulunamadı';
                    })()}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-yellow-600 mb-1">🆔 Sicil No</p>
                  <p className="font-semibold text-stone-800">{selectedPersonel.sicilNo}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-purple-600 mb-1">✂️ Kısaltma</p>
                  <p className="font-semibold text-stone-800">{selectedPersonel.kisaltma || '-'}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600 mb-1">⏰ Çalışma</p>
                  <p className="font-semibold text-stone-800 text-sm">{selectedPersonel.calismaSaati}</p>
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-orange-600 mb-1">📅 İşe Başlama</p>
                <p className="font-semibold text-stone-800">{selectedPersonel.iseBaslama || 'Belirtilmemiş'}</p>
              </div>

              {selectedPersonel.dogumGunu && (
                <div className="p-4 bg-rose-50 rounded-lg">
                  <p className="text-sm text-rose-600 mb-1">🎂 Doğum Günü</p>
                  <p className="font-semibold text-stone-800">{new Date(selectedPersonel.dogumGunu).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</p>
                </div>
              )}

              {selectedPersonel.istenAyrilma && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-600 mb-1">📅 İşten Ayrılma</p>
                  <p className="font-semibold text-stone-800">{selectedPersonel.istenAyrilma}</p>
                </div>
              )}

              {/* Bağlı Cihaz */}
              <div className={`p-4 rounded-lg border ${selectedPersonel.boundDeviceId ? 'bg-indigo-50 border-indigo-200' : 'bg-stone-50 border-stone-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm mb-1 ${selectedPersonel.boundDeviceId ? 'text-indigo-600' : 'text-stone-500'}`}>📱 Bağlı Cihaz</p>
                    {selectedPersonel.boundDeviceId ? (
                      <>
                        <p className="font-semibold text-stone-800">
                          {selectedPersonel.boundDeviceInfo?.model || 'Cihaz bağlı'}
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          {selectedPersonel.boundDeviceInfo?.platform}
                          {selectedPersonel.boundDeviceInfo?.boundAt &&
                            ` • Bağlanma: ${new Date(selectedPersonel.boundDeviceInfo.boundAt).toLocaleDateString('tr-TR')}`
                          }
                        </p>
                      </>
                    ) : (
                      <p className="font-semibold text-stone-500">Henüz cihaz bağlanmamış</p>
                    )}
                  </div>
                  {selectedPersonel.boundDeviceId && (
                    <button
                      onClick={() => handleKoparTelefon(selectedPersonel.id)}
                      className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition"
                    >
                      🔗 Bağı Kopar
                    </button>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-stone-700 mb-3">⚙️ Uygulama Ayarları:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(ayarlarLabels).map(([key, label]) => (
                    <div key={key} className={`px-3 py-2 rounded-lg text-sm ${selectedPersonel.ayarlar[key as keyof typeof selectedPersonel.ayarlar] ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                      {selectedPersonel.ayarlar[key as keyof typeof selectedPersonel.ayarlar] ? '✅' : '⬜'} {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button onClick={() => setShowDetailModal(false)} className="w-full px-6 py-3 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition font-medium">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {showCropModal && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-xl font-bold text-stone-800">✂️ Fotoğraf Kırp</h3>
              <button 
                onClick={() => { setShowCropModal(false); setCropImageSrc(""); }} 
                className="text-stone-400 hover:text-stone-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              <div className="relative bg-stone-900 rounded-lg overflow-hidden" style={{ height: '500px' }}>
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  style={{
                    containerStyle: {
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#000'
                    }
                  }}
                />
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-2 block">🔍 Zoom: {zoom.toFixed(1)}x</label>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-700">
                    💡 <strong>İpucu:</strong> Fotoğrafı sürükleyerek konumlandırın, slider ile zoom yapın.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex gap-3">
              <button 
                onClick={() => { setShowCropModal(false); setCropImageSrc(""); }} 
                className="flex-1 px-6 py-3 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition font-medium"
              >
                İptal
              </button>
              <button 
                onClick={handleCropSave} 
                className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
              >
                ✅ Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}