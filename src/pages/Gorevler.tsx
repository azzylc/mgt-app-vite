import { useState, useEffect, useMemo } from "react";
import { db } from "../lib/firebase";
import GelinModal from "../components/GelinModal";
import GorevKart from "../components/gorevler/GorevKart";
import GorevEkleModal from "../components/gorevler/GorevEkleModal";
import GorevDetayModal from "../components/gorevler/GorevDetayModal";
import GorevAyarlarPanel from "../components/gorevler/GorevAyarlarPanel";
import {
  Gorev, Gelin, Personel, GorevAyarlari,
  compositeGorevId
} from "../components/gorevler/types";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
  getDocs,
  setDoc,
  getDoc,
  arrayUnion,
  writeBatch
} from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useRole } from "../context/RoleProvider";

// ============================================
// ANA SAYFA
// ============================================
export default function GorevlerPage() {
  const user = useAuth();
  const { personelData } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  // Rol ve firmalar context'ten (RoleProvider) — duplicate sorgu yok
  const userRole = personelData?.kullaniciTuru || "";
  const userFirmalar = personelData?.yonettigiFirmalar || [];

  // --- State ---
  const [gorevler, setGorevler] = useState<Gorev[]>([]);
  const [ortakGorevler, setOrtakGorevler] = useState<Gorev[]>([]);
  const [tumGorevler, setTumGorevler] = useState<Gorev[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [filtreliGorevler, setFiltreliGorevler] = useState<Gorev[]>([]);
  const [filtre, setFiltre] = useState<"hepsi" | "bekliyor" | "devam-ediyor" | "tamamlandi">("hepsi");
  const [siralama, setSiralama] = useState<"yenidenEskiye" | "eskidenYeniye">("yenidenEskiye");
  const [aktifSekme, setAktifSekme] = useState<"gorevlerim" | "verdigim" | "otomatik" | "tumgorevler">("gorevlerim");
  const [otomatikAltSekme, setOtomatikAltSekme] = useState<"hepsi" | "yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip">("hepsi");
  const [seciliPersoneller, setSeciliPersoneller] = useState<string[]>([]);
  const [showAyarlar, setShowAyarlar] = useState(false);
  const [senkronizeLoading, setSenkronizeLoading] = useState<string | null>(null);
  const [gorevAtamaYetkisi, setGorevAtamaYetkisi] = useState<string>("herkes");

  // Modal state
  const [showGorevEkle, setShowGorevEkle] = useState(false);
  const [yeniGorev, setYeniGorev] = useState({
    baslik: "",
    aciklama: "",
    atananlar: [] as string[],
    oncelik: "normal" as Gorev["oncelik"],
    sonTarih: "",
    ortakMi: false
  });
  const [gorevEkleLoading, setGorevEkleLoading] = useState(false);
  const [detayGorev, setDetayGorev] = useState<Gorev | null>(null);
  const [yorumLoading, setYorumLoading] = useState(false);
  const [tamamlaGorevId, setTamamlaGorevId] = useState<string | null>(null);
  const [tamamlaYorum, setTamamlaYorum] = useState("");
  const [yaptimLoading, setYaptimLoading] = useState<string | null>(null);

  // Gelin modal
  const [selectedGelinId, setSelectedGelinId] = useState<string | null>(null);
  const [selectedGelin, setSelectedGelin] = useState<Gelin | null>(null);
  const [gelinLoading, setGelinLoading] = useState(false);

  // Ayarlar
  const [gorevAyarlari, setGorevAyarlari] = useState<GorevAyarlari>({
    yorumIstesinMi: { aktif: false, baslangicTarihi: "" },
    paylasimIzni: { aktif: false, baslangicTarihi: "" },
    yorumIstendiMi: { aktif: false, baslangicTarihi: "" },
    odemeTakip: { aktif: false, baslangicTarihi: "" }
  });

  // ============================================
  // DATA FETCHING
  // ============================================

  // Görev ayarlarını çek
  useEffect(() => {
    if (!user) return;
    const fetchAyarlar = async () => {
      try {
        const ayarDoc = await getDoc(doc(db, "settings", "gorevAyarlari"));
        if (ayarDoc.exists()) {
          const data = ayarDoc.data();
          const guvenliAyar = (key: string) => ({
            aktif: data[key]?.aktif ?? false,
            baslangicTarihi: data[key]?.baslangicTarihi ?? ""
          });
          setGorevAyarlari({
            yorumIstesinMi: guvenliAyar("yorumIstesinMi"),
            paylasimIzni: guvenliAyar("paylasimIzni"),
            yorumIstendiMi: guvenliAyar("yorumIstendiMi"),
            odemeTakip: guvenliAyar("odemeTakip")
          });
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    };
    fetchAyarlar();
  }, [user]);

  // Görev atama yetkisi ayarını çek
  useEffect(() => {
    if (!user) return;
    const fetchGenelAyar = async () => {
      try {
        const genelDoc = await getDoc(doc(db, "settings", "general"));
        if (genelDoc.exists()) {
          setGorevAtamaYetkisi(genelDoc.data().gorevAtamaYetkisi || "herkes");
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    };
    fetchGenelAyar();
  }, [user]);

  // Personelleri dinle
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), where("aktif", "==", true), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || "",
        soyad: doc.data().soyad || "",
        email: doc.data().email || "",
        kullaniciTuru: doc.data().kullaniciTuru || "",
        firmalar: doc.data().firmalar || [],
        yonettigiFirmalar: doc.data().yonettigiFirmalar || []
      } as Personel));
      setPersoneller(data);
    }, (error) => {
      console.error("[Gorevler/personnel] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Gorevler", collection: "personnel" } });
    });
    return () => unsubscribe();
  }, [user]);

  // Kendi görevleri
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "gorevler"), where("atanan", "==", user.email), orderBy("olusturulmaTarihi", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGorevler(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gorev)));
    }, (error) => {
      console.error("[Gorevler/gorevlerim] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Gorevler", collection: "gorevler-user" } });
    });
    return () => unsubscribe();
  }, [user]);

  // Ortak görevleri dinle (atananlar array-contains)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "gorevler"), where("atananlar", "array-contains", user.email), orderBy("olusturulmaTarihi", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrtakGorevler(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gorev)));
    }, (error) => {
      console.error("[Gorevler/ortakGorevler] Firestore hatası:", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Kişisel + ortak görevleri birleştir (duplicate önle)
  const birlesikGorevler = useMemo(() => {
    const map = new Map<string, Gorev>();
    gorevler.forEach(g => map.set(g.id, g));
    ortakGorevler.forEach(g => map.set(g.id, g));
    return Array.from(map.values());
  }, [gorevler, ortakGorevler]);

  // URL'den gorevId okunursa detay modal'ı otomatik aç
  useEffect(() => {
    const gorevId = searchParams.get("gorevId");
    if (!gorevId) return;
    
    // URL'den param'ı hemen temizle
    setSearchParams({}, { replace: true });
    
    // Sayfa önce render olsun, sonra modal açılsın
    const timer = setTimeout(() => {
      getDoc(doc(db, "gorevler", gorevId)).then(snap => {
        if (snap.exists()) {
          setDetayGorev({ id: snap.id, ...snap.data() } as Gorev);
        }
      }).catch(() => {});
    }, 400);
    
    return () => clearTimeout(timer);
  }, [searchParams]);

  // Görev atama yetkisi var mı? (useEffect'ten önce tanımlanmalı)
  const gorevAtayabilir = useMemo(() => {
    if (gorevAtamaYetkisi === "herkes") return true;
    if (gorevAtamaYetkisi === "yonetici") return userRole === "Kurucu" || userRole === "Yönetici";
    if (gorevAtamaYetkisi === "firma") return userRole === "Kurucu" || userRole === "Yönetici";
    return true;
  }, [gorevAtamaYetkisi, userRole]);

  // Kurucu/Yönetici veya görev atayabilen: tüm görevler
  useEffect(() => {
    if (!user || !gorevAtayabilir) return;
    const q = query(collection(db, "gorevler"), orderBy("olusturulmaTarihi", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTumGorevler(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gorev)));
    }, (error) => {
      console.error("[Gorevler/tumGorevler] Firestore hatası:", error);
      Sentry.captureException(error, { tags: { module: "Gorevler", collection: "gorevler-all" } });
    });
    return () => unsubscribe();
  }, [user, gorevAtayabilir]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const ekipPersonelleri = useMemo(() => personeller.filter(p => {
    // "herkes" → tüm aktif personeli göster
    if (gorevAtamaYetkisi === "herkes") return true;
    // "yonetici" → Kurucu/Yönetici herkesi görsün
    if (gorevAtamaYetkisi === "yonetici") {
      if (userRole === "Kurucu") return true;
      if (userRole === "Yönetici") return true;
      return false;
    }
    // "firma" → Kurucu herkesi, Yönetici kendi firmasını görsün
    if (gorevAtamaYetkisi === "firma") {
      if (userRole === "Kurucu") return true;
      if (userRole === "Yönetici") {
        if (userFirmalar.length > 0) {
          return p.firmalar?.some(f => userFirmalar.includes(f));
        }
        return true;
      }
      return false;
    }
    return true;
  }), [personeller, userRole, userFirmalar, gorevAtamaYetkisi]);

  const personelGorevSayilari = useMemo(() => ekipPersonelleri.map(p => ({
    ...p,
    gorevSayisi: tumGorevler.filter(g => g.atanan === p.email).length
  })), [ekipPersonelleri, tumGorevler]);

  // Filtre
  useEffect(() => {
    let sonuc: Gorev[] = [];
    
    if (aktifSekme === "tumgorevler") {
      sonuc = [...tumGorevler];
      if (seciliPersoneller.length > 0) {
        sonuc = sonuc.filter(g => {
          if (g.ortakMi && g.atananlar) {
            return g.atananlar.some(a => seciliPersoneller.includes(a));
          }
          return seciliPersoneller.includes(g.atanan);
        });
      }
    } else if (aktifSekme === "verdigim") {
      sonuc = tumGorevler.filter(g => g.atayan === user?.email && !g.otomatikMi);
    } else if (aktifSekme === "otomatik") {
      sonuc = birlesikGorevler.filter(g => g.otomatikMi === true && (otomatikAltSekme === "hepsi" || g.gorevTuru === otomatikAltSekme));
    } else {
      sonuc = birlesikGorevler.filter(g => !g.otomatikMi);
    }
    
    if (filtre !== "hepsi") {
      sonuc = sonuc.filter(g => g.durum === filtre);
    }

    sonuc.sort((a, b) => {
      const tarihA = a.gelinBilgi?.tarih ? new Date(a.gelinBilgi.tarih).getTime() : 
                     (a.olusturulmaTarihi?.toDate?.()?.getTime() || 0);
      const tarihB = b.gelinBilgi?.tarih ? new Date(b.gelinBilgi.tarih).getTime() : 
                     (b.olusturulmaTarihi?.toDate?.()?.getTime() || 0);
      return siralama === "yenidenEskiye" ? tarihB - tarihA : tarihA - tarihB;
    });
    
    setFiltreliGorevler(sonuc);
  }, [birlesikGorevler, tumGorevler, filtre, aktifSekme, seciliPersoneller, otomatikAltSekme, siralama, user?.email]);

  // ============================================
  // HANDLERS
  // ============================================

  const fetchSingleGelin = async (gelinId: string) => {
    setGelinLoading(true);
    try {
      const gelinDoc = await getDoc(doc(db, "gelinler", gelinId));
      if (gelinDoc.exists()) {
        const data = gelinDoc.data();
        setSelectedGelin({
          id: gelinDoc.id,
          isim: data.isim || "", tarih: data.tarih || "", saat: data.saat || "",
          makyaj: data.makyaj || "", turban: data.turban || "",
          yorumIstesinMi: data.yorumIstesinMi || "",
          paylasimIzni: data.paylasimIzni || false,
          yorumIstendiMi: data.yorumIstendiMi || false,
          ucret: data.ucret || 0, kapora: data.kapora || 0, kalan: data.kalan || 0,
          telefon: data.telefon || "", esiTelefon: data.esiTelefon || "",
          instagram: data.instagram || "", fotografci: data.fotografci || "",
          modaevi: data.modaevi || "", kinaGunu: data.kinaGunu || "",
          not: data.not || "",
          bilgilendirmeGonderildiMi: data.bilgilendirmeGonderildiMi || false,
          anlasmaYazildiMi: data.anlasmaYazildiMi || false,
          malzemeGonderildiMi: data.malzemeGonderildiMi || false,
          yorumIstendiMi2: data.yorumIstendiMi2 || false,
          anlastigiTarih: data.anlastigiTarih || "",
          odemeTamamlandi: data.odemeTamamlandi || false,
        });
      }
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setGelinLoading(false);
    }
  };

  const handleTamamla = async (gorevId: string) => {
    if (!tamamlaYorum.trim()) {
      alert("Lütfen ne yaptığınızı yazın!");
      return;
    }
    try {
      const kpiPersonel = personeller.find(p => p.email === user?.email);
      const yorumEkleyen = kpiPersonel ? `${kpiPersonel.ad} ${kpiPersonel.soyad}` : user?.email || "";
      
      // Görevi bul (ortak mı kontrol et)
      const gorev = birlesikGorevler.find(g => g.id === gorevId) || tumGorevler.find(g => g.id === gorevId);
      
      if (gorev?.ortakMi && gorev.atananlar) {
        // ORTAK GÖREV — kişiyi tamamlayanlar'a ekle
        const yeniTamamlayanlar = [...(gorev.tamamlayanlar || [])];
        if (!yeniTamamlayanlar.includes(user?.email || "")) {
          yeniTamamlayanlar.push(user?.email || "");
        }
        
        const tumKisilerTamamladi = gorev.atananlar.every(email => yeniTamamlayanlar.includes(email));
        
        await updateDoc(doc(db, "gorevler", gorevId), {
          tamamlayanlar: arrayUnion(user?.email || ""),
          durum: tumKisilerTamamladi ? "tamamlandi" : "devam-ediyor",
          ...(tumKisilerTamamladi ? { tamamlanmaTarihi: serverTimestamp() } : {}),
          yorumlar: arrayUnion({
            yazan: user?.email || "",
            yazanAd: yorumEkleyen,
            yorum: `✅ ${yorumEkleyen} tamamladı: ${tamamlaYorum.trim()}`,
            tarih: new Date().toISOString()
          })
        });

        if (detayGorev?.id === gorevId) {
          setDetayGorev({ 
            ...detayGorev, 
            durum: tumKisilerTamamladi ? "tamamlandi" : "devam-ediyor",
            tamamlayanlar: yeniTamamlayanlar
          });
        }
      } else {
        // KİŞİSEL GÖREV — mevcut davranış
        await updateDoc(doc(db, "gorevler", gorevId), {
          durum: "tamamlandi",
          tamamlanmaTarihi: serverTimestamp(),
          yorumlar: arrayUnion({
            yazan: user?.email || "",
            yazanAd: yorumEkleyen,
            yorum: `✅ Tamamlandı: ${tamamlaYorum.trim()}`,
            tarih: new Date().toISOString()
          })
        });

        if (detayGorev?.id === gorevId) {
          setDetayGorev({ ...detayGorev, durum: "tamamlandi" });
        }
      }
      setTamamlaGorevId(null);
      setTamamlaYorum("");
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Görev tamamlanamadı!");
    }
  };

  const handleGorevSil = async (gorevId: string) => {
    if (!confirm("Bu görevi silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, "gorevler", gorevId));
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const handleGorevOlustur = async () => {
    if (!yeniGorev.baslik.trim()) { alert("Lütfen görev başlığı girin!"); return; }
    if (yeniGorev.atananlar.length === 0) { alert("Lütfen en az bir kişi seçin!"); return; }

    setGorevEkleLoading(true);
    try {
      const atayanPersonel = personeller.find(p => p.email === user?.email);
      const atayanAd = atayanPersonel ? `${atayanPersonel.ad} ${atayanPersonel.soyad}` : user?.email || "";

      if (yeniGorev.ortakMi && yeniGorev.atananlar.length > 1) {
        // ORTAK GÖREV — tek doküman
        const atananAdlar = yeniGorev.atananlar.map(email => {
          const p = personeller.find(per => per.email === email);
          return p ? `${p.ad} ${p.soyad}` : email;
        });

        const gorevRef = doc(collection(db, "gorevler"));
        await setDoc(gorevRef, {
          baslik: yeniGorev.baslik.trim(),
          aciklama: yeniGorev.aciklama.trim(),
          atayan: user?.email || "",
          atayanAd,
          atanan: "",
          atananAd: atananAdlar.join(", "),
          ortakMi: true,
          atananlar: yeniGorev.atananlar,
          atananAdlar: atananAdlar,
          tamamlayanlar: [],
          durum: "bekliyor",
          oncelik: yeniGorev.oncelik,
          sonTarih: yeniGorev.sonTarih || "",
          otomatikMi: false,
          yorumlar: [],
          olusturulmaTarihi: serverTimestamp()
        });

        alert(`👥 Ortak görev oluşturuldu (${yeniGorev.atananlar.length} kişi)!`);
      } else {
        // KİŞİSEL GÖREV — her kişiye ayrı doküman (mevcut davranış)
        const grupId = Date.now().toString();
        const batch = writeBatch(db);

        for (const atananEmail of yeniGorev.atananlar) {
          const atananPersonel = personeller.find(p => p.email === atananEmail);
          const gorevRef = doc(collection(db, "gorevler"));
          batch.set(gorevRef, {
            baslik: yeniGorev.baslik.trim(),
            aciklama: yeniGorev.aciklama.trim(),
            atayan: user?.email || "",
            atayanAd,
            atanan: atananEmail,
            atananAd: atananPersonel ? `${atananPersonel.ad} ${atananPersonel.soyad}` : atananEmail,
            durum: "bekliyor",
            oncelik: yeniGorev.oncelik,
            sonTarih: yeniGorev.sonTarih || "",
            otomatikMi: false,
            yorumlar: [],
            grupId: yeniGorev.atananlar.length > 1 ? grupId : "",
            olusturulmaTarihi: serverTimestamp()
          });
        }

        await batch.commit();
        alert(`✅ ${yeniGorev.atananlar.length} kişiye görev atandı!`);
      }

      setYeniGorev({ baslik: "", aciklama: "", atananlar: [], oncelik: "normal", sonTarih: "", ortakMi: false });
      setShowGorevEkle(false);
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Görev oluşturulamadı!");
    } finally {
      setGorevEkleLoading(false);
    }
  };

  const handleYorumEkle = async (yorumText: string) => {
    if (!detayGorev) return;
    setYorumLoading(true);
    try {
      const yazanPersonel = personeller.find(p => p.email === user?.email);
      const yorumData = {
        id: Date.now().toString(),
        yazan: user?.email || "",
        yazanAd: yazanPersonel ? `${yazanPersonel.ad} ${yazanPersonel.soyad}` : user?.email || "",
        yorum: yorumText,
        tarih: new Date().toISOString()
      };

      await updateDoc(doc(db, "gorevler", detayGorev.id), {
        yorumlar: arrayUnion(yorumData)
      });

      // Push bildirim artık Firestore trigger (onGorevUpdated) tarafından gönderiliyor

      setDetayGorev({
        ...detayGorev,
        yorumlar: [...(detayGorev.yorumlar || []), yorumData]
      });
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Yorum eklenemedi!");
    } finally {
      setYorumLoading(false);
    }
  };

  const handleGorevDuzenle = async (data: { baslik: string; aciklama: string; oncelik: Gorev["oncelik"]; sonTarih: string }) => {
    if (!detayGorev) return;
    try {
      await updateDoc(doc(db, "gorevler", detayGorev.id), {
        baslik: data.baslik.trim(),
        aciklama: data.aciklama.trim(),
        oncelik: data.oncelik,
        sonTarih: data.sonTarih || ""
      });
      setDetayGorev({
        ...detayGorev,
        baslik: data.baslik.trim(),
        aciklama: data.aciklama.trim(),
        oncelik: data.oncelik,
        sonTarih: data.sonTarih
      });
      alert("✅ Görev güncellendi!");
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Güncelleme başarısız!");
    }
  };

  const handleYaptim = async (gorev: Gorev) => {
    if (!gorev.gelinId || !gorev.gorevTuru) return;
    setYaptimLoading(gorev.id);
    try {
      const gelinDoc = await getDoc(doc(db, "gelinler", gorev.gelinId));
      if (!gelinDoc.exists()) { alert("❌ Gelin kaydı bulunamadı!"); return; }
      const gelin = gelinDoc.data();

      let alanDolu = false;
      let alanAdi = "";
      if (gorev.gorevTuru === "yorumIstesinMi") { alanDolu = !!gelin.yorumIstesinMi && gelin.yorumIstesinMi.trim() !== ""; alanAdi = "Yorum istensin mi"; }
      else if (gorev.gorevTuru === "paylasimIzni") { alanDolu = !!gelin.paylasimIzni; alanAdi = "Paylaşım izni"; }
      else if (gorev.gorevTuru === "yorumIstendiMi") { alanDolu = !!gelin.yorumIstendiMi; alanAdi = "Yorum istendi mi"; }
      else if (gorev.gorevTuru === "odemeTakip") { alanDolu = gelin.odemeTamamlandi === true; alanAdi = "Ödeme"; }

      if (alanDolu) {
        await deleteDoc(doc(db, "gorevler", gorev.id));
        alert(`✅ "${alanAdi}" alanı dolu, görev silindi!`);
      } else {
        alert(gorev.gorevTuru === "odemeTakip"
          ? `⚠️ Takvime henüz "--" eklenmemiş! Önce takvimde ödeme işaretini ekleyin.`
          : `⚠️ "${alanAdi}" alanı henüz doldurulmamış! Önce takvimden doldurun.`);
      }
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Kontrol sırasında hata oluştu!");
    } finally {
      setYaptimLoading(null);
    }
  };

  const handleTumunuSenkronizeEt = async () => {
    const tarihliler = [];
    if (gorevAyarlari?.yorumIstesinMi?.baslangicTarihi) tarihliler.push("Yorum İstensin Mi");
    if (gorevAyarlari?.paylasimIzni?.baslangicTarihi) tarihliler.push("Paylaşım İzni");
    if (gorevAyarlari?.yorumIstendiMi?.baslangicTarihi) tarihliler.push("Yorum İstendi Mi");
    if (gorevAyarlari?.odemeTakip?.baslangicTarihi) tarihliler.push("Ödeme Takip");

    if (tarihliler.length === 0) { alert("Lütfen en az bir görev türü için başlangıç tarihi girin!"); return; }
    if (!confirm(`⚠️ DİKKAT!\n\nTüm otomatik görevler silinecek ve seçilen tarihlerden bugüne kadarki gelinler için yeniden oluşturulacak.\n\nSenkronize edilecek türler:\n${tarihliler.map(t => "• " + t).join("\n")}\n\nDevam etmek istiyor musunuz?`)) return;

    setSenkronizeLoading("tumu");
    try {
      const bugun = new Date().toISOString().split("T")[0];
      const gorevlerRef = collection(db, "gorevler");
      let toplamSilinen = 0;
      let toplamOlusturulan = 0;

      const tumOtomatikQuery = query(gorevlerRef, where("otomatikMi", "==", true));
      const tumOtomatikSnapshot = await getDocs(tumOtomatikQuery);
      for (const gorevDoc of tumOtomatikSnapshot.docs) {
        await deleteDoc(doc(db, "gorevler", gorevDoc.id));
        toplamSilinen++;
      }

      const gorevTurleri: ("yorumIstesinMi" | "paylasimIzni" | "yorumIstendiMi" | "odemeTakip")[] = ["yorumIstesinMi", "paylasimIzni", "yorumIstendiMi", "odemeTakip"];
      const yeniAyarlar = { ...gorevAyarlari };

      for (const gorevTuru of gorevTurleri) {
        const ayar = gorevAyarlari?.[gorevTuru];
        if (!ayar?.baslangicTarihi) continue;

        const gelinlerQuery = query(
          collection(db, "gelinler"),
          where("tarih", ">=", ayar.baslangicTarihi),
          where("tarih", "<=", bugun),
          orderBy("tarih", "asc")
        );
        const gelinlerSnapshot = await getDocs(gelinlerQuery);
        const gelinlerData = gelinlerSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Gelin[];

        for (const gelin of gelinlerData) {
          let alanBos = false;
          if (gorevTuru === "yorumIstesinMi") alanBos = !gelin.yorumIstesinMi || gelin.yorumIstesinMi.trim() === "";
          else if (gorevTuru === "paylasimIzni") alanBos = !gelin.paylasimIzni;
          else if (gorevTuru === "yorumIstendiMi") alanBos = !gelin.yorumIstendiMi;
          else if (gorevTuru === "odemeTakip") alanBos = gelin.odemeTamamlandi !== true;
          if (!alanBos) continue;

          const gorevBasliklar: Record<string, string> = {
            yorumIstesinMi: "Yorum istensin mi alanını doldur",
            paylasimIzni: "Paylaşım izni alanını doldur",
            yorumIstendiMi: "Yorum istendi mi alanını doldur",
            odemeTakip: "Ödeme alınmadı!"
          };

          if (gorevTuru === "odemeTakip") {
            const yoneticiler = personeller.filter(p => p.kullaniciTuru === "Kurucu" || p.kullaniciTuru === "Yönetici");
            for (const yonetici of yoneticiler) {
              const cId = compositeGorevId(gelin.id, gorevTuru, yonetici.email);
              await setDoc(doc(db, "gorevler", cId), {
                baslik: `${gelin.isim} - ${gorevBasliklar[gorevTuru]}`,
                aciklama: `${gelin.isim} gelinin düğünü ${gelin.tarih} tarihinde gerçekleşti. Takvime "--" eklenmesi gerekiyor.`,
                atayan: "Aziz", atayanAd: "Aziz (Otomatik)",
                atanan: yonetici.email, atananAd: `${yonetici.ad} ${yonetici.soyad}`,
                durum: "bekliyor", oncelik: "acil",
                olusturulmaTarihi: serverTimestamp(),
                gelinId: gelin.id, otomatikMi: true, gorevTuru: "odemeTakip",
                gelinBilgi: { isim: gelin.isim, tarih: gelin.tarih, saat: gelin.saat }
              });
              toplamOlusturulan++;
            }
          } else {
            const makyajci = personeller.find(p =>
              p.ad.toLocaleLowerCase('tr-TR') === gelin.makyaj?.toLocaleLowerCase('tr-TR') ||
              `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR') === gelin.makyaj?.toLocaleLowerCase('tr-TR')
            );
            const turbanci = personeller.find(p =>
              p.ad.toLocaleLowerCase('tr-TR') === gelin.turban?.toLocaleLowerCase('tr-TR') ||
              `${p.ad} ${p.soyad}`.toLocaleLowerCase('tr-TR') === gelin.turban?.toLocaleLowerCase('tr-TR')
            );
            const ayniKisi = makyajci?.email === turbanci?.email;
            const kisiler: { email: string; ad: string; rol: string }[] = [];
            if (makyajci?.email) kisiler.push({ email: makyajci.email, ad: `${makyajci.ad} ${makyajci.soyad}`, rol: "Makyaj" });
            if (turbanci?.email && !ayniKisi) kisiler.push({ email: turbanci.email, ad: `${turbanci.ad} ${turbanci.soyad}`, rol: "Türban" });

            for (const kisi of kisiler) {
              const cId = compositeGorevId(gelin.id, gorevTuru, kisi.email);
              await setDoc(doc(db, "gorevler", cId), {
                baslik: `${gelin.isim} - ${gorevBasliklar[gorevTuru]}`,
                aciklama: `${gelin.isim} için "${gorevBasliklar[gorevTuru]}" alanı boş. Takvimden doldurun. (${kisi.rol})`,
                atayan: "Sistem", atayanAd: "Sistem (Otomatik)",
                atanan: kisi.email, atananAd: kisi.ad,
                durum: "bekliyor", oncelik: "yuksek",
                olusturulmaTarihi: serverTimestamp(),
                gelinId: gelin.id, otomatikMi: true, gorevTuru: gorevTuru,
                gelinBilgi: { isim: gelin.isim, tarih: gelin.tarih, saat: gelin.saat }
              });
              toplamOlusturulan++;
            }
          }
        }
        yeniAyarlar[gorevTuru] = { ...ayar, aktif: true };
      }

      await setDoc(doc(db, "settings", "gorevAyarlari"), yeniAyarlar);
      setGorevAyarlari(yeniAyarlar);
      alert(`✅ Senkronizasyon tamamlandı!\n\n• ${toplamSilinen} görev silindi\n• ${toplamOlusturulan} yeni görev oluşturuldu`);
    } catch (error) {
      Sentry.captureException(error);
      alert("❌ Senkronizasyon sırasında hata oluştu!");
    } finally {
      setSenkronizeLoading(null);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="min-h-screen bg-stone-50/50">
      <div className="flex-1">
        <header className="bg-white/80 backdrop-blur-sm sticky top-0 z-10 border-b border-stone-100">
          <div className="px-3 md:px-5 py-2 flex items-center justify-between">
            <h1 className="text-sm md:text-base font-bold text-stone-800">✅ Görevler</h1>
            <div className="flex items-center gap-2">
              {gorevAtayabilir && (
                <button onClick={() => setShowGorevEkle(true)} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition">
                  ➕ Görev Ata
                </button>
              )}
              {userRole === "Kurucu" && (
                <button
                  onClick={() => setShowAyarlar(!showAyarlar)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${showAyarlar ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                >
                  ⚙️ <span className="hidden md:inline">Görev </span>Ayarları
                </button>
              )}
            </div>
          </div>
          
          {/* Sekmeler */}
          <div className="px-2 md:px-5 flex gap-0 border-t border-stone-100 overflow-x-auto">
            <button
              onClick={() => { setAktifSekme("gorevlerim"); setFiltre("hepsi"); }}
              className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                aktifSekme === "gorevlerim" ? "border-amber-500 text-amber-600 bg-amber-50/50" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              📋 Görevlerim
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${aktifSekme === "gorevlerim" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>
                {birlesikGorevler.filter(g => !g.otomatikMi).length}
              </span>
            </button>
            
            {gorevAtayabilir && (
              <button
                onClick={() => { setAktifSekme("verdigim"); setFiltre("hepsi"); }}
                className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                  aktifSekme === "verdigim" ? "border-sky-500 text-sky-600 bg-sky-50/50" : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                📤 <span className="hidden md:inline">Verdiğim </span>Görevler
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${aktifSekme === "verdigim" ? "bg-sky-100 text-sky-700" : "bg-stone-100 text-stone-500"}`}>
                  {tumGorevler.filter(g => g.atayan === user?.email && !g.otomatikMi).length}
                </span>
              </button>
            )}

            <button
              onClick={() => { setAktifSekme("otomatik"); setFiltre("hepsi"); }}
              className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                aktifSekme === "otomatik" ? "border-purple-500 text-purple-600 bg-purple-50/50" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              <span className="hidden md:inline">🤖 </span>Otomatik
              <span className="hidden md:inline"> Görevler</span>
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${aktifSekme === "otomatik" ? "bg-purple-100 text-purple-700" : "bg-stone-100 text-stone-500"}`}>
                {birlesikGorevler.filter(g => g.otomatikMi === true).length}
              </span>
            </button>
            
            {gorevAtayabilir && (
              <button
                onClick={() => { setAktifSekme("tumgorevler"); setFiltre("hepsi"); setSeciliPersoneller([]); }}
                className={`px-2.5 md:px-4 py-2 md:py-2.5 font-medium text-xs md:text-sm transition border-b-2 whitespace-nowrap ${
                  aktifSekme === "tumgorevler" ? "border-emerald-500 text-emerald-600 bg-emerald-50/50" : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                {userRole === "Kurucu" ? "👑" : "👥"} <span className="hidden md:inline">Ekip </span>Görevleri
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${aktifSekme === "tumgorevler" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                  {tumGorevler.length}
                </span>
              </button>
            )}
          </div>
        </header>

        <main className="p-3 md:p-4 max-w-5xl mx-auto">
          {/* Ayarlar Paneli */}
          {showAyarlar && userRole === "Kurucu" && (
            <GorevAyarlarPanel
              gorevAyarlari={gorevAyarlari}
              senkronizeLoading={senkronizeLoading}
              onAyarDegistir={setGorevAyarlari}
              onSenkronizeEt={handleTumunuSenkronizeEt}
              onKapat={() => setShowAyarlar(false)}
            />
          )}

          {/* Otomatik alt sekmeler */}
          {aktifSekme === "otomatik" && (
            <div className="mb-3">
              <div className="flex flex-wrap items-center gap-1 mb-2">
                {([
                  { key: "hepsi", label: "Hepsi", renk: "stone-700", count: gorevler.filter(g => g.otomatikMi).length },
                  { key: "yorumIstesinMi", label: "📝 Yorum İstensin", renk: "purple-500", count: gorevler.filter(g => g.otomatikMi && g.gorevTuru === "yorumIstesinMi").length },
                  { key: "paylasimIzni", label: "📸 Paylaşım", renk: "blue-500", count: gorevler.filter(g => g.otomatikMi && g.gorevTuru === "paylasimIzni").length },
                  { key: "yorumIstendiMi", label: "💬 Yorum İstendi", renk: "amber-500", count: gorevler.filter(g => g.otomatikMi && g.gorevTuru === "yorumIstendiMi").length },
                  { key: "odemeTakip", label: "💰 Ödeme", renk: "red-500", count: gorevler.filter(g => g.otomatikMi && g.gorevTuru === "odemeTakip").length },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setOtomatikAltSekme(tab.key)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                      otomatikAltSekme === tab.key
                        ? `bg-${tab.renk} text-white`
                        : "bg-white text-stone-500 border border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {tab.label}
                    <span className={`ml-1 px-1 rounded-full text-[10px] ${otomatikAltSekme === tab.key ? "bg-white/20" : "bg-stone-100"}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
                
                <button
                  onClick={() => setSiralama(siralama === "yenidenEskiye" ? "eskidenYeniye" : "yenidenEskiye")}
                  className="ml-auto px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-50 text-stone-400 hover:bg-stone-100 transition"
                >
                  {siralama === "yenidenEskiye" ? "Yeni → Eski" : "Eski → Yeni"}
                </button>
              </div>
              
              {otomatikAltSekme !== "hepsi" && (
              <p className={`text-[10px] px-2 py-1 rounded-md ${
                otomatikAltSekme === "yorumIstesinMi" ? "bg-purple-50/50 text-purple-500" :
                otomatikAltSekme === "paylasimIzni" ? "bg-blue-50/50 text-blue-500" :
                otomatikAltSekme === "odemeTakip" ? "bg-red-50/50 text-red-500" :
                "bg-amber-50/50 text-amber-500"
              }`}>
                {otomatikAltSekme === "odemeTakip" 
                  ? "Ödeme alınmamış → Yöneticilere atanır. \"Yaptım\" ile kontrol edin."
                  : "Alan boş → Makyajcı/Türbancıya atanır. \"Yaptım\" ile kontrol edin."}
              </p>
              )}
            </div>
          )}
          
          {/* Ekip Görevleri personel filtresi */}
          {aktifSekme === "tumgorevler" && (
            <div className="mb-3 space-y-2">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-2.5">
                <p className="text-xs text-emerald-700">
                  <span className="font-medium">{userRole === "Kurucu" ? "👑" : "👥"} {userRole === "Kurucu" ? "Tüm personelin" : "Ekibinizin"} görevleri</span>
                  <span className="text-emerald-500 ml-1">• Personel seçerek filtreleyin</span>
                </p>
              </div>
              <div className="bg-white rounded-xl border border-stone-100 p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-stone-600">👤 Personel Filtresi</p>
                  {seciliPersoneller.length > 0 && (
                    <button onClick={() => setSeciliPersoneller([])} className="text-xs text-emerald-600 hover:text-emerald-800">Temizle</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {personelGorevSayilari.map(p => (
                    <label
                      key={p.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition text-sm ${
                        seciliPersoneller.includes(p.email)
                          ? "bg-emerald-100 border-2 border-emerald-400 text-emerald-800"
                          : "bg-stone-50 border border-stone-200 text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={seciliPersoneller.includes(p.email)}
                        onChange={(e) => {
                          if (e.target.checked) setSeciliPersoneller([...seciliPersoneller, p.email]);
                          else setSeciliPersoneller(seciliPersoneller.filter(email => email !== p.email));
                        }}
                        className="sr-only"
                      />
                      <span className="font-medium">{p.ad} {p.soyad}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        seciliPersoneller.includes(p.email) ? "bg-emerald-200 text-emerald-800" : "bg-stone-200 text-stone-600"
                      }`}>{p.gorevSayisi}</span>
                    </label>
                  ))}
                </div>
                {seciliPersoneller.length > 0 && (
                  <p className="text-xs text-stone-500 mt-2">{seciliPersoneller.length} personel seçili • {filtreliGorevler.length} görev gösteriliyor</p>
                )}
              </div>
            </div>
          )}

          {/* Filtre butonları */}
          {aktifSekme !== "otomatik" && (
          <div className="mb-3 md:mb-4 flex flex-wrap gap-1.5 md:gap-2">
            {(["hepsi", "bekliyor", "tamamlandi"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltre(f)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  filtre === f
                    ? aktifSekme === "tumgorevler" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                    : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
                }`}
              >
                {f === "hepsi" ? `Hepsi (${aktifSekme === "tumgorevler" ? tumGorevler.length : gorevler.filter(g => !g.otomatikMi).length})` :
                 f === "bekliyor" ? "⏳ Bekliyor" : "✅ Tamamlandı"}
              </button>
            ))}
            <button
              onClick={() => setSiralama(siralama === "yenidenEskiye" ? "eskidenYeniye" : "yenidenEskiye")}
              className="ml-auto px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 transition flex items-center gap-1"
            >
              {siralama === "yenidenEskiye" ? "📅 Yeni → Eski" : "📅 Eski → Yeni"}
            </button>
          </div>
          )}

          {/* Görev Listesi */}
          <div className="space-y-2">
            {filtreliGorevler.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-stone-100">
                <span className="text-3xl">📋</span>
                <p className="text-stone-400 mt-2 text-sm">Henüz görev yok</p>
              </div>
            ) : (
              filtreliGorevler.map((gorev) => (
                <GorevKart
                  key={gorev.id}
                  gorev={gorev}
                  aktifSekme={aktifSekme}
                  userEmail={user?.email || ""}
                  userRole={userRole}
                  tamamlaGorevId={tamamlaGorevId}
                  tamamlaYorum={tamamlaYorum}
                  yaptimLoading={yaptimLoading}
                  onDetayAc={setDetayGorev}
                  onTamamlaBasla={setTamamlaGorevId}
                  onTamamlaIptal={() => { setTamamlaGorevId(null); setTamamlaYorum(""); }}
                  onTamamlaYorumDegistir={setTamamlaYorum}
                  onTamamla={handleTamamla}
                  onSil={handleGorevSil}
                  onYaptim={handleYaptim}
                  onGelinTikla={(gelinId) => { fetchSingleGelin(gelinId); setSelectedGelinId(gelinId); }}
                />
              ))
            )}
          </div>
        </main>
      </div>

      {/* Gelin Modal */}
      {selectedGelinId && selectedGelin && (
        <GelinModal gelin={selectedGelin} onClose={() => { setSelectedGelinId(null); setSelectedGelin(null); }} />
      )}
      {selectedGelinId && gelinLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <p className="text-stone-500 text-sm">⏳ Gelin bilgisi yükleniyor...</p>
          </div>
        </div>
      )}

      {/* Görev Ekle Modal */}
      {showGorevEkle && (
        <GorevEkleModal
          yeniGorev={yeniGorev}
          ekipPersonelleri={ekipPersonelleri}
          loading={gorevEkleLoading}
          userEmail={user?.email || ""}
          onFormDegistir={setYeniGorev}
          onOlustur={handleGorevOlustur}
          onKapat={() => setShowGorevEkle(false)}
        />
      )}

      {/* Görev Detay Modal */}
      {detayGorev && (
        <GorevDetayModal
          gorev={detayGorev}
          userEmail={user?.email || ""}
          userRole={userRole}
          yorumLoading={yorumLoading}
          onKapat={() => { setDetayGorev(null); }}
          onTamamla={handleTamamla}
          onSil={handleGorevSil}
          onYorumEkle={handleYorumEkle}
          onDuzenle={handleGorevDuzenle}
        />
      )}
    </div>
  );
}
