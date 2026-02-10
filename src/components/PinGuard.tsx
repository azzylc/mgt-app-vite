import { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface PinGuardProps {
  children: React.ReactNode;
}

// SHA-256 hash
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "_gys_salt_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function PinGuard({ children }: PinGuardProps) {
  const [durum, setDurum] = useState<"loading" | "pin-yok" | "pin-sor" | "dogrulandi">("loading");
  const [pin, setPin] = useState<string[]>(["", "", "", "", "", ""]);
  const [hata, setHata] = useState("");
  const [kalanDeneme, setKalanDeneme] = useState(5);
  const [kilitli, setKilitli] = useState(false);
  const [kilitSure, setKilitSure] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const storedHash = useRef<string>("");

  // PIN ayarlı mı kontrol et
  useEffect(() => {
    const kontrol = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "general"));
        const data = snap.data();
        if (data?.yonetimPinHash) {
          storedHash.current = data.yonetimPinHash;
          setDurum("pin-sor");
          // İlk inputa focus
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } else {
          // PIN tanımlı değil, direkt geç
          setDurum("pin-yok");
        }
      } catch {
        setDurum("pin-yok");
      }
    };
    kontrol();
  }, []);

  // Kilit sayacı
  useEffect(() => {
    if (!kilitli || kilitSure <= 0) return;
    const interval = setInterval(() => {
      setKilitSure(prev => {
        if (prev <= 1) {
          setKilitli(false);
          setKalanDeneme(5);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [kilitli, kilitSure]);

  const handleChange = (index: number, value: string) => {
    if (kilitli) return;
    // Sadece rakam
    const digit = value.replace(/\D/g, "").slice(-1);
    const yeniPin = [...pin];
    yeniPin[index] = digit;
    setPin(yeniPin);
    setHata("");

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // 6 hane dolunca otomatik kontrol
    if (digit && index === 5) {
      const fullPin = yeniPin.join("");
      if (fullPin.length === 6) {
        dogrula(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const yeniPin = [...pin];
      yeniPin[index - 1] = "";
      setPin(yeniPin);
    }
  };

  // Paste desteği
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const yeniPin = pasted.split("");
      setPin(yeniPin);
      inputRefs.current[5]?.focus();
      dogrula(pasted);
    }
  };

  const dogrula = async (girilenPin: string) => {
    const hash = await hashPin(girilenPin);
    if (hash === storedHash.current) {
      setDurum("dogrulandi");
    } else {
      const kalan = kalanDeneme - 1;
      setKalanDeneme(kalan);
      setPin(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();

      if (kalan <= 0) {
        setKilitli(true);
        setKilitSure(30);
        setHata("Çok fazla hatalı deneme. 30 saniye bekleyin.");
      } else {
        setHata(`Yanlış PIN. ${kalan} deneme hakkınız kaldı.`);
      }
    }
  };

  // PIN tanımlı değilse direkt göster
  if (durum === "pin-yok" || durum === "dogrulandi") {
    return <>{children}</>;
  }

  if (durum === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
      </div>
    );
  }

  // PIN giriş ekranı
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-stone-200/60 shadow-lg max-w-sm w-full p-8 text-center">
        {/* Kilit ikonu */}
        <div className="w-16 h-16 bg-stone-900 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-stone-900 mb-1">Yönetim Paneli</h2>
        <p className="text-sm text-stone-500 mb-6">Devam etmek için 6 haneli PIN girin</p>

        {/* PIN input boxes */}
        <div className="flex justify-center gap-2.5 mb-4" onPaste={handlePaste}>
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={kilitli}
              className={`w-11 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all outline-none
                ${digit ? "border-stone-900 bg-stone-50" : "border-stone-200 bg-white"}
                ${hata ? "border-red-300 shake" : ""}
                focus:border-amber-400 focus:ring-2 focus:ring-amber-100
                disabled:opacity-40 disabled:cursor-not-allowed`}
            />
          ))}
        </div>

        {/* Hata mesajı */}
        {hata && (
          <p className="text-xs text-red-500 font-medium mb-3">{hata}</p>
        )}

        {/* Kilit sayacı */}
        {kilitli && kilitSure > 0 && (
          <div className="bg-red-50 rounded-xl px-4 py-3 mb-3">
            <p className="text-sm text-red-600 font-medium">{kilitSure} saniye bekleyin</p>
          </div>
        )}

        {/* Geri dön */}
        <button onClick={() => window.history.back()}
          className="text-xs text-stone-400 hover:text-stone-600 mt-4 underline underline-offset-2 transition">
          Geri dön
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .shake { animation: shake 0.3s ease-in-out; }
      `}</style>
    </div>
  );
}

// Export hashPin for Ayarlar page
export { hashPin };
