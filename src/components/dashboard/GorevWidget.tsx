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

  const bugun = new Date().toISOString().split("T")[0];
  const aktifGorevler = gorevler.filter(g => g.durum === "bekliyor" || g.durum === "devam-ediyor");

  useEffect(() => {
    onCount?.(aktifGorevler.length);
  }, [aktifGorevler.length]);

  const gecikmisGorevler = aktifGorevler.filter(g => g.sonTarih && g.sonTarih < bugun);
  const acilGorevler = aktifGorevler.filter(g => g.oncelik === "acil");

  const oncelikAccent = (oncelik: string) => {
    switch (oncelik) {
      case "acil": return "border-l-red-400";
      case "yuksek": return "border-l-amber-400";
      case "dusuk": return "border-l-sky-300";
      default: return "border-l-stone-200";
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-stone-100 rounded"></div>
          <div className="h-3 bg-stone-100 rounded w-20"></div>
        </div>
      </div>
    );
  }

  if (aktifGorevler.length === 0) return null;

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
      <div 
        onClick={() => navigate("/gorevler")}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition border-b border-stone-50"
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
          <span className="text-xs font-semibold text-stone-700">Görevlerim</span>
          <span className="text-[10px] text-stone-400">{aktifGorevler.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {gecikmisGorevler.length > 0 && (
            <span className="text-[10px] text-red-500 font-medium animate-pulse">{gecikmisGorevler.length} gecikmiş</span>
          )}
          {acilGorevler.length > 0 && gecikmisGorevler.length === 0 && (
            <span className="text-[10px] text-red-400 font-medium">{acilGorevler.length} acil</span>
          )}
          <span className="text-stone-300 text-xs">→</span>
        </div>
      </div>

      <div className="divide-y divide-stone-50">
        {aktifGorevler.slice(0, 4).map((gorev) => (
          <div
            key={gorev.id}
            onClick={() => navigate("/gorevler")}
            className={`px-3 py-2 cursor-pointer hover:bg-stone-50 transition border-l-2 ${oncelikAccent(gorev.oncelik)}`}
          >
            <p className="text-xs font-medium text-stone-700 truncate">{gorev.baslik}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] ${
                gorev.durum === "devam-ediyor" ? "text-sky-500" : "text-stone-400"
              }`}>
                {gorev.durum === "devam-ediyor" ? "Devam" : "Bekliyor"}
              </span>
              {gorev.sonTarih && (
                <span className={`text-[10px] ${gorev.sonTarih < bugun ? "text-red-400" : "text-stone-400"}`}>
                  {gorev.sonTarih < bugun ? "Gecikmiş" : new Date(gorev.sonTarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {!gorev.otomatikMi && <span className="text-[10px] text-stone-300">{gorev.atayanAd}</span>}
            </div>
          </div>
        ))}
      </div>

      {aktifGorevler.length > 4 && (
        <div 
          onClick={() => navigate("/gorevler")}
          className="px-3 py-1.5 text-center text-[10px] text-stone-400 hover:bg-stone-50 cursor-pointer transition border-t border-stone-50"
        >
          +{aktifGorevler.length - 4} görev daha
        </div>
      )}
    </div>
  );
}
