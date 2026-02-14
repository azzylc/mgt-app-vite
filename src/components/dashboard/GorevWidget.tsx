import { useState, useEffect } from "react";
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
  atayanAd: string;
  olusturulmaTarihi: Timestamp | Date | string;
}

export default function GorevWidget({ onCount }: { onCount?: (count: number) => void }) {
  const user = useAuth();
  const navigate = useNavigate();
  const [gorevler, setGorevler] = useState<GorevItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "gorevler"),
      where("atanan", "==", user.email),
      orderBy("olusturulmaTarihi", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as GorevItem));
      setGorevler(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const bugun = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const aktifGorevler = gorevler.filter(g => (g.durum === "bekliyor" || g.durum === "devam-ediyor") && !g.otomatikMi);

  useEffect(() => {
    onCount?.(aktifGorevler.length);
  }, [aktifGorevler.length]);

  const gecikmisGorevler = aktifGorevler.filter(g => g.sonTarih && g.sonTarih < bugun);
  const acilGorevler = aktifGorevler.filter(g => g.oncelik === "acil");

  const oncelikAccent = (oncelik: string) => {
    switch (oncelik) {
      case "acil": return "border-l-[#D96C6C] bg-[#D96C6C]/10";
      case "yuksek": return "border-l-[#E6B566] bg-[#EAF2ED]";
      case "dusuk": return "border-l-sky-300 bg-sky-50/20";
      default: return "border-l-[#E5E5E5] bg-[#F7F7F7]";
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-[#F7F7F7] rounded"></div>
          <div className="h-3 bg-[#F7F7F7] rounded w-20"></div>
        </div>
      </div>
    );
  }

  if (aktifGorevler.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
        <div 
          onClick={() => navigate("/gorevler")}
          className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#F7F7F7] transition border-b border-[#E5E5E5]"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <span className="text-xs font-semibold text-[#2F2F2F]">Görevlerim</span>
            <span className="text-[10px] text-[#8FAF9A] bg-[#EAF2ED] px-1.5 py-0.5 rounded-full font-medium">0</span>
          </div>
          <span className="text-[#8A8A8A] text-xs">Tümü →</span>
        </div>
        <div className="px-4 py-6 text-center">
          <span className="text-2xl block mb-1">🥳</span>
          <p className="text-xs font-medium text-[#2F2F2F]">Tüm görevleri tamamladın!</p>
          <p className="text-[10px] text-[#8A8A8A] mt-0.5">Aktif görevin yok, harika iş</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
      <div 
        onClick={() => navigate("/gorevler")}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#F7F7F7] transition border-b border-[#E5E5E5]"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📋</span>
          <span className="text-xs font-semibold text-[#2F2F2F]">Görevlerim</span>
          <span className="text-[10px] text-[#8FAF9A] bg-[#EAF2ED] px-1.5 py-0.5 rounded-full font-medium">{aktifGorevler.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {gecikmisGorevler.length > 0 && (
            <span className="text-[10px] text-[#D96C6C] bg-[#D96C6C]/10 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
              ⚠️ {gecikmisGorevler.length} gecikmiş
            </span>
          )}
          {acilGorevler.length > 0 && gecikmisGorevler.length === 0 && (
            <span className="text-[10px] text-[#D96C6C] bg-[#D96C6C]/10 px-1.5 py-0.5 rounded-full font-medium">
              🔴 {acilGorevler.length} acil
            </span>
          )}
          <span className="text-[#8A8A8A] text-xs">Tümü →</span>
        </div>
      </div>

      {gecikmisGorevler.length > 0 && (
        <div className="px-3 py-1.5 bg-[#D96C6C]/10 border-b border-[#D96C6C]/20">
          <p className="text-[10px] text-[#D96C6C] font-medium">⚠️ {gecikmisGorevler.length} görevin son tarihi geçmiş!</p>
        </div>
      )}

      <div className="space-y-1.5 p-2.5">
        {aktifGorevler.slice(0, 4).map((gorev) => (
          <div
            key={gorev.id}
            onClick={() => navigate("/gorevler")}
            className={`px-3 py-2 cursor-pointer hover:bg-[#EAF2ED] transition border-l-2 ${oncelikAccent(gorev.oncelik)}`}
          >
            <p className="text-xs font-medium text-[#2F2F2F] truncate">{gorev.baslik}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                gorev.durum === "devam-ediyor" 
                  ? "bg-blue-50 text-blue-600" 
                  : "bg-[#E6B566]/10 text-[#E6B566]"
              }`}>
                {gorev.durum === "devam-ediyor" ? "Devam" : "Bekliyor"}
              </span>
              {gorev.sonTarih && (
                <span className={`text-[10px] ${gorev.sonTarih < bugun ? "text-[#D96C6C] font-medium" : "text-[#8A8A8A]"}`}>
                  {gorev.sonTarih < bugun ? "⚠️ Gecikmiş" : `📅 ${new Date(gorev.sonTarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`}
                </span>
              )}
              {!gorev.otomatikMi && <span className="text-[10px] text-[#8A8A8A]">👤 {gorev.atayanAd}</span>}
            </div>
          </div>
        ))}
      </div>

      {aktifGorevler.length > 4 && (
        <div 
          onClick={() => navigate("/gorevler")}
          className="px-3 py-1.5 text-center text-[10px] text-[#E6B566] hover:bg-[#EAF2ED] cursor-pointer transition border-t border-[#E5E5E5] font-medium"
        >
          +{aktifGorevler.length - 4} görev daha →
        </div>
      )}
    </div>
  );
}
