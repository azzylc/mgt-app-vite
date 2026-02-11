import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, orderBy, query, where, onSnapshot } from "firebase/firestore";
import * as Sentry from '@sentry/react';
import { useAuth } from "../../context/RoleProvider";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyr_9fBVzkVXf-Fx4s-DUjFTPhHlxm54oBGrrG3UGfNengHOp8rQbXKdX8pOk4reH8/exec";

interface KarsilastirmaSonuc {
  firestoreCount: number;
  excelCount: number;
  eslesenler: any[];
  sadeceFistore: any[];
  sadeceExcel: any[];
}

export default function ComparePage() {
  const navigate = useNavigate();
  const user = useAuth();
  const [yetkisiz, setYetkisiz] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [sonuc, setSonuc] = useState<KarsilastirmaSonuc | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auth kontrolü - Sadece kurucu
  // İsim normalizasyon fonksiyonu
  const normalizeIsim = (isim: string): string => {
    if (!isim) return '';
    return isim.split('✅')[0].trim().toLowerCase();
  };

  // Karşılaştırma fonksiyonu
  const karsilastir = async () => {
    setComparing(true);
    setSonuc(null);
    setError(null);

    try {
      
      // 1. FIRESTORE'DAN GELİNLERİ ÇEK (2025+)
      
      const q = query(
        collection(db, 'gelinler'),
        where("tarih", ">=", "2025-01-01"),
        orderBy('tarih', 'asc')
      );
      const snapshot = await getDocs(q);
      
      const firestoreGelinler: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        firestoreGelinler.push({
          id: doc.id,
          isim: data.isim || '',
          tarih: data.tarih || '',
          saat: data.saat || '',
        });
      });
      
      
      // 2. EXCEL'DEN GELİNLERİ ÇEK
      
      const response = await fetch(`${APPS_SCRIPT_URL}?action=gelinler`);
      const excelData = await response.json();
      
      // 2025+ filtrele - data direkt array olarak geliyor
      const excelGelinler = (Array.isArray(excelData) ? excelData : excelData.data || [])
        .filter((g: any) => g.tarih >= '2025-01-01');
      
      
      // 3. KARŞILAŞTIR
      
      const eslesenler: any[] = [];
      const sadeceFistore: any[] = [];
      const sadeceExcel: any[] = [];
      
      // Firestore gelinlerini kontrol et
      firestoreGelinler.forEach(fg => {
        const eslesen = excelGelinler.find((eg: any) => 
          normalizeIsim(eg.isim) === normalizeIsim(fg.isim) && 
          eg.tarih === fg.tarih
        );
        
        if (eslesen) {
          eslesenler.push({ firestore: fg, excel: eslesen });
        } else {
          sadeceFistore.push(fg);
        }
      });
      
      // Excel'de olup Firestore'da olmayan
      excelGelinler.forEach((eg: any) => {
        const eslesen = firestoreGelinler.find(fg => 
          normalizeIsim(fg.isim) === normalizeIsim(eg.isim) && 
          fg.tarih === eg.tarih
        );
        
        if (!eslesen) {
          sadeceExcel.push(eg);
        }
      });
      
      
      setSonuc({
        firestoreCount: firestoreGelinler.length,
        excelCount: excelGelinler.length,
        eslesenler,
        sadeceFistore,
        sadeceExcel
      });
      
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setComparing(false);
    }
  };

  if (yetkisiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-[#2F2F2F]">Yetkisiz Erişim</h2>
          <p className="text-[#2F2F2F] mt-2">Bu sayfaya sadece kurucular erişebilir.</p>
          <button 
            onClick={() => navigate("/yonetim")}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            Yönetim Paneline Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <div>
        <header className="bg-white border-b px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#2F2F2F]">🔄 Firestore vs Excel Karşılaştırma</h1>
              <p className="text-sm text-[#8A8A8A]">2025 ve sonrası gelinleri karşılaştır</p>
            </div>
            <button
              onClick={() => navigate("/yonetim")}
              className="px-4 py-2 text-[#2F2F2F] hover:bg-white rounded-lg"
            >
              ← Geri
            </button>
          </div>
        </header>

        <main className="p-4 md:p-6">

        {/* Karşılaştır Butonu */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-6 mb-6">
          <button
            onClick={karsilastir}
            disabled={comparing}
            className="w-full py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-medium"
          >
            {comparing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Karşılaştırılıyor...
              </>
            ) : (
              <>
                🔍 Karşılaştırmayı Başlat
              </>
            )}
          </button>
          
          {error && (
            <div className="mt-4 p-4 bg-[#D96C6C]/10 border border-[#D96C6C]/30 rounded-lg text-[#D96C6C]">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Sonuçlar */}
        {sonuc && (
          <div className="space-y-6">
            {/* Özet Kartlar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-4">
                <div className="text-3xl font-bold text-blue-600">{sonuc.firestoreCount}</div>
                <div className="text-sm text-[#2F2F2F]">Firestore (2025+)</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-4">
                <div className="text-3xl font-bold text-[#8FAF9A]">{sonuc.excelCount}</div>
                <div className="text-sm text-[#2F2F2F]">Excel (2025+)</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-4">
                <div className="text-3xl font-bold text-[#8FAF9A]">{sonuc.eslesenler.length}</div>
                <div className="text-sm text-[#2F2F2F]">✅ Eşleşen</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[#E5E5E5] p-4">
                <div className="text-3xl font-bold text-[#E6B566]">{sonuc.sadeceFistore.length + sonuc.sadeceExcel.length}</div>
                <div className="text-sm text-[#2F2F2F]">⚠️ Farklı</div>
              </div>
            </div>

            {/* Sadece Firestore */}
            {sonuc.sadeceFistore.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden">
                <div className="px-4 py-3 bg-[#E6B566]/10 border-b border-orange-200">
                  <h3 className="font-semibold text-orange-800">
                    ⚠️ Sadece Firestore'da ({sonuc.sadeceFistore.length})
                  </h3>
                  <p className="text-sm text-[#E6B566]">Excel'de bulunamadı</p>
                </div>
                <div className="divide-y divide-[#E5E5E5] max-h-64 overflow-y-auto">
                  {sonuc.sadeceFistore.map((g, i) => (
                    <div key={i} className="px-4 py-2 text-sm">
                      <span className="font-medium">{g.isim}</span>
                      <span className="text-[#8A8A8A] ml-2">{g.tarih}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sadece Excel */}
            {sonuc.sadeceExcel.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-purple-200 overflow-hidden">
                <div className="px-4 py-3 bg-purple-50 border-b border-purple-200">
                  <h3 className="font-semibold text-purple-800">
                    ⚠️ Sadece Excel'de ({sonuc.sadeceExcel.length})
                  </h3>
                  <p className="text-sm text-purple-600">Firestore'da bulunamadı</p>
                </div>
                <div className="divide-y divide-[#E5E5E5] max-h-64 overflow-y-auto">
                  {sonuc.sadeceExcel.map((g, i) => (
                    <div key={i} className="px-4 py-2 text-sm">
                      <span className="font-medium">{g.isim}</span>
                      <span className="text-[#8A8A8A] ml-2">{g.tarih}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hepsi Eşleşti */}
            {sonuc.sadeceFistore.length === 0 && sonuc.sadeceExcel.length === 0 && (
              <div className="bg-[#EAF2ED] border border-green-200 rounded-lg p-6 text-center">
                <div className="text-4xl mb-2">✅</div>
                <h3 className="text-xl font-bold text-green-800">Mükemmel!</h3>
                <p className="text-[#8FAF9A]">Tüm veriler senkronize, farklılık yok.</p>
              </div>
            )}
          </div>
        )}
        </main>
      </div>
    </div>
  );
}