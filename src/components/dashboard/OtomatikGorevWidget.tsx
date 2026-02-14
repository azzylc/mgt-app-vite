import { useState, useEffect, useMemo } from "react";
import { db } from "../../lib/firebase";
import { collection, query, where, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/RoleProvider";

interface GorevItem {
  id: string;
  baslik: string;
  aciklama: string;
  durum: string;
  oncelik: string;
  sonTarih?: string;
  otomatikMi?: boolean;
  gorevTuru?: string;
  gelinBilgi?: { isim: string; tarih: string };
  firma?: string;
  olusturulmaTarihi: Timestamp | Date | string;
}

const gorevTuruLabel: Record<string, { icon: string; label: string }> = {
  yorumIstesinMi: { icon: "📝", label: "Yorum İstensin" },
  paylasimIzni: { icon: "📸", label: "Paylaşım İzni" },
  yorumIstendiMi: { icon: "💬", label: "Yorum İstendi" },
  odemeTakip: { icon: "💰", label: "Ödeme Takip" },
};

export default function OtomatikGorevWidget() {
  const user = useAuth();
  const navigate = useNavigate();
  const [gorevler, setGorevler] = useState<GorevItem[]>([]);
  const [ortakGorevler, setOrtakGorevler] = useState<GorevItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Kişisel otomatik görevler
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "gorevler"),
      where("atanan", "==", user.email),
      orderBy("olusturulmaTarihi", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGorevler(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GorevItem)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Ortak görevler
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "gorevler"),
      where("atananlar", "array-contains", user.email),
      orderBy("olusturulmaTarihi", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrtakGorevler(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GorevItem)));
    });
    return () => unsubscribe();
  }, [user]);

  // Birleştir + sadece otomatik olanları al
  const otomatikGorevler = useMemo(() => {
    const map = new Map<string, GorevItem>();
    gorevler.forEach(g => { if (g.otomatikMi) map.set(g.id, g); });
    ortakGorevler.forEach(g => { if (g.otomatikMi) map.set(g.id, g); });
    return Array.from(map.values());
  }, [gorevler, ortakGorevler]);

  const aktifGorevler = otomatikGorevler.filter(g => g.durum !== "tamamlandi");

  // Tür bazlı sayaçlar
  const turSayilari = useMemo(() => {
    const sayilar: Record<string, number> = {};
    aktifGorevler.forEach(g => {
      const tur = g.gorevTuru || "diger";
      sayilar[tur] = (sayilar[tur] || 0) + 1;
    });
    return sayilar;
  }, [aktifGorevler]);

  const handleClick = () => {
    navigate("/gorevler");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("setGorevSekme", { detail: "otomatik" }));
    }, 100);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden flex flex-col h-full">
        <div className="px-3 py-2 border-b border-[#E5E5E5] flex items-center gap-2 bg-gradient-to-r from-purple-50/40 to-transparent">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-semibold text-[#2F2F2F]">Otomatik Görevler</span>
        </div>
        <div className="p-4 flex-1 flex items-center justify-center">
          <div className="animate-pulse text-xs text-[#8A8A8A]">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden flex flex-col h-full">
      <div
        onClick={handleClick}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#F7F7F7] transition border-b border-[#E5E5E5] bg-gradient-to-r from-purple-50/40 to-transparent flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-semibold text-[#2F2F2F]">Otomatik Görevler</span>
          <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-medium">{aktifGorevler.length}</span>
        </div>
        <span className="text-[#8A8A8A] text-xs">Tümü →</span>
      </div>

      {aktifGorevler.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <span className="text-2xl block mb-1">✅</span>
            <p className="text-xs font-medium text-[#2F2F2F]">Otomatik görev yok</p>
            <p className="text-[10px] text-[#8A8A8A] mt-0.5">Tüm alanlar dolu!</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Tür bazlı özet */}
          <div className="px-2.5 pt-2.5 pb-1 flex flex-wrap gap-1.5">
            {Object.entries(turSayilari).map(([tur, sayi]) => {
              const info = gorevTuruLabel[tur] || { icon: "📋", label: tur };
              return (
                <span key={tur} className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  {info.icon} {info.label} ({sayi})
                </span>
              );
            })}
          </div>

          {/* Görev listesi */}
          <div className="space-y-1 p-2.5 pt-1">
            {aktifGorevler.slice(0, 4).map((gorev) => {
              const info = gorevTuruLabel[gorev.gorevTuru || ""] || { icon: "📋", label: "" };
              return (
                <div
                  key={gorev.id}
                  onClick={handleClick}
                  className="px-3 py-2 cursor-pointer hover:bg-purple-50/50 transition border-l-2 border-l-purple-300 bg-[#F7F7F7] rounded-r-lg"
                >
                  <p className="text-xs font-medium text-[#2F2F2F] truncate">{gorev.baslik}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-purple-600 font-medium">{info.icon} {info.label}</span>
                    {gorev.firma && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#F0F0F0] text-[#8A8A8A]">{gorev.firma}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {aktifGorevler.length > 4 && (
            <div
              onClick={handleClick}
              className="px-3 py-1.5 text-center text-[10px] text-purple-500 hover:bg-purple-50/50 cursor-pointer transition border-t border-[#E5E5E5] font-medium flex-shrink-0"
            >
              +{aktifGorevler.length - 4} görev daha →
            </div>
          )}
        </div>
      )}
    </div>
  );
}
