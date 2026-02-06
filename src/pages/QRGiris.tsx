import { useState, useEffect } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { 
  collection, 
  query, 
  where, 
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
  limit
} from "firebase/firestore";
import { Scanner } from "@yudiel/react-qr-scanner";

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  email: string;
  foto: string;
}

interface SonIslem {
  tip: "giris" | "cikis";
  tarih: any;
  konumAdi: string;
}

interface Konum {
  id: string;
  karekod: string;
  konumAdi: string;
  lat: number;
  lng: number;
  maksimumOkutmaUzakligi: number;
  aktif: boolean;
}

export default function QRGirisPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [personel, setPersonel] = useState<Personel | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [durum, setDurum] = useState<"bekleniyor" | "basarili" | "hata">("bekleniyor");
  const [mesaj, setMesaj] = useState("");
  const [sonIslem, setSonIslem] = useState<SonIslem | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        const q = query(collection(db, "personnel"), where("email", "==", user.email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setPersonel({
            id: snapshot.docs[0].id,
            ad: data.ad,
            soyad: data.soyad,
            email: data.email,
            foto: data.foto || ""
          });
          await fetchSonIslem(snapshot.docs[0].id);
        }
      } else {
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchSonIslem = async (personelId: string) => {
    try {
      const q = query(
        collection(db, "attendance"),
        where("personelId", "==", personelId),
        orderBy("tarih", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setSonIslem({ tip: data.tip, tarih: data.tarih, konumAdi: data.konumAdi });
      }
    } catch (error) {
    }
  };

  const getLocation = (): Promise<{lat: number, lng: number}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Tarayiciniz konum ozelligini desteklemiyor"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => {
          const messages: Record<number, string> = {
            1: "Konum izni reddedildi",
            2: "Konum bilgisi alinamadi",
            3: "Konum alma zaman asimi"
          };
          reject(new Error(messages[error.code] || "Konum hatasi"));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3;
    const f1 = lat1 * Math.PI / 180;
    const f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const startScanning = async () => {
    setLocationError("");
    setMesaj("");
    setDurum("bekleniyor");
    try {
      const location = await getLocation();
      setUserLocation(location);
      setScanning(true);
    } catch (error: any) {
      setLocationError(error.message);
    }
  };

  const handleScan = async (result: any) => {
    if (!result || !result[0]?.rawValue || processing) return;
    
    const decodedText = result[0].rawValue;
    setProcessing(true);
    setScanning(false);

    try {
      const q = query(collection(db, "locations"), where("karekod", "==", decodedText), where("aktif", "==", true));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setDurum("hata");
        setMesaj("QR kod taninmadi!");
        setProcessing(false);
        return;
      }

      const konum = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Konum;

      if (!userLocation) {
        setDurum("hata");
        setMesaj("Konum alinamadi");
        setProcessing(false);
        return;
      }

      const mesafe = calculateDistance(userLocation.lat, userLocation.lng, konum.lat, konum.lng);

      if (mesafe > konum.maksimumOkutmaUzakligi) {
        setDurum("hata");
        setMesaj(`Cok uzaktasiniz! (${Math.round(mesafe)}m)`);
        setProcessing(false);
        return;
      }

      const islemTipi: "giris" | "cikis" = sonIslem?.tip === "giris" ? "cikis" : "giris";

      await addDoc(collection(db, "attendance"), {
        personelId: personel?.id,
        personelAd: `${personel?.ad} ${personel?.soyad}`,
        personelEmail: personel?.email,
        konumId: konum.id,
        konumAdi: konum.konumAdi,
        karekod: decodedText,
        tip: islemTipi,
        tarih: serverTimestamp(),
        lat: userLocation.lat,
        lng: userLocation.lng,
        mesafe: Math.round(mesafe)
      });

      setDurum("basarili");
      setMesaj(`${islemTipi === "giris" ? "Giris" : "Cikis"} kaydedildi!`);
      setSonIslem({ tip: islemTipi, tarih: new Date(), konumAdi: konum.konumAdi });
    } catch (error: any) {
      setDurum("hata");
      setMesaj("Bir hata olustu");
    } finally {
      setProcessing(false);
    }
  };

  const formatSaat = (tarih: any) => {
    if (!tarih) return "";
    const date = tarih.toDate ? tarih.toDate() : new Date(tarih);
    return date.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-rose-500 border-t-transparent"></div>
      </div>
    );
  }

  // Tam ekran kamera modu
  if (scanning) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <Scanner
          onScan={handleScan}
          constraints={{ facingMode: "environment" }}
          styles={{ container: { width: "100%", height: "100%" }, video: { width: "100%", height: "100%", objectFit: "cover" } }}
        />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/70 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 to-transparent"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white rounded-3xl">
            <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-rose-500 rounded-tl-2xl"></div>
            <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-rose-500 rounded-tr-2xl"></div>
            <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-rose-500 rounded-bl-2xl"></div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-rose-500 rounded-br-2xl"></div>
          </div>
        </div>
        <div className="absolute top-0 left-0 right-0 p-6 text-center">
          <p className="text-white text-lg font-medium">QR Kodu Cerceveleyln</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <button onClick={() => setScanning(false)} className="w-full py-4 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-lg">
            X Iptal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Sidebar user={user} />
      
      <div className="pb-20 md:pb-0">
        <header className="bg-white border-b px-4 md:px-6 py-4 sticky top-0 z-30">
          <h1 className="text-lg md:text-xl font-bold text-stone-800">📱 QR Giris-Cikis</h1>
          <p className="text-sm text-stone-500">QR kod okutarak giris veya cikis yapin</p>
        </header>

        <main className="p-4 md:p-6">
          <div className="max-w-lg mx-auto">
            {/* Personel Bilgisi */}
            <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-stone-100 mb-4 md:mb-6">
              <div className="flex items-center gap-4">
                {personel?.foto ? (
                  <img src={personel.foto} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-rose-100 flex items-center justify-center text-xl md:text-2xl">
                    {personel?.ad?.charAt(0)}
                  </div>
                )}
                <div>
                  <h2 className="text-base md:text-lg font-bold text-stone-800">{personel?.ad} {personel?.soyad}</h2>
                  <p className="text-sm text-stone-500">{personel?.email}</p>
                </div>
              </div>

              {sonIslem && (
                <div className={`mt-4 p-3 rounded-lg ${sonIslem.tip === "giris" ? "bg-green-50" : "bg-orange-50"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        Son Islem: <span className={sonIslem.tip === "giris" ? "text-green-600" : "text-orange-600"}>
                          {sonIslem.tip === "giris" ? "Giris" : "Cikis"}
                        </span>
                      </p>
                      <p className="text-xs text-stone-500 mt-1">{sonIslem.konumAdi}</p>
                    </div>
                    <p className={`text-lg font-bold ${sonIslem.tip === "giris" ? "text-green-600" : "text-orange-600"}`}>
                      {formatSaat(sonIslem.tarih)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* QR Scanner */}
            <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-stone-100">
              {locationError && (
                <div className="mb-4 p-4 bg-red-50 rounded-lg text-red-600 text-sm">{locationError}</div>
              )}

              {durum !== "bekleniyor" && (
                <div className={`mb-4 p-4 rounded-lg text-center ${durum === "basarili" ? "bg-green-50" : "bg-red-50"}`}>
                  <span className="text-3xl mb-2 block">{durum === "basarili" ? "✅" : "❌"}</span>
                  <p className={`font-semibold ${durum === "basarili" ? "text-green-700" : "text-red-700"}`}>{mesaj}</p>
                </div>
              )}

              {processing ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-rose-500 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-stone-600">Isleniyor...</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-24 h-24 md:w-28 md:h-28 mx-auto mb-4 md:mb-6 bg-stone-100 rounded-lg flex items-center justify-center">
                    <span className="text-4xl md:text-5xl">📷</span>
                  </div>
                  <p className="text-stone-600 mb-4 md:mb-6">
                    {sonIslem?.tip === "giris" ? "Cikis yapmak icin QR kod okutun" : "Giris yapmak icin QR kod okutun"}
                  </p>
                  <button
                    onClick={startScanning}
                    className={`w-full py-4 text-white rounded-lg font-medium text-lg transition active:scale-95 ${
                      sonIslem?.tip === "giris" 
                        ? "bg-gradient-to-r from-orange-500 to-orange-600" 
                        : "bg-gradient-to-r from-green-500 to-green-600"
                    }`}
                  >
                    {sonIslem?.tip === "giris" ? "Cikis Yap" : "Giris Yap"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 md:mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">Kamerayi QR koda tutun, otomatik okuyacak.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}