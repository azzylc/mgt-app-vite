"use client";
import { useState, useEffect } from "react";
import { auth, db } from "../lib/firebase";
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc } from "firebase/firestore";
import * as Sentry from '@sentry/react';

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
      orderBy("olusturulmaTarihi", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Gorev[] = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Gorev))
        .filter(gorev => gorev.durum !== "tamamlandi"); // Client-side filter
      
      setGorevler(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [personelId]);

  const handleDurumDegistir = async (gorevId: string, yeniDurum: Gorev['durum']) => {
    try {
      const gorevRef = doc(db, "gorevler", gorevId);
      const updateData: Record<string, string> = { durum: yeniDurum };
      
      if (yeniDurum === "tamamlandi") {
        updateData.tamamlanmaTarihi = new Date().toISOString();
      }
      
      await updateDoc(gorevRef, updateData);
    } catch (error) {
      Sentry.captureException(error);
      alert("Durum güncellenemedi. Lütfen tekrar deneyin.");
    }
  };

  const oncelikSirasi = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 };
  const siraliGorevler = [...gorevler].sort((a, b) => 
    oncelikSirasi[a.oncelik] - oncelikSirasi[b.oncelik]
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E5E5E5]">
        <div className="text-center py-8 text-[#8A8A8A]">Yükleniyor...</div>
      </div>
    );
  }

  if (gorevler.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E5E5E5]">
        <h3 className="text-lg font-bold text-[#2F2F2F] mb-4 flex items-center gap-2">
          <span>📋</span> Görevlerim
        </h3>
        <div className="text-center py-8 text-[#8A8A8A]">
          <span className="text-4xl">✅</span>
          <p className="mt-2">Şu anda aktif göreviniz yok</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E5E5E5]">
        <h3 className="text-lg font-bold text-[#2F2F2F] mb-4 flex items-center gap-2">
          <span>📋</span> Görevlerim ({gorevler.length})
        </h3>

        <div className="space-y-3">
          {siraliGorevler.map((gorev) => {
            const oncelikRenk = {
              acil: "border-[#D96C6C] bg-[#D96C6C]/10",
              yuksek: "border-[#E6B566] bg-[#E6B566]/10",
              normal: "border-blue-300 bg-blue-50",
              dusuk: "border-[#E5E5E5] bg-[#F7F7F7]"
            }[gorev.oncelik];

            const durumRenk = {
              bekliyor: "bg-[#E6B566]/20 text-[#E6B566]",
              "devam-ediyor": "bg-blue-100 text-blue-700",
              tamamlandi: "bg-[#EAF2ED] text-[#8FAF9A]",
              iptal: "bg-[#F7F7F7] text-[#2F2F2F]"
            }[gorev.durum];

            return (
              <div
                key={gorev.id}
                className={`p-4 rounded-lg border-2 ${oncelikRenk} transition hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-bold text-[#2F2F2F]">{gorev.baslik}</h4>
                      {gorev.oncelik === "acil" && <span className="text-[#D96C6C]">🔴</span>}
                      {gorev.oncelik === "yuksek" && <span className="text-[#E6B566]">🟡</span>}
                    </div>
                    {gorev.aciklama && (
                      <p className="text-sm text-[#2F2F2F] mb-2">{gorev.aciklama}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-[#8A8A8A]">
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
                        className="px-3 py-1.5 bg-[#8FAF9A] text-white rounded-lg hover:bg-[#7A9E86] transition text-xs font-medium whitespace-nowrap"
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