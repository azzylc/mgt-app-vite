import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../lib/firebase";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, onSnapshot,
  query, orderBy, where, serverTimestamp, Timestamp
} from "firebase/firestore";
import * as Sentry from "@sentry/react";
import { useRole } from "../context/RoleProvider";
import type { Not, NotKlasor, KlasorFormState, KlasorFilter } from "../components/notlar/notlarTypes";
import { sanitizeHtml, icerikBoyutuAsildiMi } from "../components/notlar/notlarTypes";

// ─── Alt klasör ID'lerini recursive topla ────────────────
function getAltKlasorIds(klasorId: string, klasorler: NotKlasor[]): string[] {
  const direkt = klasorler.filter(k => k.ustKlasorId === klasorId);
  let ids: string[] = [];
  for (const k of direkt) {
    ids.push(k.id);
    ids = ids.concat(getAltKlasorIds(k.id, klasorler));
  }
  return ids;
}

export function useNotlar() {
  const { user, personelData } = useRole();
  const userEmail = user?.email || "";
  const userName = personelData
    ? `${personelData.ad} ${personelData.soyad}`
    : user?.displayName || userEmail;
  const isAdmin = personelData?.kullaniciTuru === "Kurucu" || personelData?.kullaniciTuru === "Yönetici";
  const kullaniciFirmalari = personelData?.firmalar || [];

  // ─── State ──────────────────────────────────────────────
  const [klasorler, setKlasorler] = useState<NotKlasor[]>([]);
  const [notlar, setNotlar] = useState<Not[]>([]);
  const [seciliKlasor, setSeciliKlasor] = useState<KlasorFilter>("tumu");
  const [seciliNot, setSeciliNot] = useState<Not | null>(null);
  const [aramaMetni, setAramaMetni] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonKayit, setSonKayit] = useState<Date | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Firma state — localStorage'dan persist
  const [firmalar, setFirmalar] = useState<{ id: string; firmaAdi: string }[]>([]);
  const [seciliFirma, setSeciliFirmaRaw] = useState<string>(() => {
    try { return localStorage.getItem("notlar_seciliFirma") || "kisisel"; } catch { return "kisisel"; }
  });
  const setSeciliFirma = useCallback((val: string) => {
    setSeciliFirmaRaw(val);
    try { localStorage.setItem("notlar_seciliFirma", val); } catch {}
  }, []);

  // Klasör modal state
  const [showKlasorModal, setShowKlasorModal] = useState(false);
  const [editingKlasor, setEditingKlasor] = useState<NotKlasor | null>(null);
  const [klasorForm, setKlasorForm] = useState<KlasorFormState>({ ad: "", renk: "gray", paylasimli: false, ustKlasorId: "" });

  // Refs
  const editorRef = useRef<HTMLDivElement>(null);
  const baslikRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<any>(null);
  // Pending save data — flush on exit için
  const pendingSaveRef = useRef<{ notId: string; baslik?: string; icerik?: string } | null>(null);

  // ─── FLUSH: Bekleyen kaydı hemen yaz ───────────────────
  const flushSave = useCallback(async () => {
    if (!pendingSaveRef.current) return;
    const { notId, baslik, icerik } = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      const updates: any = { sonDuzenleme: serverTimestamp() };
      if (baslik !== undefined) updates.baslik = baslik;
      if (icerik !== undefined) updates.icerik = sanitizeHtml(icerik);
      await updateDoc(doc(db, "notlar", notId), updates);
      setSonKayit(new Date());
    } catch (err) {
      console.error("Flush save hatası:", err);
      Sentry.captureException(err);
    }
  }, []);

  // ─── Sayfa kapanınca / gizlenince flush ────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSave();
      }
    };
    const handleBeforeUnload = () => {
      flushSave();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      // Component unmount — son kaydı flush et
      flushSave();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [flushSave]);

  // ─── Notları yükle (tek seferlik okuma) ────────────────
  const notlariYukle = useCallback(async () => {
    if (!user) return;
    setYukleniyor(true);
    try {
      const kisiselQ = query(
        collection(db, "notlar"),
        where("olusturan", "==", userEmail)
      );
      const paylasimliQ = query(
        collection(db, "notlar"),
        where("paylasimli", "==", true)
      );

      const [kisiselSnap, paylasimliSnap] = await Promise.all([
        getDocs(kisiselQ),
        getDocs(paylasimliQ),
      ]);

      const notMap = new Map<string, Not>();
      kisiselSnap.docs.forEach(d => {
        const data = d.data();
        notMap.set(d.id, {
          id: d.id,
          silindi: false,
          silinmeTarihi: null,
          firmaId: "",
          ...data,
        } as Not);
      });
      paylasimliSnap.docs.forEach(d => {
        const data = d.data();
        notMap.set(d.id, {
          id: d.id,
          silindi: false,
          silinmeTarihi: null,
          firmaId: "",
          ...data,
        } as Not);
      });

      // Client-side sıralama (sonDuzenleme desc)
      const sorted = Array.from(notMap.values()).sort((a, b) => {
        const tA = a.sonDuzenleme instanceof Timestamp ? a.sonDuzenleme.toMillis() : 0;
        const tB = b.sonDuzenleme instanceof Timestamp ? b.sonDuzenleme.toMillis() : 0;
        return tB - tA;
      });
      setNotlar(sorted);
    } catch (err) {
      console.error("Notlar yüklenirken hata:", err);
      Sentry.captureException(err);
    } finally {
      setYukleniyor(false);
    }
  }, [user, userEmail]);

  // ─── Klasörler (onSnapshot — az değişir) ───────────────
  useEffect(() => {
    if (!user) return;
    const klasorQ = query(collection(db, "notKlasorleri"), orderBy("sira", "asc"));
    const unsub = onSnapshot(klasorQ, (snap) => {
      setKlasorler(snap.docs.map(d => ({ id: d.id, ustKlasorId: "", firmaId: "", ...d.data() } as NotKlasor)));
    });
    return () => unsub();
  }, [user]);

  // ─── Firmaları yükle ──────────────────────────────────
  useEffect(() => {
    if (!user || kullaniciFirmalari.length === 0) return;
    const fetchFirmalar = async () => {
      try {
        const promises = kullaniciFirmalari.map(fId => getDoc(doc(db, "companies", fId)));
        const snaps = await Promise.all(promises);
        const list = snaps
          .filter(s => s.exists())
          .map(s => ({ id: s.id, firmaAdi: (s.data() as any).firmaAdi || s.id }));
        setFirmalar(list);
      } catch (err) {
        Sentry.captureException(err);
      }
    };
    fetchFirmalar();
  }, [user, kullaniciFirmalari.length]);

  // ─── Firma değişince seçili klasör/not sıfırla ────────
  useEffect(() => {
    setSeciliKlasor("tumu");
    setSeciliNot(null);
  }, [seciliFirma]);

  // ─── İlk yükleme ──────────────────────────────────────
  useEffect(() => {
    notlariYukle();
  }, [notlariYukle]);

  // ─── Filtrelenmiş notlar ───────────────────────────────
  const filtrelenmisNotlar = useCallback(() => {
    let sonuc = [...notlar];

    // Firma filtresi
    if (seciliFirma === "kisisel") {
      sonuc = sonuc.filter(n => !n.firmaId || n.firmaId === "");
    } else {
      sonuc = sonuc.filter(n => n.firmaId === seciliFirma);
    }

    // Çöp kutusu filtresi
    if (seciliKlasor === "cop") {
      return sonuc
        .filter(n => n.silindi)
        .sort((a, b) => {
          const tA = a.silinmeTarihi instanceof Timestamp ? a.silinmeTarihi.toMillis() : 0;
          const tB = b.silinmeTarihi instanceof Timestamp ? b.silinmeTarihi.toMillis() : 0;
          return tB - tA;
        });
    }

    // Aktif notlar (silinmemiş)
    sonuc = sonuc.filter(n => !n.silindi);

    // Klasör filtresi
    if (seciliKlasor === "kisisel") {
      sonuc = sonuc.filter(n => !n.paylasimli);
    } else if (seciliKlasor === "paylasimli") {
      sonuc = sonuc.filter(n => n.paylasimli);
    } else if (seciliKlasor !== "tumu") {
      // Alt klasörlerin notlarını da göster
      const altIds = getAltKlasorIds(seciliKlasor, klasorler);
      const tumIds = new Set([seciliKlasor, ...altIds]);
      sonuc = sonuc.filter(n => tumIds.has(n.klasorId));
    }

    // Arama
    if (aramaMetni.trim()) {
      const aranan = aramaMetni.toLowerCase();
      sonuc = sonuc.filter(n =>
        n.baslik.toLowerCase().includes(aranan) ||
        (n.icerik || "").toLowerCase().includes(aranan)
      );
    }

    // Sabitlenen üstte, sonra tarih
    sonuc.sort((a, b) => {
      if (a.sabitlendi && !b.sabitlendi) return -1;
      if (!a.sabitlendi && b.sabitlendi) return 1;
      const tA = a.sonDuzenleme instanceof Timestamp ? a.sonDuzenleme.toMillis() : 0;
      const tB = b.sonDuzenleme instanceof Timestamp ? b.sonDuzenleme.toMillis() : 0;
      return tB - tA;
    });

    return sonuc;
  }, [notlar, seciliKlasor, aramaMetni, klasorler, seciliFirma]);

  // ─── Klasör değişince seçili notu temizle ──────────────
  useEffect(() => {
    if (!seciliNot) return;
    const liste = filtrelenmisNotlar();
    if (!liste.find(n => n.id === seciliNot.id)) {
      flushSave(); // Mevcut notu kaydet
      setSeciliNot(null);
      if (editorRef.current) editorRef.current.innerHTML = "";
    }
  }, [seciliKlasor, aramaMetni]);

  // ─── Not oluştur ───────────────────────────────────────
  const handleYeniNot = async () => {
    try {
      await flushSave(); // Önceki notu kaydet
      const paylasimli = seciliKlasor === "paylasimli" ||
        (seciliKlasor !== "tumu" && seciliKlasor !== "kisisel" && seciliKlasor !== "paylasimli" && seciliKlasor !== "cop" &&
          klasorler.find(k => k.id === seciliKlasor)?.paylasimli === true);

      const yeniNot = {
        baslik: "",
        icerik: "",
        klasorId: (seciliKlasor !== "tumu" && seciliKlasor !== "kisisel" && seciliKlasor !== "paylasimli" && seciliKlasor !== "cop") ? seciliKlasor : "",
        sabitlendi: false,
        olusturan: userEmail,
        olusturanAd: userName,
        paylasimli,
        silindi: false,
        silinmeTarihi: null,
        firmaId: seciliFirma === "kisisel" ? "" : seciliFirma,
        olusturulmaTarihi: serverTimestamp(),
        sonDuzenleme: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "notlar"), yeniNot);
      const not: Not = { ...yeniNot, id: ref.id, olusturulmaTarihi: new Date(), sonDuzenleme: new Date() };
      setNotlar(prev => [not, ...prev]);
      setSeciliNot(not);
      setTimeout(() => baslikRef.current?.focus(), 100);
      return not;
    } catch (err: any) {
      console.error("Not oluşturma hatası:", err);
      Sentry.captureException(err);
      alert("Not oluşturulamadı! " + (err?.message || ""));
      return null;
    }
  };

  // ─── Not kaydet (debounced + sanitize) ─────────────────
  const kaydetNot = useCallback((not: Not, baslik?: string, icerik?: string) => {
    // Boyut kontrolü
    if (icerik && icerikBoyutuAsildiMi(icerik)) {
      alert("Not çok büyük! Lütfen içeriği kısaltın (maks ~200KB).");
      return;
    }

    // Pending save güncelle (flush için)
    pendingSaveRef.current = {
      notId: not.id,
      baslik: baslik ?? pendingSaveRef.current?.baslik,
      icerik: icerik ?? pendingSaveRef.current?.icerik,
    };

    setKaydediliyor(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!pendingSaveRef.current) return;
      const { notId, baslik: b, icerik: i } = pendingSaveRef.current;
      pendingSaveRef.current = null;
      try {
        const updates: any = { sonDuzenleme: serverTimestamp() };
        if (b !== undefined) updates.baslik = b;
        if (i !== undefined) updates.icerik = sanitizeHtml(i);
        await updateDoc(doc(db, "notlar", notId), updates);
        setSonKayit(new Date());
      } catch (err) {
        Sentry.captureException(err);
      } finally {
        setKaydediliyor(false);
      }
    }, 2000);
  }, []);

  // ─── Soft Delete (Çöp Kutusuna Taşı) ──────────────────
  const handleNotSil = async (not: Not) => {
    if (not.silindi) {
      // Zaten çöpteyse: kalıcı sil
      if (!confirm(`"${not.baslik || 'Başlıksız not'}" kalıcı olarak silinecek. Emin misiniz?`)) return;
      try {
        await deleteDoc(doc(db, "notlar", not.id));
        setNotlar(prev => prev.filter(n => n.id !== not.id));
        if (seciliNot?.id === not.id) setSeciliNot(null);
      } catch (err) {
        Sentry.captureException(err);
      }
    } else {
      // Çöp kutusuna taşı
      try {
        await updateDoc(doc(db, "notlar", not.id), {
          silindi: true,
          silinmeTarihi: serverTimestamp(),
        });
        setNotlar(prev => prev.map(n =>
          n.id === not.id ? { ...n, silindi: true, silinmeTarihi: new Date() } : n
        ));
        if (seciliNot?.id === not.id) setSeciliNot(null);
      } catch (err) {
        Sentry.captureException(err);
      }
    }
  };

  // ─── Çöp Kutusundan Geri Al ───────────────────────────
  const handleNotGeriAl = async (not: Not) => {
    try {
      await updateDoc(doc(db, "notlar", not.id), {
        silindi: false,
        silinmeTarihi: null,
      });
      setNotlar(prev => prev.map(n =>
        n.id === not.id ? { ...n, silindi: false, silinmeTarihi: null } : n
      ));
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  // ─── Çöp Kutusunu Boşalt ─────────────────────────────
  const handleCopuBosalt = async () => {
    const silinmisler = notlar.filter(n => n.silindi);
    if (silinmisler.length === 0) return;
    if (!confirm(`${silinmisler.length} not kalıcı olarak silinecek. Emin misiniz?`)) return;
    try {
      await Promise.all(silinmisler.map(n => deleteDoc(doc(db, "notlar", n.id))));
      setNotlar(prev => prev.filter(n => !n.silindi));
      setSeciliNot(null);
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  // ─── Sabitleme toggle ─────────────────────────────────
  const handleSabitle = async (not: Not) => {
    try {
      const yeniDeger = !not.sabitlendi;
      await updateDoc(doc(db, "notlar", not.id), { sabitlendi: yeniDeger });
      setNotlar(prev => prev.map(n => n.id === not.id ? { ...n, sabitlendi: yeniDeger } : n));
      if (seciliNot?.id === not.id) setSeciliNot({ ...seciliNot, sabitlendi: yeniDeger });
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  // ─── Klasör değiştir (editörden) ──────────────────────
  const handleKlasorDegistir = async (not: Not, yeniKlasorId: string) => {
    try {
      const klasorObj = klasorler.find(k => k.id === yeniKlasorId);
      const yeniPaylasimli = klasorObj?.paylasimli ?? false;
      await updateDoc(doc(db, "notlar", not.id), {
        klasorId: yeniKlasorId,
        paylasimli: yeniPaylasimli,
        sonDuzenleme: serverTimestamp(),
      });
      setNotlar(prev => prev.map(n =>
        n.id === not.id ? { ...n, klasorId: yeniKlasorId, paylasimli: yeniPaylasimli } : n
      ));
      if (seciliNot?.id === not.id) {
        setSeciliNot({ ...seciliNot, klasorId: yeniKlasorId, paylasimli: yeniPaylasimli });
      }
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  // ─── Klasör CRUD ──────────────────────────────────────
  const handleKlasorKaydet = async () => {
    if (!klasorForm.ad.trim()) return;
    try {
      // Alt klasör ise üst klasörün paylaşım durumunu miras al
      // Firma modunda kök klasörler otomatik paylaşımlı
      let paylasimli = klasorForm.paylasimli;
      if (klasorForm.ustKlasorId) {
        const ustKlasor = klasorler.find(k => k.id === klasorForm.ustKlasorId);
        if (ustKlasor) paylasimli = ustKlasor.paylasimli;
      } else if (seciliFirma !== "kisisel") {
        paylasimli = true;
      }

      const firmaId = seciliFirma === "kisisel" ? "" : seciliFirma;

      if (editingKlasor) {
        await updateDoc(doc(db, "notKlasorleri", editingKlasor.id), {
          ad: klasorForm.ad.trim(),
          renk: klasorForm.renk,
          paylasimli,
          ustKlasorId: klasorForm.ustKlasorId,
          firmaId,
        });
      } else {
        await addDoc(collection(db, "notKlasorleri"), {
          ad: klasorForm.ad.trim(),
          renk: klasorForm.renk,
          paylasimli,
          ustKlasorId: klasorForm.ustKlasorId,
          firmaId,
          olusturan: userEmail,
          olusturanAd: userName,
          sira: klasorler.length,
          olusturulmaTarihi: serverTimestamp(),
        });
      }
      setShowKlasorModal(false);
      setEditingKlasor(null);
      setKlasorForm({ ad: "", renk: "gray", paylasimli: false, ustKlasorId: "" });
    } catch (err) {
      Sentry.captureException(err);
      alert("Klasör kaydedilemedi!");
    }
  };

  const handleKlasorSil = async (klasor: NotKlasor) => {
    const altKlasorler = klasorler.filter(k => k.ustKlasorId === klasor.id);
    if (altKlasorler.length > 0) {
      alert(`"${klasor.ad}" klasörünün ${altKlasorler.length} alt klasörü var. Önce alt klasörleri silin veya taşıyın.`);
      return;
    }
    const klasorNotlari = notlar.filter(n => n.klasorId === klasor.id && !n.silindi);
    if (klasorNotlari.length > 0) {
      alert(`"${klasor.ad}" klasöründe ${klasorNotlari.length} not var. Önce notları taşıyın veya silin.`);
      return;
    }
    if (!confirm(`"${klasor.ad}" klasörü silinecek. Emin misiniz?`)) return;
    try {
      await deleteDoc(doc(db, "notKlasorleri", klasor.id));
      setKlasorler(prev => prev.filter(k => k.id !== klasor.id));
      if (seciliKlasor === klasor.id) setSeciliKlasor("tumu");
      setShowKlasorModal(false);
      setEditingKlasor(null);
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  const openKlasorModal = (klasor?: NotKlasor, ustKlasorId?: string, paylasimli?: boolean) => {
    if (klasor) {
      setEditingKlasor(klasor);
      setKlasorForm({ ad: klasor.ad, renk: klasor.renk, paylasimli: klasor.paylasimli, ustKlasorId: klasor.ustKlasorId || "" });
    } else {
      setEditingKlasor(null);
      setKlasorForm({ ad: "", renk: "gray", paylasimli: paylasimli ?? false, ustKlasorId: ustKlasorId || "" });
    }
    setShowKlasorModal(true);
  };

  const closeKlasorModal = () => {
    setShowKlasorModal(false);
    setEditingKlasor(null);
  };

  // ─── Derived data ─────────────────────────────────────
  // Notları firma'ya göre filtrele
  const firmaNotlari = notlar.filter(n =>
    seciliFirma === "kisisel" ? (!n.firmaId || n.firmaId === "") : n.firmaId === seciliFirma
  );
  const aktifNotlar = firmaNotlari.filter(n => !n.silindi);
  const copSayisi = firmaNotlari.filter(n => n.silindi).length;
  // Klasörleri firma'ya göre filtrele
  const firmaKlasorleri = klasorler.filter(k =>
    seciliFirma === "kisisel" ? (!k.firmaId || k.firmaId === "") : k.firmaId === seciliFirma
  );

  return {
    // State
    klasorler: firmaKlasorleri, notlar: firmaNotlari, seciliKlasor, seciliNot, aramaMetni,
    yukleniyor, sonKayit, kaydediliyor, isAdmin, userEmail,
    // Firma
    firmalar, seciliFirma, setSeciliFirma, kullaniciFirmalari,
    // Klasör modal
    showKlasorModal, editingKlasor, klasorForm, setKlasorForm,
    // Setters
    setSeciliKlasor, setSeciliNot, setAramaMetni, setNotlar,
    // Actions
    notlariYukle, handleYeniNot, kaydetNot, handleNotSil, handleNotGeriAl,
    handleCopuBosalt, handleSabitle, handleKlasorDegistir,
    handleKlasorKaydet, handleKlasorSil, openKlasorModal, closeKlasorModal,
    flushSave,
    // Computed
    filtrelenmisNotlar, aktifNotlar, copSayisi,
    // Refs
    editorRef, baslikRef,
  };
}
