import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../context/RoleProvider";

interface PersonelDoc {
  id: string;
  ad: string;
  soyad: string;
  aktif?: boolean;
}

interface Shift {
  id: string;
  personel: string;
  tarih: string;
  vardiya: "sabah" | "aksam" | "gece";
  baslangic: string;
  bitis: string;
  notlar: string;
  durum: "planli" | "devam" | "tamamlandi";
}

export default function VardiyaPage() {
  const user = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [filterTarih, setFilterTarih] = useState("");
  const [filterPersonel, setFilterPersonel] = useState("hepsi");
  const [filterVardiya, setFilterVardiya] = useState("hepsi");
  const [personelListesi, setPersonelListesi] = useState<string[]>([]);
  const [formData, setFormData] = useState({ 
    personel: '', 
    tarih: '', 
    vardiya: 'sabah' as 'sabah' | 'aksam' | 'gece',
    baslangic: '09:00',
    bitis: '18:00',
    notlar: '' 
  });
  const vardiyaTipleri = {
    sabah: { 
      label: "Sabah Vardiyası", 
      icon: "🌅", 
      color: "bg-yellow-100 text-yellow-700",
      defaultBaslangic: "09:00",
      defaultBitis: "18:00"
    },
    aksam: { 
      label: "Akşam Vardiyası", 
      icon: "🌆", 
      color: "bg-orange-100 text-orange-700",
      defaultBaslangic: "14:00",
      defaultBitis: "23:00"
    },
    gece: { 
      label: "Gece Vardiyası", 
      icon: "🌙", 
      color: "bg-blue-100 text-blue-700",
      defaultBaslangic: "23:00",
      defaultBitis: "08:00"
    }
  };

  const durumConfig = {
    planli: { label: "Planlı", color: "bg-stone-100 text-stone-700", icon: "📅" },
    devam: { label: "Devam Ediyor", color: "bg-blue-100 text-blue-700", icon: "🔄" },
    tamamlandi: { label: "Tamamlandı", color: "bg-green-100 text-green-700", icon: "✅" }
  };

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "personnel"), where("aktif", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const isimler = snapshot.docs
        .map(doc => {
          const d = doc.data();
          return d.ad ? `${d.ad} ${d.soyad || ""}`.trim() : "";
        })
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'tr'));
      setPersonelListesi(isimler);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "shifts"), orderBy("tarih", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
      setShifts(data);
    });
    return () => unsubscribe();
  }, [user]);

  const bugun = new Date().toISOString().split('T')[0];
  const planliVardiyalar = shifts.filter(s => s.durum === 'planli');
  const devamEden = shifts.filter(s => s.durum === 'devam');
  const tamamlanan = shifts.filter(s => s.durum === 'tamamlandi');

  const filteredShifts = shifts.filter(s => {
    const tarihMatch = !filterTarih || s.tarih === filterTarih;
    const personelMatch = filterPersonel === "hepsi" || s.personel === filterPersonel;
    const vardiyaMatch = filterVardiya === "hepsi" || s.vardiya === filterVardiya;
    return tarihMatch && personelMatch && vardiyaMatch;
  });

  const handleAdd = async () => {
    if (!formData.personel || !formData.tarih) {
      alert("Lütfen personel ve tarih seçin!");
      return;
    }
    
    try {
      await addDoc(collection(db, "shifts"), { 
        ...formData,
        durum: "planli",
        createdAt: serverTimestamp() 
      });
      setShowModal(false);
      setFormData({ personel: '', tarih: '', vardiya: 'sabah', baslangic: '09:00', bitis: '18:00', notlar: '' });
    } catch (error) {
      Sentry.captureException(error);
      alert("Vardiya eklenemedi!");
    }
  };

  const handleEdit = async () => {
    if (!selectedShift) return;
    
    try {
      await updateDoc(doc(db, "shifts", selectedShift.id), formData);
      setShowEditModal(false);
      setSelectedShift(null);
      setFormData({ personel: '', tarih: '', vardiya: 'sabah', baslangic: '09:00', bitis: '18:00', notlar: '' });
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const handleChangeDurum = async (shift: Shift, durum: Shift['durum']) => {
    try {
      await updateDoc(doc(db, "shifts", shift.id), { durum });
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Bu vardiyayı silmek istediğinize emin misiniz?")) {
      try {
        await deleteDoc(doc(db, "shifts", id));
      } catch (error) {
        Sentry.captureException(error);
      }
    }
  };

  const openEditModal = (shift: Shift) => {
    setSelectedShift(shift);
    setFormData({
      personel: shift.personel,
      tarih: shift.tarih,
      vardiya: shift.vardiya,
      baslangic: shift.baslangic,
      bitis: shift.bitis,
      notlar: shift.notlar
    });
    setShowEditModal(true);
  };

  const formatTarih = (tarih: string) => {
    return new Date(tarih).toLocaleDateString('tr-TR', { 
      weekday: 'long',
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <div>
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-stone-800">📅 Vardiya Planı</h1>
              <p className="text-sm text-stone-500">Personel vardiya yönetimi</p>
            </div>
            <button onClick={() => setShowModal(true)} className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm">
              ➕ Vardiya Ekle
            </button>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {/* İstatistikler */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-blue-100 text-sm mb-1">Toplam Vardiya</p>
              <p className="text-3xl font-bold">{shifts.length}</p>
            </div>
            <div className="bg-gradient-to-br from-stone-500 to-stone-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-stone-100 text-sm mb-1">Planlı</p>
              <p className="text-3xl font-bold">{planliVardiyalar.length}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-orange-100 text-sm mb-1">Devam Eden</p>
              <p className="text-3xl font-bold">{devamEden.length}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 p-5 rounded-lg shadow-md text-white">
              <p className="text-green-100 text-sm mb-1">Tamamlanan</p>
              <p className="text-3xl font-bold">{tamamlanan.length}</p>
            </div>
          </div>

          {/* Filtreler */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-stone-100 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 block">📅 Tarih:</label>
                <input type="date" min="2020-01-01" max="2099-12-31" value={filterTarih} onChange={e => setFilterTarih(e.target.value)} className="w-full px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 block">👤 Personel:</label>
                <select value={filterPersonel} onChange={e => setFilterPersonel(e.target.value)} className="w-full px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white">
                  <option value="hepsi">Tüm Personel</option>
                  {personelListesi.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-2 block">🕐 Vardiya:</label>
                <select value={filterVardiya} onChange={e => setFilterVardiya(e.target.value)} className="w-full px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white">
                  <option value="hepsi">Tüm Vardiyalar</option>
                  {Object.entries(vardiyaTipleri).map(([key, value]) => <option key={key} value={key}>{value.icon} {value.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Vardiya Listesi */}
          <div className="space-y-3">
            {filteredShifts.length === 0 ? (
              <div className="bg-white rounded-lg p-12 text-center text-stone-500 border border-stone-100">
                <span className="text-5xl mb-4 block">📅</span>
                <p className="text-lg font-medium">Vardiya bulunamadı</p>
              </div>
            ) : (
              filteredShifts.map(shift => {
                const vardiyaTipi = vardiyaTipleri[shift.vardiya];
                const durum = durumConfig[shift.durum];
                
                return (
                  <div key={shift.id} className="bg-white rounded-lg shadow-sm border border-stone-100 p-5 hover:shadow-md transition cursor-pointer" onClick={() => { setSelectedShift(shift); setShowDetailModal(true); }}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-stone-800 text-lg">{shift.personel}</h3>
                          <span className={`text-xs px-3 py-1 rounded-full ${vardiyaTipi.color} font-medium`}>
                            {vardiyaTipi.icon} {vardiyaTipi.label}
                          </span>
                          <span className={`text-xs px-3 py-1 rounded-full ${durum.color} font-medium`}>
                            {durum.icon} {durum.label}
                          </span>
                        </div>
                        <div className="text-sm text-stone-600">
                          <p>📅 {formatTarih(shift.tarih)}</p>
                          <p className="mt-1">🕐 {shift.baslangic} - {shift.bitis}</p>
                          {shift.notlar && <p className="mt-1 text-stone-500">📝 {shift.notlar}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {shift.durum === 'planli' && (
                          <button onClick={() => handleChangeDurum(shift, 'devam')} className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm">🔄 Başlat</button>
                        )}
                        {shift.durum === 'devam' && (
                          <button onClick={() => handleChangeDurum(shift, 'tamamlandi')} className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm">✅ Bitir</button>
                        )}
                        <button onClick={() => openEditModal(shift)} className="p-2 hover:bg-stone-100 rounded-lg transition">✏️</button>
                        <button onClick={() => handleDelete(shift.id)} className="p-2 hover:bg-red-100 rounded-lg transition">🗑️</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {/* Yeni Vardiya Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-stone-800">📅 Yeni Vardiya</h3>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-600 text-3xl">×</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Personel *</label>
                  <select value={formData.personel} onChange={e => setFormData({...formData, personel: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white">
                    <option value="">Seçin...</option>
                    {personelListesi.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Tarih *</label>
                  <input type="date" min="2020-01-01" max="2099-12-31" value={formData.tarih} onChange={e => setFormData({...formData, tarih: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Vardiya Türü *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(vardiyaTipleri).map(([key, value]) => (
                    <button key={key} type="button" onClick={() => setFormData({...formData, vardiya: key as any, baslangic: value.defaultBaslangic, bitis: value.defaultBitis})} className={`px-4 py-3 rounded-lg border-2 transition ${formData.vardiya === key ? 'border-rose-500 bg-rose-50' : 'border-stone-200 hover:border-stone-300'}`}>
                      <div className="text-2xl mb-1">{value.icon}</div>
                      <div className="text-xs font-medium">{value.label.split(' ')[0]}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Başlangıç Saati</label>
                  <input type="time" value={formData.baslangic} onChange={e => setFormData({...formData, baslangic: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Bitiş Saati</label>
                  <input type="time" value={formData.bitis} onChange={e => setFormData({...formData, bitis: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Notlar</label>
                <textarea value={formData.notlar} onChange={e => setFormData({...formData, notlar: e.target.value})} rows={3} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" placeholder="Ek notlar (opsiyonel)" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowModal(false)} className="flex-1 px-6 py-3 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition font-medium">İptal</button>
                <button onClick={handleAdd} className="flex-1 px-6 py-3 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition font-medium shadow-sm">Ekle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Düzenleme Modal */}
      {showEditModal && selectedShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-stone-800">✏️ Vardiyayı Düzenle</h3>
              <button onClick={() => setShowEditModal(false)} className="text-stone-400 hover:text-stone-600 text-3xl">×</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Personel *</label>
                  <select value={formData.personel} onChange={e => setFormData({...formData, personel: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white">
                    {personelListesi.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Tarih *</label>
                  <input type="date" min="2020-01-01" max="2099-12-31" value={formData.tarih} onChange={e => setFormData({...formData, tarih: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Vardiya Türü *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(vardiyaTipleri).map(([key, value]) => (
                    <button key={key} type="button" onClick={() => setFormData({...formData, vardiya: key as any})} className={`px-4 py-3 rounded-lg border-2 transition ${formData.vardiya === key ? 'border-rose-500 bg-rose-50' : 'border-stone-200 hover:border-stone-300'}`}>
                      <div className="text-2xl mb-1">{value.icon}</div>
                      <div className="text-xs font-medium">{value.label.split(' ')[0]}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Başlangıç Saati</label>
                  <input type="time" value={formData.baslangic} onChange={e => setFormData({...formData, baslangic: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Bitiş Saati</label>
                  <input type="time" value={formData.bitis} onChange={e => setFormData({...formData, bitis: e.target.value})} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Notlar</label>
                <textarea value={formData.notlar} onChange={e => setFormData({...formData, notlar: e.target.value})} rows={3} className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowEditModal(false)} className="flex-1 px-6 py-3 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition font-medium">İptal</button>
                <button onClick={handleEdit} className="flex-1 px-6 py-3 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition font-medium shadow-sm">Güncelle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detay Modal */}
      {showDetailModal && selectedShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-stone-800">📅 Vardiya Detayları</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-stone-400 hover:text-stone-600 text-3xl">×</button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-stone-50 rounded-lg">
                <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center text-xl">👤</div>
                <div>
                  <p className="text-sm text-stone-500">Personel</p>
                  <p className="font-semibold text-stone-800">{selectedShift.personel}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className={`px-4 py-2 rounded-lg ${vardiyaTipleri[selectedShift.vardiya].color} font-medium`}>
                  {vardiyaTipleri[selectedShift.vardiya].icon} {vardiyaTipleri[selectedShift.vardiya].label}
                </span>
                <span className={`px-4 py-2 rounded-lg ${durumConfig[selectedShift.durum].color} font-medium`}>
                  {durumConfig[selectedShift.durum].icon} {durumConfig[selectedShift.durum].label}
                </span>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 mb-1">📅 Tarih</p>
                <p className="font-semibold text-stone-800">{formatTarih(selectedShift.tarih)}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600 mb-1">🕐 Başlangıç</p>
                  <p className="font-bold text-stone-800 text-xl">{selectedShift.baslangic}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600 mb-1">🕐 Bitiş</p>
                  <p className="font-bold text-stone-800 text-xl">{selectedShift.bitis}</p>
                </div>
              </div>
              {selectedShift.notlar && (
                <div className="p-4 bg-stone-50 rounded-lg">
                  <p className="text-sm text-stone-500 mb-2">📝 Notlar:</p>
                  <p className="text-stone-700">{selectedShift.notlar}</p>
                </div>
              )}
            </div>
            <div className="mt-6">
              <button onClick={() => setShowDetailModal(false)} className="w-full px-6 py-3 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition font-medium">Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}