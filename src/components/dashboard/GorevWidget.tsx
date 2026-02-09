import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
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
  olusturulmaTarihi: any;
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
  const aktifGorevler = gorevler.filter(g => g.durum === "bekliyor" || g.durum === "devam-ediyor");

  useEffect(() => {
    onCount?.(aktifGorevler.length);
  }, [aktifGorevler.length]);

  const gecikmisGorevler = aktifGorevler.filter(g => g.sonTarih && g.sonTarih < bugun);
  const acilGorevler = aktifGorevler.filter(g => g.oncelik === "acil");

  const oncelikAccent = (oncelik: string) => {
    switch (oncelik) {
      case "acil": return "border-l-red-400 bg-red-50/30";
      case "yuksek": return "border-l-amber-400 bg-amber-50/30";
      case "dusuk": return "border-l-sky-300 bg-sky-50/20";
      default: return "border-l-stone-200 bg-stone-50/60";
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-stone-100 p-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-stone-100 rounded"></div>
          <div className="h-3 bg-stone-100 rounded w-20"></div>
        </div>
      </div>
    );
  }

  if (aktifGorevler.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
        <div 
          onClick={() => navigate("/gorevler")}
          className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition border-b border-stone-100"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <span className="text-xs font-semibold text-stone-700">Görevlerim</span>
            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">0</span>
          </div>
          <span className="text-stone-300 text-xs">Tümü →</span>
        </div>
        <div className="px-4 py-6 text-center">
          <span className="text-2xl block mb-1">🥳</span>
          <p className="text-xs font-medium text-stone-600">Tüm görevleri tamamladın!</p>
          <p className="text-[10px] text-stone-400 mt-0.5">Aktif görevin yok, harika iş</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
      <div 
        onClick={() => navigate("/gorevler")}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition border-b border-stone-100"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📋</span>
          <span className="text-xs font-semibold text-stone-700">Görevlerim</span>
          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">{aktifGorevler.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {gecikmisGorevler.length > 0 && (
            <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
              ⚠️ {gecikmisGorevler.length} gecikmiş
            </span>
          )}
          {acilGorevler.length > 0 && gecikmisGorevler.length === 0 && (
            <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">
              🔴 {acilGorevler.length} acil
            </span>
          )}
          <span className="text-stone-300 text-xs">Tümü →</span>
        </div>
      </div>

      {gecikmisGorevler.length > 0 && (
        <div className="px-3 py-1.5 bg-red-50 border-b border-red-100">
          <p className="text-[10px] text-red-600 font-medium">⚠️ {gecikmisGorevler.length} görevin son tarihi geçmiş!</p>
        </div>
      )}

      <div className="divide-y divide-stone-50">
        {aktifGorevler.slice(0, 4).map((gorev) => (
          <div
            key={gorev.id}
            onClick={() => navigate("/gorevler")}
            className={`px-3 py-2 cursor-pointer hover:bg-amber-50/40 transition border-l-2 ${oncelikAccent(gorev.oncelik)}`}
          >
            <p className="text-xs font-medium text-stone-700 truncate">{gorev.baslik}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                gorev.durum === "devam-ediyor" 
                  ? "bg-blue-50 text-blue-600" 
                  : "bg-yellow-50 text-yellow-600"
              }`}>
                {gorev.durum === "devam-ediyor" ? "Devam" : "Bekliyor"}
              </span>
              {gorev.sonTarih && (
                <span className={`text-[10px] ${gorev.sonTarih < bugun ? "text-red-500 font-medium" : "text-stone-400"}`}>
                  {gorev.sonTarih < bugun ? "⚠️ Gecikmiş" : `📅 ${new Date(gorev.sonTarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`}
                </span>
              )}
              {!gorev.otomatikMi && <span className="text-[10px] text-stone-400">👤 {gorev.atayanAd}</span>}
            </div>
          </div>
        ))}
      </div>

      {aktifGorevler.length > 4 && (
        <div 
          onClick={() => navigate("/gorevler")}
          className="px-3 py-1.5 text-center text-[10px] text-amber-500 hover:bg-amber-50/50 cursor-pointer transition border-t border-stone-100 font-medium"
        >
          +{aktifGorevler.length - 4} görev daha →
        </div>
      )}
    </div>
  );
}
