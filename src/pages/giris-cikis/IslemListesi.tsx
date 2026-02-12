import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, query, onSnapshot, orderBy, where, Timestamp, doc, deleteDoc, updateDoc, addDoc } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

interface AttendanceRecord {
  id: string;
  personelId: string;
  personelAd: string;
  sicilNo?: string;
  tip: "giris" | "cikis";
  tarih: Timestamp | Date;
  konumAdi: string;
  konumId: string;
  kayitOrtami: string;
  manuelKayit: boolean;
  mazeretNotu?: string;
  mesafe?: number;
}

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  sicilNo?: string;
  calismaSaati?: string;
}

interface Konum {
  id: string;
  ad: string;
  karekod: string;
}

/** Timestamp veya Date'i güvenli şekilde Date'e çevir */
function tsToDate(ts: Timestamp | Date | null | undefined): Date {
  if (!ts) return new Date();
  return ts instanceof Timestamp ? ts.toDate() : ts;
}

export default function IslemListesiPage() {
  const user = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [konumlar, setKonumlar] = useState<Konum[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  // Filtreler
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("Tümünde");

  // Modal
  const [editModal, setEditModal] = useState<AttendanceRecord | null>(null);
  const [deleteModal, setDeleteModal] = useState<AttendanceRecord | null>(null);

  // Personelleri çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), orderBy("ad", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || "",
        soyad: doc.data().soyad || "",
        sicilNo: doc.data().sicilNo || "",
        calismaSaati: doc.data().calismaSaati || "her gün 9:00-18:00"
      }));
      setPersoneller(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Konumları çek
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "locations"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || doc.data().name || "",
        karekod: doc.data().karekod || doc.data().code || ""
      }));
      setKonumlar(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Kayıtları çek (son 30 gün)
  useEffect(() => {
    if (!user) return;
    
    const otuzGunOnce = new Date();
    otuzGunOnce.setDate(otuzGunOnce.getDate() - 30);
    
    const q = query(
      collection(db, "attendance"),
      where("tarih", ">=", Timestamp.fromDate(otuzGunOnce)),
      orderBy("tarih", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: AttendanceRecord[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        data.push({
          id: doc.id,
          personelId: d.personelId || "",
          personelAd: d.personelAd || "",
          sicilNo: d.sicilNo || "",
          tip: d.tip || "giris",
          tarih: d.tarih,
          konumAdi: d.konumAdi || "",
          konumId: d.konumId || "",
          kayitOrtami: d.kayitOrtami || "Mobil uygulama",
          manuelKayit: d.manuelKayit || false,
          mazeretNotu: d.mazeretNotu || "",
          mesafe: d.mesafe
        });
      });
      setRecords(data);
    });
    
    return () => unsubscribe();
  }, [user]);

  // Filtreleme
  useEffect(() => {
    let filtered = [...records];

    if (searchTerm) {
      filtered = filtered.filter(r => 
        r.personelAd.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.sicilNo?.includes(searchTerm)
      );
    }

    if (filterType === "Giriş") {
      filtered = filtered.filter(r => r.tip === "giris");
    } else if (filterType === "Çıkış") {
      filtered = filtered.filter(r => r.tip === "cikis");
    }

    setFilteredRecords(filtered);
  }, [records, searchTerm, filterType]);

  // Kayıt sil
  const handleDelete = async () => {
    if (!deleteModal) return;
    
    try {
      // Değişiklik kaydı ekle
      await addDoc(collection(db, "attendanceChanges"), {
        degisiklikYapan: user.email,
        degisiklikTarihi: Timestamp.now(),
        degisiklikTuru: "Kayıt Silindi",
        oncekiDeger: `${deleteModal.personelAd} - ${deleteModal.tip} - ${tsToDate(deleteModal.tarih).toLocaleString('tr-TR')}`,
        sonrakiDeger: "",
        kullaniciAdi: deleteModal.personelAd,
        konum: deleteModal.konumAdi,
        girisCikisTarih: deleteModal.tarih
      });

      await deleteDoc(doc(db, "attendance", deleteModal.id));
      setDeleteModal(null);
      alert("Kayıt silindi!");
    } catch (error) {
      Sentry.captureException(error);
      alert("Silme işlemi başarısız!");
    }
  };

  // Kayıt düzenle
  const handleEdit = async () => {
    if (!editModal) return;
    
    try {
      const oncekiKayit = records.find(r => r.id === editModal.id);
      
      // Değişiklik kaydı ekle
      await addDoc(collection(db, "attendanceChanges"), {
        degisiklikYapan: user.email,
        degisiklikTarihi: Timestamp.now(),
        degisiklikTuru: "Kayıt Eklendi",
        oncekiDeger: oncekiKayit ? `${oncekiKayit.tip} - ${tsToDate(oncekiKayit.tarih).toLocaleString('tr-TR')}` : "",
        sonrakiDeger: `${editModal.tip} - ${tsToDate(editModal.tarih).toLocaleString('tr-TR')}`,
        kullaniciAdi: editModal.personelAd,
        konum: editModal.konumAdi,
        girisCikisTarih: editModal.tarih
      });

      await updateDoc(doc(db, "attendance", editModal.id), {
        tip: editModal.tip,
        mazeretNotu: editModal.mazeretNotu || ""
      });
      
      setEditModal(null);
      alert("Kayıt güncellendi!");
    } catch (error) {
      Sentry.captureException(error);
      alert("Güncelleme işlemi başarısız!");
    }
  };

  // Personel bilgisi getir
  const getPersonelBilgi = (personelId: string) => {
    return personeller.find(p => p.id === personelId);
  };

  return (
    <div className="min-h-screen bg-white">
      <div>
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#2F2F2F]">İşlem Listesi</h1>
              <p className="text-sm text-[#8A8A8A] mt-1">Bu sayfada, şirketinize ait tüm giriş - çıkış kayıtlarını görebilirsiniz.</p>
            </div>
            <button
              onClick={() => window.print()}
              className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              🖨️ Yazdır
            </button>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {/* Filtreler */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <input
                type="text"
                placeholder="İsim veya sicil no ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Tümünde">Tümünde</option>
                <option value="Giriş">Giriş</option>
                <option value="Çıkış">Çıkış</option>
              </select>
              <button className="bg-[#8FAF9A] hover:bg-[#7A9E86] text-white px-6 py-2 rounded-lg font-medium transition">
                Ara
              </button>
            </div>
          </div>

          {/* Tablo */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F7F7F7] border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Kullanıcı Adı</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Konum</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Çalışma Saati</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">↓ Tarih</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Kayıt Türü</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Sicil No</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Kayıt Ortamı</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Manual Kayıt</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Mazeret</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">Konum Dışı</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#8A8A8A] uppercase">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-[#8A8A8A]">
                        Kayıt bulunamadı
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record, index) => {
                      const personel = getPersonelBilgi(record.personelId);
                      const tarih = tsToDate(record.tarih);
                      const konumDisi = record.mesafe && record.mesafe > 100;
                      
                      return (
                        <tr key={record.id} className="hover:bg-[#F7F7F7]">
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{index + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-[#2F2F2F]">{record.personelAd}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{record.konumAdi}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{personel?.calismaSaati || "her gün 9:00-18:00"}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">
                            {tarih.toLocaleDateString('tr-TR')} {tarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                              record.tip === "giris" 
                                ? "bg-[#EAF2ED] text-[#8FAF9A]" 
                                : "bg-[#D96C6C]/20 text-[#D96C6C]"
                            }`}>
                              {record.tip === "giris" ? "Giriş" : "Çıkış"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{personel?.sicilNo || record.sicilNo || "-"}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{record.kayitOrtami}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{record.manuelKayit ? "Evet" : "Hayır"}</td>
                          <td className="px-4 py-3 text-sm text-[#2F2F2F]">{record.mazeretNotu || "-"}</td>
                          <td className="px-4 py-3 text-sm">
                            {konumDisi && <span className="text-[#D96C6C]">Evet</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditModal(record)}
                                className="text-[#8A8A8A] hover:text-blue-500 transition"
                                title="Düzenle"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => setDeleteModal(record)}
                                className="text-[#8A8A8A] hover:text-[#D96C6C] transition"
                                title="Sil"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Düzenleme Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[#2F2F2F] mb-4">Kaydı Düzenle</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Kullanıcı</label>
                <input
                  type="text"
                  value={editModal.personelAd}
                  disabled
                  className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg bg-[#F7F7F7]"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Kayıt Türü</label>
                <select
                  value={editModal.tip}
                  onChange={(e) => setEditModal({...editModal, tip: e.target.value as "giris" | "cikis"})}
                  className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:ring-2 focus:ring-rose-500"
                >
                  <option value="giris">Giriş</option>
                  <option value="cikis">Çıkış</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[#2F2F2F] mb-1">Mazeret Notu</label>
                <input
                  type="text"
                  value={editModal.mazeretNotu || ""}
                  onChange={(e) => setEditModal({...editModal, mazeretNotu: e.target.value})}
                  className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:ring-2 focus:ring-rose-500"
                  placeholder="Mazeret notu girin..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditModal(null)}
                className="flex-1 px-4 py-2 border border-[#E5E5E5] rounded-lg text-[#2F2F2F] hover:bg-[#F7F7F7] transition"
              >
                İptal
              </button>
              <button
                onClick={handleEdit}
                className="flex-1 px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Silme Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[#2F2F2F] mb-4">Kaydı Sil</h3>
            <p className="text-[#2F2F2F] mb-6">
              <strong>{deleteModal.personelAd}</strong> adlı personelin{" "}
              <strong>{tsToDate(deleteModal.tarih).toLocaleString('tr-TR')}</strong> tarihli{" "}
              <strong>{deleteModal.tip === "giris" ? "giriş" : "çıkış"}</strong> kaydını silmek istediğinize emin misiniz?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 px-4 py-2 border border-[#E5E5E5] rounded-lg text-[#2F2F2F] hover:bg-[#F7F7F7] transition"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-[#D96C6C] text-white rounded-lg hover:bg-[#C25A5A] transition"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}