import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { getYaklasanTatiller, getYaklasanDogumGunleri, getYaklasanAnmaGunleri } from "../../lib/data";

interface PersonelBasic {
  id: string;
  ad: string;
  soyad: string;
  dogumTarihi?: string;
  dogumGunu?: string;
  emoji?: string;
  aktif: boolean;
}

interface OzelTarih {
  id: string;
  baslik: string;
  tarih: string;
  tekrarliMi: boolean;
  emoji: string;
  renk: string;
}

interface BirlesikEtkinlik {
  id: string;
  baslik: string;
  tarihStr: string;
  kalanGun: number;
  kategori: "tatil" | "anma" | "dogumgunu" | "ozel";
  emoji: string;
  ekBilgi?: string;
}

interface Props {
  personeller: PersonelBasic[];
}

const GOSTERIM_LIMITI = 6;

export default function TakvimEtkinlikWidget({ personeller }: Props) {
  const navigate = useNavigate();
  const [ozelTarihler, setOzelTarihler] = useState<OzelTarih[]>([]);

  // Özel tarihleri Firestore'dan dinle
  useEffect(() => {
    const q = query(collection(db, "onemliTarihler"), orderBy("tarih", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOzelTarihler(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OzelTarih)));
    }, () => {});
    return () => unsubscribe();
  }, []);

  // Tüm etkinlikleri birleştir ve sırala
  const tumEtkinlikler = useMemo(() => {
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    const items: BirlesikEtkinlik[] = [];

    // Resmi tatiller
    getYaklasanTatiller().forEach(t => {
      const tarih = new Date(t.tarih + "T00:00:00");
      const kalanGun = Math.floor((tarih.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
      items.push({
        id: `tatil-${t.tarih}`, baslik: t.isim, tarihStr: t.tarih, kalanGun,
        kategori: "tatil", emoji: "🏖️",
        ekBilgi: t.sure > 1 ? `${t.sure} gün` : undefined,
      });
    });

    // Anma günleri
    getYaklasanAnmaGunleri().forEach(a => {
      items.push({
        id: `anma-${a.ay}-${a.gun}`, baslik: a.isim, tarihStr: a.tarihStr,
        kalanGun: a.kalanGun, kategori: "anma", emoji: a.emoji,
      });
    });

    // Doğum günleri
    const normalized = personeller.map(p => ({
      ...p, dogumTarihi: p.dogumTarihi || (p as any).dogumGunu || ""
    }));
    getYaklasanDogumGunleri(normalized).forEach(d => {
      items.push({
        id: `dogum-${d.id}`, baslik: d.isim, tarihStr: d.yaklasanTarih,
        kalanGun: d.kalanGun, kategori: "dogumgunu", emoji: "🎂",
      });
    });

    // Özel tarihler (Firestore)
    ozelTarihler.forEach(t => {
      let tarih = new Date(t.tarih + "T00:00:00");
      if (t.tekrarliMi) {
        const buYil = bugun.getFullYear();
        tarih = new Date(buYil, tarih.getMonth(), tarih.getDate());
        if (tarih < bugun) tarih = new Date(buYil + 1, tarih.getMonth(), tarih.getDate());
      }
      const kalanGun = Math.floor((tarih.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
      if (kalanGun < 0 || kalanGun > 365) return;
      items.push({
        id: `ozel-${t.id}`, baslik: t.baslik,
        tarihStr: `${tarih.getFullYear()}-${String(tarih.getMonth()+1).padStart(2,'0')}-${String(tarih.getDate()).padStart(2,'0')}`,
        kalanGun, kategori: "ozel", emoji: t.emoji || "📌",
      });
    });

    return items.sort((a, b) => a.kalanGun - b.kalanGun);
  }, [personeller, ozelTarihler]);

  const gosterilenEtkinlikler = tumEtkinlikler.slice(0, GOSTERIM_LIMITI);

  const formatTarih = (tarihStr: string) => {
    const d = new Date(tarihStr + "T00:00:00");
    const gun = d.getDate();
    const ay = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][d.getMonth()];
    const gunAdi = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][d.getDay()];
    return `${gun} ${ay} ${gunAdi}`;
  };

  const kalanGunText = (gun: number) => {
    if (gun === 0) return "Bugün!";
    if (gun === 1) return "Yarın";
    return `${gun} gün`;
  };

  const kalanGunRenk = (gun: number) => {
    if (gun === 0) return "text-[#8FAF9A] bg-[#EAF2ED] font-bold";
    if (gun <= 3) return "text-[#8FAF9A] bg-[#EAF2ED]";
    if (gun <= 7) return "text-blue-600 bg-blue-50";
    return "text-[#8A8A8A] bg-[#F7F7F7]";
  };

  const kategoriRenk = (kat: string) => {
    switch (kat) {
      case "tatil": return "bg-[#D96C6C]/20";
      case "anma": return "bg-[#E5E5E5]";
      case "dogumgunu": return "bg-pink-100";
      case "ozel": return "bg-[#EAF2ED]";
      default: return "bg-[#F7F7F7]";
    }
  };

  const kategoriBg = (kat: string) => {
    switch (kat) {
      case "tatil": return "bg-[#D96C6C]/10/40";
      case "anma": return "bg-[#F7F7F7]";
      case "dogumgunu": return "bg-pink-50/40";
      case "ozel": return "bg-[#EAF2ED]";
      default: return "";
    }
  };

  if (tumEtkinlikler.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#E5E5E5] flex items-center justify-between bg-gradient-to-r from-[#EAF2ED] to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-sm">📅</span>
          <span className="text-xs font-semibold text-[#2F2F2F]">Yaklaşan Etkinlikler</span>
          <span className="text-[10px] text-[#8A8A8A] bg-[#F7F7F7] px-1.5 py-0.5 rounded-full">{tumEtkinlikler.length}</span>
        </div>
        <button onClick={() => navigate("/duyurular?tab=tarihler")}
          className="text-[10px] text-[#8A8A8A] hover:text-[#8FAF9A] font-medium transition">
          Tümü →
        </button>
      </div>

      {/* Liste */}
      <div className="p-2.5 space-y-1.5">
        {gosterilenEtkinlikler.map((e) => (
          <div key={e.id} className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg ${kategoriBg(e.kategori)}`}>
            <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${kategoriRenk(e.kategori)} flex items-center justify-center`}>
              <span className="text-xs">{e.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#2F2F2F] font-medium truncate">{e.baslik}</p>
              <p className="text-[10px] text-[#8A8A8A]">
                {formatTarih(e.tarihStr)}
                {e.ekBilgi && ` (${e.ekBilgi})`}
              </p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${kalanGunRenk(e.kalanGun)}`}>
              {kalanGunText(e.kalanGun)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
