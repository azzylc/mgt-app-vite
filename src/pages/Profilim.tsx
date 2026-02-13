import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { collection, doc, getDocs, updateDoc, addDoc, serverTimestamp, query, where, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
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
  createdAt: Timestamp | Date;
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
      // 1. Dosyayı base64'e çevir
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error("Dosya okunamadı"));
        reader.readAsDataURL(file);
      });

      // 2. Resmi yeniden boyutlandır
      const resized = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const MAX = 200;
            let w = img.width, h = img.height;
            if (w > h) { h = (h / w) * MAX; w = MAX; } else { w = (w / h) * MAX; h = MAX; }
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
          } catch (err) { reject(err); }
        };
        img.onerror = () => reject(new Error("Resim yüklenemedi"));
        img.src = base64;
      });

      // 3. Firestore'a kaydet
      await updateDoc(doc(db, "personnel", personelDocId), { foto: resized });
      setProfil(prev => prev ? { ...prev, foto: resized } : null);
    } catch (err) {
      console.error("Fotoğraf yükleme hatası:", err);
      Sentry.captureException(err);
      alert("Fotoğraf yüklenemedi! Hata: " + String(err));
    } finally {
      setFotoYukleniyor(false);
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

  const formatTimestamp = (ts: Timestamp | Date | null | undefined) => {
    if (!ts) return "";
    const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts as Date);
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
    return (<div className="min-h-screen flex items-center justify-center bg-white"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8FAF9A]"></div></div>);
  }
  if (!profil) {
    return (<div className="min-h-screen flex items-center justify-center bg-white"><p className="text-[#8A8A8A]">Profil bilgileri bulunamadı</p></div>);
  }

  const rolRenk = profil.kullaniciTuru === "Kurucu" ? "bg-[#8FAF9A] text-[#2F2F2F]" : profil.kullaniciTuru === "Yönetici" ? "bg-sky-100 text-sky-700" : "bg-[#F7F7F7] text-[#2F2F2F]";

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
        <h1 className="text-lg md:text-xl font-bold text-[#2F2F2F]">Profilim</h1>
      </header>

      <main className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">

        {/* === PROFİL KARTI === */}
        <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm overflow-hidden">
          <div className="p-6 flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative group mb-4">
              {profil.foto ? (
                <img src={profil.foto} alt={profil.ad}
                  className="w-24 h-24 rounded-2xl object-cover shadow-sm ring-2 ring-[#E5E5E5]" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#8FAF9A] to-rose-400 shadow-sm flex items-center justify-center">
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

            <h2 className="text-xl font-bold text-[#2F2F2F] tracking-tight">{profil.ad} {profil.soyad}</h2>
            <p className="text-sm text-[#8A8A8A] mt-0.5">{profil.email}</p>

            <div className="flex items-center gap-2 mt-3">
              <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${rolRenk}`}>{profil.kullaniciTuru}</span>
              {profil.aktif && <span className="text-[11px] text-[#8FAF9A] bg-[#EAF2ED] px-2.5 py-1 rounded-full font-medium">Aktif</span>}
            </div>

            {/* Mini istatistikler */}
            <div className="flex items-center gap-6 mt-5 pt-5 border-t border-[#E5E5E5] w-full justify-center">
              {calismaYili() && (
                <div className="text-center">
                  <p className="text-lg font-bold text-[#2F2F2F]">{calismaYili()}</p>
                  <p className="text-[10px] text-[#8A8A8A] uppercase tracking-wider mt-0.5">Kıdem</p>
                </div>
              )}
              {profil.grupEtiketleri && profil.grupEtiketleri.length > 0 && (
                <div className="text-center">
                  <p className="text-lg font-bold text-[#2F2F2F]">{profil.grupEtiketleri.length}</p>
                  <p className="text-[10px] text-[#8A8A8A] uppercase tracking-wider mt-0.5">Grup</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-lg font-bold text-[#2F2F2F]">{profil.calismaSaati || "—"}</p>
                <p className="text-[10px] text-[#8A8A8A] uppercase tracking-wider mt-0.5">Mesai</p>
              </div>
            </div>

            <button onClick={handleFotoSec} disabled={fotoYukleniyor}
              className="mt-4 text-xs text-[#8A8A8A] hover:text-[#2F2F2F] underline underline-offset-2 decoration-[#E5E5E5] hover:decoration-[#8A8A8A] transition">
              {fotoYukleniyor ? "Yükleniyor..." : profil.foto ? "Fotoğrafı değiştir" : "Fotoğraf yükle"}
            </button>
          </div>
        </div>

        {/* === KİŞİSEL BİLGİLER === */}
        <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E5E5] flex items-center justify-between">
            <span className="text-sm font-semibold text-[#2F2F2F]">Kişisel Bilgiler</span>
            <button onClick={() => setShowTalepModal(true)}
              className="text-[11px] text-[#8FAF9A] hover:text-[#2F2F2F] bg-[#EAF2ED] hover:bg-[#EAF2ED] px-3 py-1.5 rounded-lg font-medium transition">
              Değişiklik Talep Et
            </button>
          </div>
          <div className="divide-y divide-[#E5E5E5]/50">
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
            <div className="px-5 py-3 border-t border-[#E5E5E5]">
              <p className="text-[11px] text-[#8A8A8A] mb-2">Gruplar</p>
              <div className="flex flex-wrap gap-1.5">
                {profil.grupEtiketleri.map(g => (
                  <span key={g} className="bg-[#F7F7F7] text-[#2F2F2F] text-[11px] px-2.5 py-0.5 rounded-full font-medium">{g}</span>
                ))}
              </div>
            </div>
          )}

          <div className="px-5 py-3 bg-[#F7F7F7] border-t border-[#E5E5E5]">
            <p className="text-[10px] text-[#8A8A8A]">
              Bilgilerinizi değiştirmek için "Değişiklik Talep Et" butonunu kullanın. Talebiniz kurucuya iletilecektir.
            </p>
          </div>
        </div>

        {/* === TALEPLERİM === */}
        {talepler.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E5E5]/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E5E5E5] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#2F2F2F]">Taleplerim</span>
              <span className="text-[10px] text-[#8A8A8A] bg-[#F7F7F7] px-2 py-0.5 rounded-full">{talepler.length}</span>
            </div>
            <div className="p-4 space-y-2.5">
              {talepler.slice(0, 5).map(talep => (
                <div key={talep.id} className={`rounded-xl p-3.5 border ${
                  talep.durum === "bekliyor" ? "bg-[#EAF2ED] border-[#EAF2ED]" :
                  talep.durum === "onaylandi" ? "bg-[#EAF2ED]/30 border-[#EAF2ED]" : "bg-[#D96C6C]/10 border-[#D96C6C]/20"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      talep.durum === "bekliyor" ? "bg-[#EAF2ED] text-[#2F2F2F]" :
                      talep.durum === "onaylandi" ? "bg-[#EAF2ED] text-[#8FAF9A]" : "bg-[#D96C6C]/20 text-[#D96C6C]"
                    }`}>
                      {talep.durum === "bekliyor" ? "Bekliyor" : talep.durum === "onaylandi" ? "Onaylandı" : "Reddedildi"}
                    </span>
                    <span className="text-[10px] text-[#8A8A8A]">{formatTimestamp(talep.createdAt)}</span>
                  </div>
                  {talep.degisiklikler.map((d, i) => (
                    <p key={i} className="text-xs text-[#2F2F2F]">
                      <span className="font-medium text-[#8A8A8A]">{d.alan}:</span>{" "}
                      <span className="text-[#8A8A8A] line-through">{d.mevcutDeger || "—"}</span>{" → "}
                      <span className="font-semibold text-[#2F2F2F]">{d.yeniDeger}</span>
                    </p>
                  ))}
                  {talep.yanitNotu && (
                    <p className="text-[10px] text-[#8A8A8A] mt-2 pt-2 border-t border-[#E5E5E5]/60">{talep.yanitNotu}</p>
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
            <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
              <h3 className="font-bold text-[#2F2F2F]">Değişiklik Talep Et</h3>
              <button onClick={() => setShowTalepModal(false)} className="text-[#8A8A8A] hover:text-[#2F2F2F] transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-[#8A8A8A]">Değiştirmek istediğiniz bilgileri belirtin. Talebiniz kurucuya onaya gönderilecektir.</p>
              {talepSatirlar.map((satir, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <select value={satir.alan}
                      onChange={(e) => { const y = [...talepSatirlar]; y[idx].alan = e.target.value; setTalepSatirlar(y); }}
                      className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] focus:border-transparent bg-[#F7F7F7]">
                      <option value="">Alan seçin...</option>
                      {alanSecenekleri.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input type="text" placeholder="Yeni değer..." value={satir.yeniDeger}
                      onChange={(e) => { const y = [...talepSatirlar]; y[idx].yeniDeger = e.target.value; setTalepSatirlar(y); }}
                      className="w-full px-3 py-2.5 border border-[#E5E5E5] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8FAF9A] focus:border-transparent bg-[#F7F7F7]" />
                  </div>
                  {talepSatirlar.length > 1 && (
                    <button onClick={() => setTalepSatirlar(talepSatirlar.filter((_, i) => i !== idx))}
                      className="text-[#8A8A8A] hover:text-[#D96C6C] mt-2.5 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
              {talepSatirlar.length < 5 && (
                <button onClick={() => setTalepSatirlar([...talepSatirlar, { alan: "", yeniDeger: "" }])}
                  className="text-xs text-[#8FAF9A] hover:text-[#2F2F2F] font-medium">+ Başka bir alan ekle</button>
              )}
              <div className="flex gap-3 pt-3">
                <button onClick={handleTalepGonder} disabled={talepGonderiliyor}
                  className="flex-1 bg-[#2F2F2F] hover:bg-[#2F2F2F] text-white py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                  {talepGonderiliyor ? "Gönderiliyor..." : "Gönder"}</button>
                <button onClick={() => setShowTalepModal(false)}
                  className="flex-1 bg-[#F7F7F7] hover:bg-[#E5E5E5] text-[#2F2F2F] py-2.5 rounded-xl text-sm font-medium transition">İptal</button>
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
    <div className="flex items-center justify-between px-5 py-3 hover:bg-[#F7F7F7] transition">
      <span className="text-xs text-[#8A8A8A] font-medium">{label}</span>
      <span className="text-sm text-[#2F2F2F] font-medium text-right">{value}</span>
    </div>
  );
}
