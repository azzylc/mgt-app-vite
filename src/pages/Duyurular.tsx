import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../lib/firebase";
import { useGrupEtiketleri } from "../hooks/useGrupEtiketleri";
import { getRenkStilleri } from "../lib/grupEtiketleri";
import { usePersoneller } from "../hooks/usePersoneller";
import { 
  getYaklasanTatiller, 
  getYaklasanDogumGunleri, 
  getYaklasanAnmaGunleri, 
  resmiTatiller,
  anmaGunleri 
} from "../lib/data";
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

interface Announcement {
  id: string;
  title: string;
  content: string;
  important: boolean;
  group: string;
  author: string;
  createdAt: Timestamp | Date;
}

interface OzelTarih {
  id: string;
  baslik: string;
  tarih: string;      // YYYY-MM-DD
  tekrarliMi: boolean; // her yıl tekrar mı
  emoji: string;
  renk: string;        // amber, rose, purple, blue, emerald
  ekleyen: string;
  createdAt: Timestamp | Date;
}

type AktifSekme = "duyurular" | "tarihler";

// Renk seçenekleri
const RENK_SECENEKLERI = [
  { id: "amber", label: "Sarı", bg: "bg-[#8FAF9A]", light: "bg-[#EAF2ED]", text: "text-[#2F2F2F]", border: "border-[#8FAF9A]/30" },
  { id: "rose", label: "Kırmızı", bg: "bg-rose-500", light: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  { id: "purple", label: "Mor", bg: "bg-purple-500", light: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  { id: "blue", label: "Mavi", bg: "bg-blue-500", light: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  { id: "emerald", label: "Yeşil", bg: "bg-[#8FAF9A]", light: "bg-[#EAF2ED]", text: "text-[#8FAF9A]", border: "border-[#8FAF9A]/30" },
  { id: "stone", label: "Gri", bg: "bg-[#8A8A8A]", light: "bg-[#F7F7F7]", text: "text-[#2F2F2F]", border: "border-[#E5E5E5]" },
];

const EMOJI_SECENEKLERI = ["🎉", "🎊", "📌", "⭐", "🏆", "🎯", "💼", "🎈", "💡", "📅", "🗓️", "❤️"];

function getRenkStil(renk: string) {
  return RENK_SECENEKLERI.find(r => r.id === renk) || RENK_SECENEKLERI[0];
}

export default function DuyurularPage() {
  const user = useAuth();
  const location = useLocation();
  const [aktifSekme, setAktifSekme] = useState<AktifSekme>(() => {
    // HashRouter: hash = "#/duyurular?tab=tarihler"
    const hash = window.location.hash || "";
    if (hash.includes("tab=tarihler")) return "tarihler";
    return "duyurular";
  });
  
  // === DUYURULAR STATE ===
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [filteredAnnouncements, setFilteredAnnouncements] = useState<Announcement[]>([]);
  const [activeFilter, setActiveFilter] = useState("tumu");
  const [showModal, setShowModal] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ 
    title: '', content: '', important: false, group: ''
  });
  const { grupEtiketleri, loading: grupLoading } = useGrupEtiketleri();

  // === ÖZEL TARİHLER STATE ===
  const [ozelTarihler, setOzelTarihler] = useState<OzelTarih[]>([]);
  const [showTarihModal, setShowTarihModal] = useState(false);
  const [yeniTarih, setYeniTarih] = useState({
    baslik: '', tarih: '', tekrarliMi: true, emoji: '📌', renk: 'amber'
  });
  const [tarihFiltre, setTarihFiltre] = useState<"tumu" | "tatil" | "anma" | "dogumgunu" | "ozel">("tumu");
  const [tarihSayfa, setTarihSayfa] = useState(0);
  const TARIH_SAYFA_BOYUTU = 10;
  
  // === PERSONELLER (doğum günleri için) ===
  const { personeller } = usePersoneller();

  // URL'den tab parametresini dinle
  useEffect(() => {
    const hash = window.location.hash || "";
    if (hash.includes("tab=tarihler")) setAktifSekme("tarihler");
  }, [location]);

  // İlk grup yüklenince default grup ata
  useEffect(() => {
    if (grupEtiketleri.length > 0 && !newAnnouncement.group) {
      setNewAnnouncement(prev => ({ ...prev, group: grupEtiketleri[0].grupAdi }));
    }
  }, [grupEtiketleri]);

  // === FIRESTORE LİSTENERLAR ===
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "onemliTarihler"), orderBy("tarih", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOzelTarihler(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OzelTarih)));
    });
    return () => unsubscribe();
  }, [user]);

  // Duyuru filtreleme
  useEffect(() => {
    if (activeFilter === "tumu") {
      setFilteredAnnouncements(announcements);
    } else {
      setFilteredAnnouncements(announcements.filter(a => 
        (a.group || '').toLowerCase() === activeFilter.toLowerCase()
      ));
    }
  }, [activeFilter, announcements]);

  // === TÜM TARİHLERİ BİRLEŞTİR ===
  const tumTarihler = useMemo(() => {
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    const items: {
      id: string; baslik: string; tarihStr: string; kalanGun: number;
      kategori: "tatil" | "anma" | "dogumgunu" | "ozel";
      emoji: string; renk: string; tekrarliMi?: boolean;
    }[] = [];

    // Resmi tatiller
    getYaklasanTatiller().forEach(t => {
      const tarih = new Date(t.tarih);
      const kalanGun = Math.floor((tarih.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
      items.push({
        id: `tatil-${t.tarih}`,
        baslik: t.isim,
        tarihStr: t.tarih,
        kalanGun,
        kategori: "tatil",
        emoji: "🏖️",
        renk: "rose",
      });
    });

    // Anma günleri
    getYaklasanAnmaGunleri().forEach(a => {
      items.push({
        id: `anma-${a.ay}-${a.gun}`,
        baslik: a.isim,
        tarihStr: a.tarihStr,
        kalanGun: a.kalanGun,
        kategori: "anma",
        emoji: a.emoji,
        renk: "stone",
      });
    });

    // Doğum günleri
    getYaklasanDogumGunleri(personeller.map(p => ({
      id: p.id, ad: p.ad, soyad: p.soyad, 
      dogumTarihi: ((p as unknown) as Record<string, string>).dogumTarihi || '',
      aktif: true
    }))).forEach(d => {
      items.push({
        id: `dogum-${d.id}`,
        baslik: `${d.isim} Doğum Günü`,
        tarihStr: d.yaklasanTarih,
        kalanGun: d.kalanGun,
        kategori: "dogumgunu",
        emoji: "🎂",
        renk: "purple",
      });
    });

    // Özel tarihler
    ozelTarihler.forEach(t => {
      let tarih = new Date(t.tarih + "T00:00:00");
      if (t.tekrarliMi) {
        const buYil = bugun.getFullYear();
        tarih = new Date(buYil, tarih.getMonth(), tarih.getDate());
        if (tarih < bugun) tarih = new Date(buYil + 1, tarih.getMonth(), tarih.getDate());
      }
      const kalanGun = Math.floor((tarih.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
      if (kalanGun < 0 && !t.tekrarliMi) return; // geçmiş tek seferlik
      if (kalanGun > 365) return;
      items.push({
        id: `ozel-${t.id}`,
        baslik: t.baslik,
        tarihStr: `${tarih.getFullYear()}-${String(tarih.getMonth()+1).padStart(2,'0')}-${String(tarih.getDate()).padStart(2,'0')}`,
        kalanGun: Math.max(0, kalanGun),
        kategori: "ozel",
        emoji: t.emoji,
        renk: t.renk,
        tekrarliMi: t.tekrarliMi,
      });
    });

    return items.sort((a, b) => a.kalanGun - b.kalanGun);
  }, [personeller, ozelTarihler]);

  const filtrelenmisT = useMemo(() => {
    if (tarihFiltre === "tumu") return tumTarihler;
    return tumTarihler.filter(t => t.kategori === tarihFiltre);
  }, [tumTarihler, tarihFiltre]);

  const tarihToplamSayfa = Math.ceil(filtrelenmisT.length / TARIH_SAYFA_BOYUTU);
  const sayfadakiTarihler = filtrelenmisT.slice(tarihSayfa * TARIH_SAYFA_BOYUTU, (tarihSayfa + 1) * TARIH_SAYFA_BOYUTU);

  // Filtre değişince sayfayı sıfırla
  useEffect(() => { setTarihSayfa(0); }, [tarihFiltre]);

  // === HANDLERS ===
  const handleAddAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.content) {
      alert("Lütfen başlık ve içerik girin!");
      return;
    }
    try {
      const yazarPersonel = personeller.find(p => p.email === user?.email);
      const yazarAd = yazarPersonel ? `${yazarPersonel.ad} ${yazarPersonel.soyad}` : user?.email?.split('@')[0] || 'Admin';

      await addDoc(collection(db, "announcements"), {
        title: newAnnouncement.title,
        content: newAnnouncement.content,
        important: newAnnouncement.important,
        group: newAnnouncement.group,
        author: yazarAd,
        createdAt: serverTimestamp()
      });

      try {
        const grupQuery = query(
          collection(db, "personnel"),
          where("grupEtiketleri", "array-contains", newAnnouncement.group),
          where("aktif", "==", true)
        );
        const personelSnapshot = await getDocs(grupQuery);
        const alicilar = personelSnapshot.docs
          .map(d => d.data().email as string)
          .filter(email => email && email !== user?.email);
        if (alicilar.length > 0) {
          bildirimYazCoklu(alicilar, {
            baslik: newAnnouncement.important ? "🔴 Önemli Duyuru" : "📢 Yeni Duyuru",
            mesaj: newAnnouncement.title,
            tip: "duyuru",
            route: "/duyurular",
            gonderen: user?.email || "",
            gonderenAd: yazarAd,
          });
        }
      } catch (bildirimErr) {
        console.warn("[Duyuru] Bildirim gönderilemedi:", bildirimErr);
      }

      setShowModal(false);
      setNewAnnouncement({ title: '', content: '', important: false, group: grupEtiketleri[0]?.grupAdi || '' });
    } catch (error) {
      Sentry.captureException(error);
      alert("Duyuru eklenemedi!");
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (confirm("Bu duyuruyu silmek istediğinize emin misiniz?")) {
      try { await deleteDoc(doc(db, "announcements", id)); }
      catch (error) { Sentry.captureException(error); alert("Silinemedi!"); }
    }
  };

  const handleAddTarih = async () => {
    if (!yeniTarih.baslik.trim() || !yeniTarih.tarih) {
      alert("Lütfen başlık ve tarih girin!");
      return;
    }
    try {
      await addDoc(collection(db, "onemliTarihler"), {
        baslik: yeniTarih.baslik.trim(),
        tarih: yeniTarih.tarih,
        tekrarliMi: yeniTarih.tekrarliMi,
        emoji: yeniTarih.emoji,
        renk: yeniTarih.renk,
        ekleyen: user?.email || "",
        createdAt: serverTimestamp()
      });
      setShowTarihModal(false);
      setYeniTarih({ baslik: '', tarih: '', tekrarliMi: true, emoji: '📌', renk: 'amber' });
    } catch (error) {
      Sentry.captureException(error);
      alert("Tarih eklenemedi!");
    }
  };

  const handleDeleteTarih = async (firestoreId: string) => {
    if (confirm("Bu tarihi silmek istediğinize emin misiniz?")) {
      try { await deleteDoc(doc(db, "onemliTarihler", firestoreId)); }
      catch (error) { Sentry.captureException(error); alert("Silinemedi!"); }
    }
  };

  const formatTarih = (timestamp: Timestamp | Date | null | undefined) => {
    if (!timestamp) return '';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp as Date);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTarihStr = (tarihStr: string) => {
    const d = new Date(tarihStr + "T00:00:00");
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  };

  const formatTarihFull = (tarihStr: string) => {
    const d = new Date(tarihStr + "T00:00:00");
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  };

  const getGroupInfo = (groupName: string) => {
    const safeGroupName = groupName || '';
    const grup = grupEtiketleri.find(g => g.grupAdi.toLowerCase() === safeGroupName.toLowerCase());
    if (!grup) return { grupAdi: safeGroupName || 'Genel', stiller: getRenkStilleri('gray') };
    return { grupAdi: grup.grupAdi, stiller: getRenkStilleri(grup.renk) };
  };

  const getGroupCounts = () => {
    const counts: Record<string, number> = { tumu: announcements.length };
    grupEtiketleri.forEach(g => {
      counts[g.grupAdi] = announcements.filter(a => 
        (a.group || '').toLowerCase() === g.grupAdi.toLowerCase()
      ).length;
    });
    return counts;
  };

  const counts = getGroupCounts();

  const kalanGunBadge = (gun: number) => {
    if (gun === 0) return "bg-[#8FAF9A] text-white animate-pulse";
    if (gun <= 3) return "bg-[#EAF2ED] text-[#2F2F2F]";
    if (gun <= 7) return "bg-blue-100 text-blue-800";
    if (gun <= 30) return "bg-[#F7F7F7] text-[#2F2F2F]";
    return "bg-[#F7F7F7] text-[#8A8A8A]";
  };

  const kalanGunText = (gun: number) => {
    if (gun === 0) return "Bugün!";
    if (gun === 1) return "Yarın";
    return `${gun} gün`;
  };

  const kategoriSayilari = useMemo(() => ({
    tumu: tumTarihler.length,
    tatil: tumTarihler.filter(t => t.kategori === "tatil").length,
    anma: tumTarihler.filter(t => t.kategori === "anma").length,
    dogumgunu: tumTarihler.filter(t => t.kategori === "dogumgunu").length,
    ozel: tumTarihler.filter(t => t.kategori === "ozel").length,
  }), [tumTarihler]);

  if (grupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* HEADER */}
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-[#2F2F2F]">📢 Duyurular & Önemli Tarihler</h1>
            <p className="text-xs md:text-sm text-[#8A8A8A]">Ekip duyuruları ve yaklaşan tarihler</p>
          </div>
          <div className="flex gap-2">
            {aktifSekme === "duyurular" ? (
              <button onClick={() => setShowModal(true)}
                className="bg-rose-500 hover:bg-rose-600 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition">
                ➕ Yeni Duyuru
              </button>
            ) : (
              <button onClick={() => setShowTarihModal(true)}
                className="bg-[#8FAF9A] hover:bg-[#7A9E86] text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition">
                ➕ Yeni Tarih
              </button>
            )}
          </div>
        </div>

        {/* SEKME SEÇİCİ */}
        <div className="flex gap-1 bg-[#F7F7F7] rounded-lg p-1 w-fit">
          <button
            onClick={() => setAktifSekme("duyurular")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              aktifSekme === "duyurular" ? "bg-white text-[#2F2F2F] shadow-sm" : "text-[#8A8A8A] hover:text-[#2F2F2F]"
            }`}>
            📢 Duyurular <span className="ml-1 text-xs opacity-70">({announcements.length})</span>
          </button>
          <button
            onClick={() => setAktifSekme("tarihler")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              aktifSekme === "tarihler" ? "bg-white text-[#2F2F2F] shadow-sm" : "text-[#8A8A8A] hover:text-[#2F2F2F]"
            }`}>
            📅 Önemli Tarihler <span className="ml-1 text-xs opacity-70">({tumTarihler.length})</span>
          </button>
        </div>
      </header>

      {/* İÇERİK */}
      <main className="p-4 md:p-6">
        {/* ========== DUYURULAR SEKMESİ ========== */}
        {aktifSekme === "duyurular" && (
          <div>
            {/* Grup Filtreleri */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <button onClick={() => setActiveFilter("tumu")}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                  activeFilter === "tumu" ? "bg-[#2F2F2F] text-white" : "bg-white text-[#2F2F2F] hover:bg-[#F7F7F7] border border-[#E5E5E5]"
                }`}>
                Tümü ({counts.tumu})
              </button>
              {grupEtiketleri.map(grup => {
                const stiller = getRenkStilleri(grup.renk);
                return (
                  <button key={grup.id} onClick={() => setActiveFilter(grup.grupAdi)}
                    className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition flex items-center gap-1.5 ${
                      activeFilter === grup.grupAdi ? `${stiller.bg} text-white` : "bg-white text-[#2F2F2F] hover:bg-[#F7F7F7] border border-[#E5E5E5]"
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${activeFilter === grup.grupAdi ? "bg-white" : stiller.bg}`}></span>
                    {grup.grupAdi} ({counts[grup.grupAdi] || 0})
                  </button>
                );
              })}
            </div>

            {/* Duyuru Listesi */}
            {filteredAnnouncements.length === 0 ? (
              <div className="bg-white rounded-lg p-12 text-center text-[#8A8A8A] border border-[#E5E5E5]">
                <span className="text-5xl mb-4 block">📭</span>
                <p className="text-lg font-medium">
                  {activeFilter === "tumu" ? "Henüz duyuru yok" : `${activeFilter} grubunda duyuru yok`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAnnouncements.map(announcement => {
                  const groupInfo = getGroupInfo(announcement.group);
                  return (
                    <div key={announcement.id}
                      className={`bg-white rounded-lg shadow-sm border overflow-hidden ${
                        announcement.important ? 'border-[#D96C6C] ring-2 ring-red-100' : groupInfo.stiller.border
                      }`}>
                      <div className="p-4 md:p-5">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`${groupInfo.stiller.bg} text-white text-xs font-bold px-2.5 py-0.5 rounded-full`}>
                              {groupInfo.grupAdi}
                            </span>
                            {announcement.important && (
                              <span className="bg-[#D96C6C] text-white text-xs font-bold px-2.5 py-0.5 rounded-full animate-pulse">
                                🔥 ÖNEMLİ
                              </span>
                            )}
                            <h3 className="text-base font-semibold text-[#2F2F2F]">{announcement.title}</h3>
                          </div>
                          <button onClick={() => handleDeleteAnnouncement(announcement.id)}
                            className="text-[#8A8A8A] hover:text-[#D96C6C] transition text-sm ml-2 shrink-0">
                            🗑️
                          </button>
                        </div>
                        <p className="text-[#2F2F2F] text-sm mb-3 whitespace-pre-wrap">{announcement.content}</p>
                        <div className="flex items-center justify-between text-xs text-[#8A8A8A]">
                          <span>👤 {announcement.author}</span>
                          <span>📅 {formatTarih(announcement.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========== ÖNEMLİ TARİHLER SEKMESİ ========== */}
        {aktifSekme === "tarihler" && (
          <div>
            {/* Kategori Filtreleri */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {([
                { key: "tumu", label: "Tümü", emoji: "📋" },
                { key: "tatil", label: "Tatiller", emoji: "🏖️" },
                { key: "anma", label: "Anma Günleri", emoji: "🇹🇷" },
                { key: "dogumgunu", label: "Doğum Günleri", emoji: "🎂" },
                { key: "ozel", label: "Özel Tarihler", emoji: "📌" },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setTarihFiltre(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                    tarihFiltre === f.key 
                      ? "bg-[#8FAF9A] text-white" 
                      : "bg-white text-[#2F2F2F] hover:bg-[#F7F7F7] border border-[#E5E5E5]"
                  }`}>
                  {f.emoji} {f.label} ({kategoriSayilari[f.key]})
                </button>
              ))}
            </div>

            {/* Tarih Listesi */}
            {filtrelenmisT.length === 0 ? (
              <div className="bg-white rounded-lg p-12 text-center text-[#8A8A8A] border border-[#E5E5E5]">
                <span className="text-5xl mb-4 block">📅</span>
                <p className="text-lg font-medium">Yaklaşan tarih yok</p>
              </div>
            ) : (
              <div>
                <div className="space-y-2">
                  {sayfadakiTarihler.map(tarih => {
                  const renkStil = getRenkStil(tarih.renk);
                  const isOzel = tarih.kategori === "ozel";
                  const firestoreId = isOzel ? tarih.id.replace("ozel-", "") : null;
                  return (
                    <div key={tarih.id}
                      className={`bg-white rounded-lg border ${renkStil.border} overflow-hidden transition hover:shadow-sm`}>
                      <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4">
                        {/* Emoji */}
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${renkStil.light} flex items-center justify-center text-lg md:text-xl shrink-0`}>
                          {tarih.emoji}
                        </div>

                        {/* İçerik */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-[#2F2F2F] text-sm md:text-base truncate">{tarih.baslik}</h3>
                            {tarih.tekrarliMi && (
                              <span className="text-[10px] bg-[#F7F7F7] text-[#8A8A8A] px-1.5 py-0.5 rounded-full">🔄 her yıl</span>
                            )}
                          </div>
                          <p className="text-xs text-[#8A8A8A] mt-0.5">{formatTarihFull(tarih.tarihStr)}</p>
                        </div>

                        {/* Kalan gün badge */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${kalanGunBadge(tarih.kalanGun)}`}>
                            {kalanGunText(tarih.kalanGun)}
                          </span>
                          {/* Kategori chip */}
                          <span className={`hidden md:inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${renkStil.light} ${renkStil.text}`}>
                            {tarih.kategori === "tatil" ? "Tatil" :
                             tarih.kategori === "anma" ? "Anma" :
                             tarih.kategori === "dogumgunu" ? "Doğum Günü" : "Özel"}
                          </span>
                          {/* Silme (sadece özel tarihler) */}
                          {isOzel && firestoreId && (
                            <button onClick={() => handleDeleteTarih(firestoreId)}
                              className="text-[#8A8A8A] hover:text-[#D96C6C] transition text-sm">
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
                {/* Pagination */}
                {tarihToplamSayfa > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-4 pt-3 border-t border-[#E5E5E5]">
                    <button onClick={() => setTarihSayfa(s => Math.max(0, s - 1))} disabled={tarihSayfa === 0}
                      className={`px-3 py-1.5 rounded-lg text-sm transition ${
                        tarihSayfa === 0 ? "text-[#8A8A8A] cursor-not-allowed" : "text-[#2F2F2F] hover:bg-[#F7F7F7]"
                      }`}>← Önceki</button>
                    <span className="text-xs text-[#8A8A8A]">{tarihSayfa + 1} / {tarihToplamSayfa}</span>
                    <button onClick={() => setTarihSayfa(s => Math.min(tarihToplamSayfa - 1, s + 1))} disabled={tarihSayfa >= tarihToplamSayfa - 1}
                      className={`px-3 py-1.5 rounded-lg text-sm transition ${
                        tarihSayfa >= tarihToplamSayfa - 1 ? "text-[#8A8A8A] cursor-not-allowed" : "text-[#2F2F2F] hover:bg-[#F7F7F7]"
                      }`}>Sonraki →</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* DUYURU MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-rose-500 to-rose-400 text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
              <h3 className="font-bold text-sm">📢 Yeni Duyuru</h3>
              <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Grup */}
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-2">Grup</label>
                <div className="flex flex-wrap gap-2">
                  {grupEtiketleri.map(grup => {
                    const stiller = getRenkStilleri(grup.renk);
                    return (
                      <button key={grup.id} type="button"
                        onClick={() => setNewAnnouncement({...newAnnouncement, group: grup.grupAdi})}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          newAnnouncement.group === grup.grupAdi ? `${stiller.bg} text-white` : "bg-[#F7F7F7] text-[#2F2F2F]"
                        }`}>
                        {grup.grupAdi}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Başlık</label>
                <input type="text" value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement({...newAnnouncement, title: e.target.value})}
                  className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                  placeholder="Duyuru başlığı..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">İçerik</label>
                <textarea value={newAnnouncement.content}
                  onChange={(e) => setNewAnnouncement({...newAnnouncement, content: e.target.value})}
                  rows={4}
                  className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm resize-none"
                  placeholder="Duyuru içeriği..." />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newAnnouncement.important}
                  onChange={(e) => setNewAnnouncement({...newAnnouncement, important: e.target.checked})}
                  className="rounded border-[#E5E5E5] text-rose-500" />
                <span className="text-sm text-[#2F2F2F]">🔥 Önemli duyuru</span>
              </label>
              <div className="flex gap-3 pt-1">
                <button onClick={handleAddAnnouncement}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-lg text-sm font-medium transition">
                  Ekle
                </button>
                <button onClick={() => setShowModal(false)}
                  className="flex-1 bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] py-2.5 rounded-lg text-sm font-medium transition">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ÖZEL TARİH EKLEME MODAL */}
      {showTarihModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTarihModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#8FAF9A] to-[#7A9E86] text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
              <h3 className="font-bold text-sm">📌 Yeni Önemli Tarih</h3>
              <button onClick={() => setShowTarihModal(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Başlık *</label>
                <input type="text" value={yeniTarih.baslik}
                  onChange={(e) => setYeniTarih({...yeniTarih, baslik: e.target.value})}
                  className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm"
                  placeholder="Örn: Şirket kuruluş yıldönümü" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Tarih *</label>
                <input type="date" value={yeniTarih.tarih}
                  onChange={(e) => setYeniTarih({...yeniTarih, tarih: e.target.value})}
                  className="w-full px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] text-sm" />
              </div>

              {/* Emoji Seçimi */}
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Emoji</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_SECENEKLERI.map(e => (
                    <button key={e} type="button" onClick={() => setYeniTarih({...yeniTarih, emoji: e})}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition ${
                        yeniTarih.emoji === e ? "bg-[#EAF2ED] ring-2 ring-[#8FAF9A]" : "bg-[#F7F7F7] hover:bg-[#F7F7F7]"
                      }`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Renk Seçimi */}
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Renk</label>
                <div className="flex flex-wrap gap-2">
                  {RENK_SECENEKLERI.map(r => (
                    <button key={r.id} type="button" onClick={() => setYeniTarih({...yeniTarih, renk: r.id})}
                      className={`w-8 h-8 rounded-full ${r.bg} transition ${
                        yeniTarih.renk === r.id ? "ring-2 ring-offset-2 ring-[#8A8A8A] scale-110" : "opacity-60 hover:opacity-100"
                      }`} title={r.label} />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={yeniTarih.tekrarliMi}
                  onChange={(e) => setYeniTarih({...yeniTarih, tekrarliMi: e.target.checked})}
                  className="rounded border-[#E5E5E5] text-[#E6B566]" />
                <span className="text-sm text-[#2F2F2F]">🔄 Her yıl tekrarlansın</span>
              </label>

              <div className="flex gap-3 pt-1">
                <button onClick={handleAddTarih}
                  className="flex-1 bg-[#8FAF9A] hover:bg-[#7A9E86] text-white py-2.5 rounded-lg text-sm font-medium transition">
                  Ekle
                </button>
                <button onClick={() => setShowTarihModal(false)}
                  className="flex-1 bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] py-2.5 rounded-lg text-sm font-medium transition">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
