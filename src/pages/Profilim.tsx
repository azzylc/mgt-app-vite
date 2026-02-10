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

      try {
        const kurucuQ = query(collection(db, "personnel"), where("kullaniciTuru", "==", "Kurucu"), where("aktif", "==", true));
        const kurucuSnap = await getDocs(kurucuQ);
        const alicilar = kurucuSnap.docs.map(d => d.data().email as string).filter(email => email && email !== user?.email);
        if (alicilar.length > 0) {
          bildirimYazCoklu(alicilar, {
            baslik: "Profil Değişiklik Talebi",
            mesaj: `${profil?.ad} ${profil?.soyad} profil bilgilerinde değişiklik talep etti`,
            tip: "sistem", route: "/talepler-merkezi",
            gonderen: user?.email || "", gonderenAd: `${profil?.ad} ${profil?.soyad}`,
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

  const calismaYili = () => {
    if (!profil?.iseBaslama) return null;
    const baslangic = new Date(profil.iseBaslama);
    const simdi = new Date();
    const yil = simdi.getFullYear() - baslangic.getFullYear();
    const ay = simdi.getMonth() - baslangic.getMonth();
    const toplam = yil + (ay < 0 ? -1 : 0);
    if (toplam < 1) return "1 yıldan az";
    return `${toplam} yıl`;
  };

  if (loading) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400"></div></div>);
  }
  if (!profil) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-stone-500">Profil bilgileri bulunamadı</p></div>);
  }

  const rolRenk = profil.kullaniciTuru === "Kurucu" ? "bg-amber-400 text-amber-900" : profil.kullaniciTuru === "Yönetici" ? "bg-sky-100 text-sky-700" : "bg-stone-100 text-stone-600";

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-lg md:text-xl font-bold text-stone-800">Profilim</h1>
      </header>

      <main className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">

        {/* === PROFİL KARTI === */}
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
          <div className="p-6 flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative group mb-4">
              {profil.foto ? (
                <img src={profil.foto} alt={profil.ad}
                  className="w-24 h-24 rounded-2xl object-cover shadow-sm ring-2 ring-stone-100" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-300 to-rose-400 shadow-sm flex items-center justify-center">
                  <span className="text-3xl text-white font-bold tracking-tight">{profil.ad[0]}{profil.soyad[0]}</span>
                </div>
              )}
              <button onClick={handleFotoSec} disabled={fotoYukleniyor}
                className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all cursor-pointer">
                <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoYukle} />
            </div>

            <h2 className="text-xl font-bold text-stone-900 tracking-tight">{profil.ad} {profil.soyad}</h2>
            <p className="text-sm text-stone-400 mt-0.5">{profil.email}</p>

            <div className="flex items-center gap-2 mt-3">
              <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${rolRenk}`}>{profil.kullaniciTuru}</span>
              {profil.aktif && <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">Aktif</span>}
            </div>

            {/* Mini istatistikler */}
            <div className="flex items-center gap-6 mt-5 pt-5 border-t border-stone-100 w-full justify-center">
              {calismaYili() && (
                <div className="text-center">
                  <p className="text-lg font-bold text-stone-800">{calismaYili()}</p>
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-0.5">Kıdem</p>
                </div>
              )}
              {profil.grupEtiketleri && profil.grupEtiketleri.length > 0 && (
                <div className="text-center">
                  <p className="text-lg font-bold text-stone-800">{profil.grupEtiketleri.length}</p>
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-0.5">Grup</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-lg font-bold text-stone-800">{profil.calismaSaati || "—"}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-0.5">Mesai</p>
              </div>
            </div>

            <button onClick={handleFotoSec} disabled={fotoYukleniyor}
              className="mt-4 text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500 transition">
              {fotoYukleniyor ? "Yükleniyor..." : profil.foto ? "Fotoğrafı değiştir" : "Fotoğraf yükle"}
            </button>
          </div>
        </div>

        {/* === KİŞİSEL BİLGİLER === */}
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-800">Kişisel Bilgiler</span>
            <button onClick={() => setShowTalepModal(true)}
              className="text-[11px] text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-medium transition">
              Değişiklik Talep Et
            </button>
          </div>
          <div className="divide-y divide-stone-50">
            <InfoRow label="Ad Soyad" value={`${profil.ad} ${profil.soyad}`} />
            <InfoRow label="E-posta" value={profil.email} />
            <InfoRow label="Telefon" value={profil.telefon || "—"} />
            <InfoRow label="Doğum Tarihi" value={formatTarih(profil.dogumGunu || "")} />
            <InfoRow label="İşe Başlama" value={formatTarih(profil.iseBaslama)} />
            <InfoRow label="Sicil No" value={profil.sicilNo || "—"} />
            <InfoRow label="Çalışma Saati" value={profil.calismaSaati || "—"} />
            <InfoRow label="Rol" value={profil.kullaniciTuru} />
          </div>

          {profil.grupEtiketleri && profil.grupEtiketleri.length > 0 && (
            <div className="px-5 py-3 border-t border-stone-100">
              <p className="text-[11px] text-stone-400 mb-2">Gruplar</p>
              <div className="flex flex-wrap gap-1.5">
                {profil.grupEtiketleri.map(g => (
                  <span key={g} className="bg-stone-100 text-stone-600 text-[11px] px-2.5 py-0.5 rounded-full font-medium">{g}</span>
                ))}
              </div>
            </div>
          )}

          <div className="px-5 py-3 bg-stone-50/50 border-t border-stone-100">
            <p className="text-[10px] text-stone-400">
              Bilgilerinizi değiştirmek için "Değişiklik Talep Et" butonunu kullanın. Talebiniz kurucuya iletilecektir.
            </p>
          </div>
        </div>

        {/* === TALEPLERİM === */}
        {talepler.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-800">Taleplerim</span>
              <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{talepler.length}</span>
            </div>
            <div className="p-4 space-y-2.5">
              {talepler.slice(0, 5).map(talep => (
                <div key={talep.id} className={`rounded-xl p-3.5 border ${
                  talep.durum === "bekliyor" ? "bg-amber-50/30 border-amber-100" :
                  talep.durum === "onaylandi" ? "bg-emerald-50/30 border-emerald-100" : "bg-red-50/30 border-red-100"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      talep.durum === "bekliyor" ? "bg-amber-100 text-amber-700" :
                      talep.durum === "onaylandi" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}>
                      {talep.durum === "bekliyor" ? "Bekliyor" : talep.durum === "onaylandi" ? "Onaylandı" : "Reddedildi"}
                    </span>
                    <span className="text-[10px] text-stone-400">{formatTimestamp(talep.createdAt)}</span>
                  </div>
                  {talep.degisiklikler.map((d, i) => (
                    <p key={i} className="text-xs text-stone-600">
                      <span className="font-medium text-stone-500">{d.alan}:</span>{" "}
                      <span className="text-stone-400 line-through">{d.mevcutDeger || "—"}</span>{" → "}
                      <span className="font-semibold text-stone-800">{d.yeniDeger}</span>
                    </p>
                  ))}
                  {talep.yanitNotu && (
                    <p className="text-[10px] text-stone-500 mt-2 pt-2 border-t border-stone-200/60">{talep.yanitNotu}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* === TALEP MODAL === */}
      {showTalepModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowTalepModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-bold text-stone-800">Değişiklik Talep Et</h3>
              <button onClick={() => setShowTalepModal(false)} className="text-stone-400 hover:text-stone-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-stone-500">Değiştirmek istediğiniz bilgileri belirtin. Talebiniz kurucuya onaya gönderilecektir.</p>
              {talepSatirlar.map((satir, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <select value={satir.alan}
                      onChange={(e) => { const y = [...talepSatirlar]; y[idx].alan = e.target.value; setTalepSatirlar(y); }}
                      className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-stone-50/50">
                      <option value="">Alan seçin...</option>
                      {alanSecenekleri.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input type="text" placeholder="Yeni değer..." value={satir.yeniDeger}
                      onChange={(e) => { const y = [...talepSatirlar]; y[idx].yeniDeger = e.target.value; setTalepSatirlar(y); }}
                      className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-stone-50/50" />
                  </div>
                  {talepSatirlar.length > 1 && (
                    <button onClick={() => setTalepSatirlar(talepSatirlar.filter((_, i) => i !== idx))}
                      className="text-stone-300 hover:text-red-400 mt-2.5 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
              {talepSatirlar.length < 5 && (
                <button onClick={() => setTalepSatirlar([...talepSatirlar, { alan: "", yeniDeger: "" }])}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium">+ Başka bir alan ekle</button>
              )}
              <div className="flex gap-3 pt-3">
                <button onClick={handleTalepGonder} disabled={talepGonderiliyor}
                  className="flex-1 bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                  {talepGonderiliyor ? "Gönderiliyor..." : "Gönder"}</button>
                <button onClick={() => setShowTalepModal(false)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-xl text-sm font-medium transition">İptal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-stone-50/50 transition">
      <span className="text-xs text-stone-400 font-medium">{label}</span>
      <span className="text-sm text-stone-800 font-medium text-right">{value}</span>
    </div>
  );
}
