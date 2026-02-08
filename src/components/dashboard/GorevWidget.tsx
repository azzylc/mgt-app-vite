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

export default function GorevWidget() {
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
  
  // Aktif görevler (bekliyor + devam-ediyor)
  const aktifGorevler = gorevler.filter(g => g.durum === "bekliyor" || g.durum === "devam-ediyor");
  
  // Gecikmiş görevler
  const gecikmisGorevler = aktifGorevler.filter(g => g.sonTarih && g.sonTarih < bugun);
  
  // Bugün son tarihli
  const bugunSonTarih = aktifGorevler.filter(g => g.sonTarih === bugun);
  
  // Acil görevler
  const acilGorevler = aktifGorevler.filter(g => g.oncelik === "acil");

  const oncelikRenk = (oncelik: string) => {
    switch (oncelik) {
      case "acil": return "border-l-red-500 bg-red-50/50";
      case "yuksek": return "border-l-orange-500 bg-orange-50/50";
      case "dusuk": return "border-l-blue-400 bg-blue-50/30";
      default: return "border-l-stone-300 bg-white";
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-5 h-5 bg-stone-200 rounded"></div>
          <div className="h-4 bg-stone-200 rounded w-24"></div>
        </div>
      </div>
    );
  }

  // Hiç aktif görev yoksa kompakt göster
  if (aktifGorevler.length === 0) {
    return (
      <div 
        onClick={() => navigate("/gorevler")}
        className="bg-white rounded-lg border border-stone-200 p-3 flex items-center justify-between cursor-pointer hover:shadow-sm transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">✅</span>
          <span className="text-sm text-stone-500">Aktif göreviniz yok</span>
        </div>
        <span className="text-stone-400 text-xs">Görevler →</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      {/* Header */}
      <div 
        onClick={() => navigate("/gorevler")}
        className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition border-b border-stone-100"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <h3 className="font-semibold text-stone-800 text-sm">Görevlerim</h3>
          <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
            {aktifGorevler.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {gecikmisGorevler.length > 0 && (
            <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium animate-pulse">
              ⚠️ {gecikmisGorevler.length} gecikmiş
            </span>
          )}
          {acilGorevler.length > 0 && gecikmisGorevler.length === 0 && (
            <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
              🔴 {acilGorevler.length} acil
            </span>
          )}
          <span className="text-stone-400 text-xs">Tümü →</span>
        </div>
      </div>

      {/* Gecikmiş uyarı */}
      {gecikmisGorevler.length > 0 && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600 font-medium">
            ⚠️ {gecikmisGorevler.length} görevin son tarihi geçmiş!
          </p>
        </div>
      )}

      {/* Bugün son tarihli */}
      {bugunSonTarih.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700 font-medium">
            ⏰ {bugunSonTarih.length} görevin son tarihi bugün!
          </p>
        </div>
      )}

      {/* Görev listesi - max 5 tane */}
      <div className="divide-y divide-stone-50">
        {aktifGorevler.slice(0, 5).map((gorev) => (
          <div
            key={gorev.id}
            onClick={() => navigate("/gorevler")}
            className={`px-4 py-2.5 border-l-3 cursor-pointer hover:bg-stone-50 transition ${oncelikRenk(gorev.oncelik)}`}
            style={{ borderLeftWidth: "3px" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{gorev.baslik}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    gorev.durum === "devam-ediyor" ? "bg-blue-100 text-blue-600" : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {gorev.durum === "devam-ediyor" ? "🔄 Devam" : "⏳ Bekliyor"}
                  </span>
                  {gorev.sonTarih && (
                    <span className={`text-[10px] ${
                      gorev.sonTarih < bugun ? "text-red-500 font-medium" : "text-stone-400"
                    }`}>
                      {gorev.sonTarih < bugun ? "⚠️ Gecikmiş" : `⏰ ${new Date(gorev.sonTarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`}
                    </span>
                  )}
                  {!gorev.otomatikMi && (
                    <span className="text-[10px] text-stone-400">👤 {gorev.atayanAd}</span>
                  )}
                </div>
              </div>
              <span className="text-stone-300 ml-2">›</span>
            </div>
          </div>
        ))}
      </div>

      {/* Daha fazla varsa */}
      {aktifGorevler.length > 5 && (
        <div 
          onClick={() => navigate("/gorevler")}
          className="px-4 py-2 text-center text-xs text-amber-600 hover:bg-amber-50 cursor-pointer transition border-t border-stone-100"
        >
          +{aktifGorevler.length - 5} görev daha →
        </div>
      )}
    </div>
  );
}
