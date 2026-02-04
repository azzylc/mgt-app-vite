import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';

interface Personel {
  id: string;
  ad: string;
  soyad: string;
  isim: string; // ad + soyad birleşik (eski sistemle uyumluluk)
  email: string;
  telefon: string;
  instagram?: string;
  emoji?: string;
  kisaltma?: string;
  dogumTarihi?: string;
  iseBaslama?: string;
  istenAyrilma?: string; // İşten ayrılma tarihi
  grupEtiketleri: string[];
  aktif: boolean;
  kullaniciTuru?: string;
  yillikIzinHakki?: number;
}

type PersonelFiltre = 'aktif' | 'pasif' | 'hepsi';

/**
 * Firebase'den personelleri çeker
 * @param filtre - 'aktif' (varsayılan), 'pasif' veya 'hepsi'
 */
export function usePersoneller(filtre: PersonelFiltre = 'aktif') {
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    
    // Filtreye göre query oluştur
    if (filtre === 'aktif') {
      q = query(
        collection(db, 'personnel'),
        where('aktif', '==', true)
      );
    } else if (filtre === 'pasif') {
      q = query(
        collection(db, 'personnel'),
        where('aktif', '==', false)
      );
    } else {
      // 'hepsi' - filtre yok
      q = query(collection(db, 'personnel'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ad: doc.data().ad || '',
        soyad: doc.data().soyad || '',
        isim: `${doc.data().ad || ''} ${doc.data().soyad || ''}`.trim(),
        email: doc.data().email || '',
        telefon: doc.data().telefon || '',
        instagram: doc.data().instagram || '',
        emoji: doc.data().emoji || '👤',
        kisaltma: doc.data().kisaltma || '',
        dogumTarihi: doc.data().dogumTarihi || '',
        iseBaslama: doc.data().iseBaslama || '',
        istenAyrilma: doc.data().istenAyrilma || '',
        grupEtiketleri: doc.data().grupEtiketleri || [],
        aktif: doc.data().aktif !== false,
        kullaniciTuru: doc.data().kullaniciTuru || 'Personel',
        yillikIzinHakki: doc.data().yillikIzinHakki || 0,
      } as Personel));
      
      setPersoneller(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filtre]); // filtre değişince yeniden subscribe

  return { personeller, loading };
}

/**
 * İsim veya kısaltma ile personel bulur
 * @param isim - "Zehra Kula" veya "Zehra" veya "R" gibi
 * @param personelListesi - Personel listesi
 */
export function getPersonelByIsim(isim: string, personelListesi: Personel[]): Personel | undefined {
  if (!isim || !personelListesi.length) return undefined;

  const aramaTerimi = isim.trim();

  return personelListesi.find(p => {
    const tamIsim = `${p.ad} ${p.soyad}`;
    
    // 1. Kısaltma ile tam eşleşme
    if (p.kisaltma && p.kisaltma.toLowerCase() === aramaTerimi.toLowerCase()) {
      return true;
    }

    // 2. Tam isim ile tam eşleşme
    if (tamIsim.toLowerCase() === aramaTerimi.toLowerCase()) {
      return true;
    }

    // 3. Sadece ad ile eşleşme (örn: "Zehra")
    if (p.ad.toLowerCase() === aramaTerimi.toLowerCase()) {
      return true;
    }

    // 4. Kısmen eşleşme (içerir)
    if (tamIsim.toLowerCase().includes(aramaTerimi.toLowerCase())) {
      return true;
    }

    return false;
  });
}

/**
 * Personel ID ile personel bulur
 */
export function getPersonelById(id: string, personelListesi: Personel[]): Personel | undefined {
  return personelListesi.find(p => p.id === id);
}
