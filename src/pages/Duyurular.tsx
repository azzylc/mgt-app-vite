import { useState, useEffect } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { useGrupEtiketleri } from "../hooks/useGrupEtiketleri";
import { getRenkStilleri } from "../lib/grupEtiketleri";
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  serverTimestamp
} from "firebase/firestore";

interface Announcement {
  id: string;
  title: string;
  content: string;
  important: boolean;
  group: string;
  author: string;
  createdAt: any;
}

export default function DuyurularPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [filteredAnnouncements, setFilteredAnnouncements] = useState<Announcement[]>([]);
  const [activeFilter, setActiveFilter] = useState("tumu");
  const [showModal, setShowModal] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ 
    title: '', 
    content: '', 
    important: false,
    group: ''
  });
  const navigate = useNavigate();
  
  // Grup etiketlerini Firebase'den çek
  const { grupEtiketleri, loading: grupLoading } = useGrupEtiketleri();

  // İlk grup yüklenince default grup ata
  useEffect(() => {
    if (grupEtiketleri.length > 0 && !newAnnouncement.group) {
      setNewAnnouncement(prev => ({ ...prev, group: grupEtiketleri[0].grupAdi }));
    }
  }, [grupEtiketleri]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore'dan duyuruları dinle
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Announcement));
      setAnnouncements(data);
    });

    return () => unsubscribe();
  }, [user]);

  // Filtreleme
  useEffect(() => {
    if (activeFilter === "tumu") {
      setFilteredAnnouncements(announcements);
    } else {
      setFilteredAnnouncements(announcements.filter(a => 
        (a.group || '').toLowerCase() === activeFilter.toLowerCase()
      ));
    }
  }, [activeFilter, announcements]);

  const handleAddAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.content) {
      alert("Lütfen başlık ve içerik girin!");
      return;
    }

    try {
      await addDoc(collection(db, "announcements"), {
        title: newAnnouncement.title,
        content: newAnnouncement.content,
        important: newAnnouncement.important,
        group: newAnnouncement.group,
        author: user?.email?.split('@')[0] || 'Admin',
        createdAt: serverTimestamp()
      });

      setShowModal(false);
      setNewAnnouncement({ title: '', content: '', important: false, group: grupEtiketleri[0]?.grupAdi || '' });
    } catch (error) {
      console.error("Duyuru eklenirken hata:", error);
      alert("Duyuru eklenemedi!");
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (confirm("Bu duyuruyu silmek istediğinize emin misiniz?")) {
      try {
        await deleteDoc(doc(db, "announcements", id));
      } catch (error) {
        console.error("Duyuru silinirken hata:", error);
        alert("Duyuru silinemedi!");
      }
    }
  };

  const formatTarih = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('tr-TR', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric'
    });
  };

  // Grup adına göre stil bilgisi getir
  const getGroupInfo = (groupName: string) => {
    const safeGroupName = groupName || '';
    const grup = grupEtiketleri.find(g => g.grupAdi.toLowerCase() === safeGroupName.toLowerCase());
    if (!grup) {
      return { 
        grupAdi: safeGroupName || 'Genel', 
        stiller: getRenkStilleri('gray')
      };
    }
    return { 
      grupAdi: grup.grupAdi, 
      stiller: getRenkStilleri(grup.renk)
    };
  };

  // Grup bazlı duyuru sayıları
  const getGroupCounts = () => {
    const counts: Record<string, number> = { tumu: announcements.length };
    grupEtiketleri.forEach(g => {
      counts[g.grupAdi] = announcements.filter(a => 
        (a.group || '').toLowerCase() === g.grupAdi.toLowerCase()
      ).length;
    });
    return counts;
  };

  const counts = getGroupCounts();

  if (loading || grupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Sidebar user={user} />
      
      <div className="md:ml-56 pb-20 md:pb-0">
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-stone-800">📢 Duyurular</h1>
              <p className="text-sm text-stone-500">Ekip için önemli duyurular</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              ➕ Yeni Duyuru
            </button>
          </div>

          {/* Grup Filtreleri */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveFilter("tumu")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeFilter === "tumu"
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              Tümü ({counts.tumu})
            </button>
            {grupEtiketleri.map(grup => {
              const stiller = getRenkStilleri(grup.renk);
              return (
                <button
                  key={grup.id}
                  onClick={() => setActiveFilter(grup.grupAdi)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                    activeFilter === grup.grupAdi
                      ? `${stiller.bg} text-white`
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${activeFilter === grup.grupAdi ? "bg-white" : stiller.bg}`}></span>
                  {grup.grupAdi} ({counts[grup.grupAdi] || 0})
                </button>
              );
            })}
          </div>
        </header>

        <main className="p-6">
          {filteredAnnouncements.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center text-stone-500 border border-stone-100">
              <span className="text-5xl mb-4 block">📭</span>
              <p className="text-lg font-medium">
                {activeFilter === "tumu" ? "Henüz duyuru yok" : `${activeFilter} grubunda duyuru yok`}
              </p>
              <p className="text-sm text-stone-400 mt-2">Yeni duyuru eklemek için yukarıdaki butona tıklayın</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAnnouncements.map(announcement => {
                const groupInfo = getGroupInfo(announcement.group);
                return (
                  <div 
                    key={announcement.id}
                    className={`bg-white rounded-lg shadow-sm border overflow-hidden ${
                      announcement.important 
                        ? 'border-red-300 ring-2 ring-red-100' 
                        : groupInfo.stiller.border
                    }`}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Grup Etiketi */}
                          <span className={`${groupInfo.stiller.bg} text-white text-xs font-bold px-3 py-1 rounded-full`}>
                            {groupInfo.grupAdi}
                          </span>
                          {announcement.important && (
                            <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
                              🔥 ÖNEMLİ
                            </span>
                          )}
                          <h3 className="text-lg font-semibold text-stone-800">{announcement.title}</h3>
                        </div>
                        <button
                          onClick={() => handleDeleteAnnouncement(announcement.id)}
                          className="text-stone-400 hover:text-red-500 transition text-lg"
                        >
                          🗑️
                        </button>
                      </div>
                      <p className="text-stone-600 mb-4 whitespace-pre-wrap">{announcement.content}</p>
                      <div className="flex items-center justify-between text-sm text-stone-500">
                        <span className="flex items-center gap-1">
                          👤 {announcement.author}
                        </span>
                        <span className="flex items-center gap-1">
                          📅 {formatTarih(announcement.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-stone-800 mb-4">📢 Yeni Duyuru</h3>
            
            <div className="space-y-4">
              {/* Grup Seçimi */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Grup</label>
                <div className="flex flex-wrap gap-2">
                  {grupEtiketleri.map(grup => {
                    const stiller = getRenkStilleri(grup.renk);
                    return (
                      <button
                        key={grup.id}
                        type="button"
                        onClick={() => setNewAnnouncement({...newAnnouncement, group: grup.grupAdi})}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                          newAnnouncement.group === grup.grupAdi
                            ? `${stiller.bg} text-white`
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${newAnnouncement.group === grup.grupAdi ? "bg-white" : stiller.bg}`}></span>
                        {grup.grupAdi}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Başlık</label>
                <input
                  type="text"
                  value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement({...newAnnouncement, title: e.target.value})}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  placeholder="Duyuru başlığı..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">İçerik</label>
                <textarea
                  value={newAnnouncement.content}
                  onChange={(e) => setNewAnnouncement({...newAnnouncement, content: e.target.value})}
                  rows={4}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  placeholder="Duyuru içeriği..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="important"
                  checked={newAnnouncement.important}
                  onChange={(e) => setNewAnnouncement({...newAnnouncement, important: e.target.checked})}
                  className="rounded"
                />
                <label htmlFor="important" className="text-sm text-stone-700">🔥 Önemli duyuru olarak işaretle</label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddAnnouncement}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-lg font-medium transition"
                >
                  Ekle
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-lg font-medium transition"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}