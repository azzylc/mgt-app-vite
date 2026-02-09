import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { collection, doc, getDocs, updateDoc, addDoc, serverTimestamp, query, where, onSnapshot, orderBy } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth, usePersonelData } from "../context/RoleProvider";
import { bildirimYazCoklu } from "../lib/bildirimHelper";

interface ProfilBilgileri {
  ad: string;
  soyad: string;
  email: string;
  telefon: string;
  dogumGunu?: string;
  iseBaslama: string;
  kullaniciTuru: string;
  firmalar?: string[];
  grupEtiketleri?: string[];
  sicilNo: string;
  foto: string;
  aktif: boolean;
  calismaSaati?: string;
}

interface DegisiklikTalebi {
  id: string;
  personelEmail: string;
  personelAd: string;
  degisiklikler: { alan: string; mevcutDeger: string; yeniDeger: string }[];
  durum: "bekliyor" | "onaylandi" | "reddedildi";
  createdAt: any;
  yanitNotu?: string;
}

export default function Profilim() {
  const user = useAuth();
  const personelData = usePersonelData();
  const [profil, setProfil] = useState<ProfilBilgileri | null>(null);
  const [personelDocId, setPersonelDocId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showTalepModal, setShowTalepModal] = useState(false);
  const [talepSatirlar, setTalepSatirlar] = useState([{ alan: "", yeniDeger: "" }]);
  const [talepGonderiliyor, setTalepGonderiliyor] = useState(false);
  const [talepler, setTalepler] = useState<DegisiklikTalebi[]>([]);

  useEffect(() => {
    if (!user?.email) return;
    const fetchProfil = async () => {
      try {
        const q = query(collection(db, "personnel"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          setPersonelDocId(docSnap.id);
          const data = docSnap.data();
          setProfil({
            ad: data.ad || "", soyad: data.soyad || "", email: data.email || "",
            telefon: data.telefon || "", dogumGunu: data.dogumGunu || "",
            iseBaslama: data.iseBaslama || "", kullaniciTuru: data.kullaniciTuru || "Personel",
            firmalar: data.firmalar || [], grupEtiketleri: data.grupEtiketleri || [],
            sicilNo: data.sicilNo || "", foto: data.foto || "",
            aktif: data.aktif !== false, calismaSaati: data.calismaSaati || "",
          });
        }
      } catch (err) { Sentry.captureException(err); }
      finally { setLoading(false); }
    };
    fetchProfil();
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "profilDegisiklikleri"), where("personelEmail", "==", user.email), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTalepler(snap.docs.map(d => ({ id: d.id, ...d.data() } as DegisiklikTalebi)));
    }, () => {});
    return () => unsub();
  }, [user?.email]);

  const handleFotoSec = () => fileInputRef.current?.click();

  const handleFotoYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !personelDocId) return;
    if (!file.type.startsWith("image/")) { alert("Lütfen bir fotoğraf seçin!"); return; }
    if (file.size > 2 * 1024 * 1024) { alert("Fotoğraf 2MB'dan küçük olmalı!"); return; }

    setFotoYukleniyor(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          const MAX = 200;
          let w = img.width, h = img.height;
          if (w > h) { h = (h / w) * MAX; w = MAX; } else { w = (w / h) * MAX; h = MAX; }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          const resized = canvas.toDataURL("image/jpeg", 0.8);
          await updateDoc(doc(db, "personnel", personelDocId), { foto: resized });
          setProfil(prev => prev ? { ...prev, foto: resized } : null);
          setFotoYukleniyor(false);
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      Sentry.captureException(err); alert("Fotoğraf yüklenemedi!"); setFotoYukleniyor(false);
    }
  };

  const handleTalepGonder = async () => {
    const gecerliSatirlar = talepSatirlar.filter(s => s.alan.trim() && s.yeniDeger.trim());
    if (gecerliSatirlar.length === 0) { alert("En az bir değişiklik girmelisiniz!"); return; }

    setTalepGonderiliyor(true);
    try {
      const mevcutDegerBul = (alan: string) => {
        if (!profil) return "";
        const map: Record<string, string> = {
          "Ad": profil.ad, "Soyad": profil.soyad,
          "Telefon": profil.telefon, "Doğum Tarihi": profil.dogumGunu || "",
        };
        return map[alan] || "";
      };

      await addDoc(collection(db, "profilDegisiklikleri"), {
        personelEmail: user?.email,
        personelAd: `${profil?.ad} ${profil?.soyad}`,
        degisiklikler: gecerliSatirlar.map(s => ({
          alan: s.alan, mevcutDeger: mevcutDegerBul(s.alan), yeniDeger: s.yeniDeger,
        })),
        durum: "bekliyor",
        createdAt: serverTimestamp(),
      });

      // Sadece Kurucu'lara bildirim
      try {
        const kurucuQ = query(collection(db, "personnel"), where("kullaniciTuru", "==", "Kurucu"), where("aktif", "==", true));
        const kurucuSnap = await getDocs(kurucuQ);
        const alicilar = kurucuSnap.docs.map(d => d.data().email as string).filter(email => email && email !== user?.email);
        if (alicilar.length > 0) {
          bildirimYazCoklu(alicilar, {
            baslik: "Profil Değişiklik Talebi",
            mesaj: `${profil?.ad} ${profil?.soyad} profil bilgilerinde değişiklik talep etti`,
            tip: "sistem",
            route: "/profilim-talepler",
            gonderen: user?.email || "",
            gonderenAd: `${profil?.ad} ${profil?.soyad}`,
          });
        }
      } catch (bildirimErr) { console.warn("Bildirim gönderilemedi:", bildirimErr); }

      setShowTalepModal(false);
      setTalepSatirlar([{ alan: "", yeniDeger: "" }]);
      alert("Değişiklik talebiniz gönderildi!");
    } catch (err) {
      Sentry.captureException(err); alert("Talep gönderilemedi!");
    } finally { setTalepGonderiliyor(false); }
  };

  const alanSecenekleri = ["Ad", "Soyad", "Telefon", "Doğum Tarihi", "Diğer"];

  const formatTarih = (tarihStr: string) => {
    if (!tarihStr) return "—";
    return new Date(tarihStr + "T00:00:00").toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div></div>);
  }
  if (!profil) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-stone-500">Profil bilgileri bulunamadı</p></div>);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-lg md:text-xl font-bold text-stone-800">Profilim</h1>
        <p className="text-xs md:text-sm text-stone-500">Kişisel bilgilerin ve ayarların</p>
      </header>

      <main className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        {/* PROFİL KARTI */}
        <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
          <div className="bg-gradient-to-r from-rose-500 to-amber-400 h-20"></div>
          <div className="px-5 pb-5">
            <div className="flex items-end gap-4 -mt-10">
              {/* Avatar */}
              <div className="shrink-0">
                {profil.foto ? (
                  <img src={profil.foto} alt={profil.ad} className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-stone-200 border-4 border-white shadow-md flex items-center justify-center">
                    <span className="text-2xl text-stone-500 font-bold">{profil.ad[0]}{profil.soyad[0]}</span>
                  </div>
                )}
              </div>
              {/* İsim — banner'ın dışında */}
              <div className="pb-1 flex-1 min-w-0">
                <h2 className="text-xl font-bold text-stone-800 truncate">{profil.ad} {profil.soyad}</h2>
                <p className="text-sm text-stone-500">{profil.email}</p>
              </div>
              <span className="text-xs text-stone-600 bg-stone-100 px-3 py-1 rounded-full font-medium shrink-0 mb-1">{profil.kullaniciTuru}</span>
            </div>

            {/* Fotoğraf değiştir — açık buton */}
            <button onClick={handleFotoSec} disabled={fotoYukleniyor}
              className="mt-3 text-xs text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
              {fotoYukleniyor ? "Yükleniyor..." : profil.foto ? "Fotoğrafı Değiştir" : "Fotoğraf Ekle"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoYukle} />
          </div>
        </div>

        {/* KİŞİSEL BİLGİLER */}
        <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-700">Kişisel Bilgiler</span>
            <button onClick={() => setShowTalepModal(true)}
              className="text-xs text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-medium transition">
              Değişiklik Talep Et
            </button>
          </div>
          <div className="p-4 md:p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <BilgiSatir label="Ad" value={profil.ad} />
              <BilgiSatir label="Soyad" value={profil.soyad} />
              <BilgiSatir label="E-posta" value={profil.email} />
              <BilgiSatir label="Telefon" value={profil.telefon || "—"} />
              <BilgiSatir label="Doğum Tarihi" value={formatTarih(profil.dogumGunu || "")} />
              <BilgiSatir label="İşe Başlama" value={formatTarih(profil.iseBaslama)} />
              <BilgiSatir label="Sicil No" value={profil.sicilNo || "—"} />
              <BilgiSatir label="Çalışma Saati" value={profil.calismaSaati || "—"} />
              <BilgiSatir label="Rol" value={profil.kullaniciTuru} />
              <BilgiSatir label="Durum" value={profil.aktif ? "Aktif" : "Pasif"} />
            </div>

            {profil.grupEtiketleri && profil.grupEtiketleri.length > 0 && (
              <div className="mt-4 pt-3 border-t border-stone-100">
                <p className="text-xs text-stone-500 mb-2">Grup Etiketleri</p>
                <div className="flex flex-wrap gap-1.5">
                  {profil.grupEtiketleri.map(g => (
                    <span key={g} className="bg-stone-100 text-stone-600 text-xs px-2.5 py-1 rounded-full font-medium">{g}</span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-stone-400 mt-4 pt-3 border-t border-stone-100">
              Bilgilerinizi değiştirmek için "Değişiklik Talep Et" butonunu kullanın. Talebiniz kurucuya iletilecektir.
            </p>
          </div>
        </div>

        {/* TALEPLERİM */}
        {talepler.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-stone-100">
              <span className="text-sm font-semibold text-stone-700">Değişiklik Taleplerim</span>
            </div>
            <div className="p-4 md:p-5 space-y-2">
              {talepler.slice(0, 5).map(talep => (
                <div key={talep.id} className={`rounded-lg p-3 border ${
                  talep.durum === "bekliyor" ? "bg-amber-50/50 border-amber-200" :
                  talep.durum === "onaylandi" ? "bg-emerald-50/50 border-emerald-200" : "bg-red-50/50 border-red-200"
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      talep.durum === "bekliyor" ? "bg-amber-100 text-amber-700" :
                      talep.durum === "onaylandi" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}>
                      {talep.durum === "bekliyor" ? "Bekliyor" : talep.durum === "onaylandi" ? "Onaylandı" : "Reddedildi"}
                    </span>
                    <span className="text-[10px] text-stone-400">{formatTimestamp(talep.createdAt)}</span>
                  </div>
                  <div className="space-y-1">
                    {talep.degisiklikler.map((d, i) => (
                      <p key={i} className="text-xs text-stone-600">
                        <span className="font-medium">{d.alan}:</span> {d.mevcutDeger || "—"} → <span className="font-semibold text-stone-800">{d.yeniDeger}</span>
                      </p>
                    ))}
                  </div>
                  {talep.yanitNotu && (
                    <p className="text-[10px] text-stone-500 mt-1.5 pt-1.5 border-t border-stone-200">{talep.yanitNotu}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* TALEP MODAL */}
      {showTalepModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTalepModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-amber-400 text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
              <h3 className="font-bold text-sm">Değişiklik Talep Et</h3>
              <button onClick={() => setShowTalepModal(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-stone-500">Değiştirmek istediğiniz bilgileri belirtin. Talebiniz kurucuya onaya gönderilecektir.</p>
              {talepSatirlar.map((satir, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <select value={satir.alan}
                      onChange={(e) => { const y = [...talepSatirlar]; y[idx].alan = e.target.value; setTalepSatirlar(y); }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                      <option value="">Alan seçin...</option>
                      {alanSecenekleri.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input type="text" placeholder="Yeni değer..." value={satir.yeniDeger}
                      onChange={(e) => { const y = [...talepSatirlar]; y[idx].yeniDeger = e.target.value; setTalepSatirlar(y); }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                  {talepSatirlar.length > 1 && (
                    <button onClick={() => setTalepSatirlar(talepSatirlar.filter((_, i) => i !== idx))}
                      className="text-stone-400 hover:text-red-500 mt-2 text-sm">✕</button>
                  )}
                </div>
              ))}
              {talepSatirlar.length < 5 && (
                <button onClick={() => setTalepSatirlar([...talepSatirlar, { alan: "", yeniDeger: "" }])}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium">+ Başka bir alan ekle</button>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={handleTalepGonder} disabled={talepGonderiliyor}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {talepGonderiliyor ? "Gönderiliyor..." : "Gönder"}</button>
                <button onClick={() => setShowTalepModal(false)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-lg text-sm font-medium transition">İptal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BilgiSatir({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-stone-50/60 rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-stone-800 font-medium">{value}</p>
    </div>
  );
}
