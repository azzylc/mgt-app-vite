import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { checkAndBindDevice } from '../lib/deviceBinding';
import * as Sentry from '@sentry/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Firebase Auth ile giriş
      await signInWithEmailAndPassword(auth, email.trim(), password);

      // 2. Cihaz kontrolü
      const deviceResult = await checkAndBindDevice(email.trim());

      if (deviceResult.status === "blocked") {
        // Farklı cihaz → çıkış yap, hata göster
        await signOut(auth);
        setError(deviceResult.message);
        setLoading(false);
        return;
      }

      if (deviceResult.status === "error") {
        // Hata durumunda yine de devam etsin (cihaz kontrolü kritik değilse)
        // İsterseniz burayı da block yapabilirsiniz
        console.warn("[DeviceBinding]", deviceResult.message);
      }

      // 3. Başarılı → ana sayfaya yönlendir
      navigate('/');
    } catch (err: any) {
      Sentry.captureException(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
      } else {
        setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#2F2F2F]">
      <div className="bg-[#2F2F2F] p-8 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-[#8FAF9A] rounded-full flex items-center justify-center">
            <span className="text-2xl">👰</span>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          Gizem Yolcu Studio
        </h1>
        <p className="text-center text-[#8A8A8A] mb-8">
          Gelin Güzelliği Yönetim Sistemi
        </p>

        {error && (
          <div className="bg-[#D96C6C]/10 border border-red-500 text-[#D96C6C] px-4 py-3 rounded mb-4 text-sm whitespace-pre-line">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#8A8A8A] mb-2">
              E-posta
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              spellCheck={false}
              className="w-full px-4 py-3 bg-[#2F2F2F] border border-[#2F2F2F] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]"
              placeholder="ornek@email.com"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#8A8A8A] mb-2">
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#2F2F2F] border border-[#2F2F2F] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#8FAF9A]"
              placeholder="••••••••••"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#8FAF9A] hover:bg-[#7A9E86] disabled:opacity-50 disabled:cursor-not-allowed text-[#2F2F2F] font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#2F2F2F] border-t-transparent"></span>
                Kontrol ediliyor...
              </span>
            ) : (
              'Giriş Yap'
            )}
          </button>
        </form>

        <p className="text-center text-[#8A8A8A] text-sm mt-6">
          © 2025 Gizem Yolcu Studio
        </p>
      </div>
    </div>
  );
}
