"use client";
import { useState, useEffect } from "react";
import { auth, db } from "../lib/firebase";
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc } from "firebase/firestore";

interface Gorev {
  id: string;
  baslik: string;
  aciklama: string;
  atayan: string;
  atayanAd: string;
  atanan: string;
  atananAd: string;
  durum: "bekliyor" | "devam-ediyor" | "tamamlandi" | "iptal";
  oncelik: "dusuk" | "normal" | "yuksek" | "acil";
  olusturulmaTarihi: string;
  tamamlanmaTarihi?: string;
}

export default function PersonelGorevleri({ personelId }: { personelId: string }) {
  const [gorevler, setGorevler] = useState<Gorev[]>([]);
  const [loading, setLoading] = useState(true);
  const [secilenGorev, setSecilenGorev] = useState<Gorev | null>(null);
  const [detayModal, setDetayModal] = useState(false);

  useEffect(() => {
    if (!personelId) return;

    const q = query(
      collection(db, "gorevler"),
      where("atanan", "==", personelId),
      where("durum", "!=", "tamamlandi"),
      orderBy("durum"),
      orderBy("oncelik"),
      orderBy("olusturulmaTarihi", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Gorev[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Gorev));
      
      setGorevler(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [personelId]);

  const handleDurumDegistir = async (gorevId: string, yeniDurum: Gorev['durum']) => {
    try {
      const gorevRef = doc(db, "gorevler", gorevId);
      const updateData: any = { durum: yeniDurum };
      
      if (yeniDurum === "tamamlandi") {
        updateData.tamamlanmaTarihi = new Date().toISOString();
      }
      
      await updateDoc(gorevRef, updateData);
    } catch (error) {
      console.error("Durum güncelleme hatası:", error);
      alert("Durum güncellenemedi. Lütfen tekrar deneyin.");
    }
  };

  const oncelikSirasi = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 };
  const siraliGorevler = [...gorevler].sort((a, b) => 
    oncelikSirasi[a.oncelik] - oncelikSirasi[b.oncelik]
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-stone-100">
        <div className="text-center py-8 text-stone-500">Yükleniyor...</div>
      </div>
    );
  }

  if (gorevler.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-stone-100">
        <h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
          <span>📋</span> Görevlerim
        </h3>
        <div className="text-center py-8 text-stone-500">
          <span className="text-4xl">✅</span>
          <p className="mt-2">Şu anda aktif göreviniz yok</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg p-6 shadow-sm border border-stone-100">
        <h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
          <span>📋</span> Görevlerim ({gorevler.length})
        </h3>

        <div className="space-y-3">
          {siraliGorevler.map((gorev) => {
            const oncelikRenk = {
              acil: "border-red-300 bg-red-50",
              yuksek: "border-orange-300 bg-orange-50",
              normal: "border-blue-300 bg-blue-50",
              dusuk: "border-stone-300 bg-stone-50"
            }[gorev.oncelik];

            const durumRenk = {
              bekliyor: "bg-yellow-100 text-yellow-700",
              "devam-ediyor": "bg-blue-100 text-blue-700",
              tamamlandi: "bg-green-100 text-green-700",
              iptal: "bg-stone-100 text-stone-700"
            }[gorev.durum];

            return (
              <div
                key={gorev.id}
                className={`p-4 rounded-lg border-2 ${oncelikRenk} transition hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-bold text-stone-800">{gorev.baslik}</h4>
                      {gorev.oncelik === "acil" && <span className="text-red-500">🔴</span>}
                      {gorev.oncelik === "yuksek" && <span className="text-orange-500">🟡</span>}
                    </div>
                    {gorev.aciklama && (
                      <p className="text-sm text-stone-600 mb-2">{gorev.aciklama}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-stone-500">
                      <span>👔 {gorev.atayanAd}</span>
                      <span>📅 {new Date(gorev.olusturulmaTarihi).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {gorev.durum === "bekliyor" && (
                      <button
                        onClick={() => handleDurumDegistir(gorev.id, "devam-ediyor")}
                        className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-xs font-medium whitespace-nowrap"
                      >
                        🔄 Başla
                      </button>
                    )}
                    {gorev.durum === "devam-ediyor" && (
                      <button
                        onClick={() => handleDurumDegistir(gorev.id, "tamamlandi")}
                        className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-xs font-medium whitespace-nowrap"
                      >
                        ✅ Tamamla
                      </button>
                    )}
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-medium text-center ${durumRenk}`}>
                      {gorev.durum === "bekliyor" && "⏳ Bekliyor"}
                      {gorev.durum === "devam-ediyor" && "🔄 Devam"}
                      {gorev.durum === "tamamlandi" && "✅ Tamam"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}