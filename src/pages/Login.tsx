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
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const deviceResult = await checkAndBindDevice(email.trim());

      if (deviceResult.status === "blocked") {
        await signOut(auth);
        setError(deviceResult.message);
        setLoading(false);
        return;
      }

      if (deviceResult.status === "error") {
        console.warn("[DeviceBinding]", deviceResult.message);
      }

      navigate('/');
    } catch (err: any) {
      Sentry.captureException(err);
      setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #1a1a1a 0%, #2F2F2F 50%, #1a1a1a 100%)' }}>
      
      {/* Subtle dot pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}
      />
      
      {/* Glow behind card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.07]"
        style={{ background: 'radial-gradient(circle, #8FAF9A 0%, transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Card */}
        <div className="bg-[#242424] rounded-2xl border border-white/[0.06] shadow-2xl overflow-hidden">
          
          {/* Top accent line */}
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #8FAF9A, transparent)' }} />
          
          <div className="px-8 pt-10 pb-8">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center overflow-hidden bg-white shadow-lg">
                <img 
                  src="/mgt-app-logo.png" 
                  alt="MGT App" 
                  className="w-20 h-20 object-contain"
                />
              </div>
            </div>
            
            {/* Title */}
            <h1 className="text-xl font-bold text-center text-white tracking-wide mb-1">
              MGT Wedding
            </h1>
            <p className="text-center text-[#8A8A8A] text-xs tracking-wider mb-8">
              Şirket İçi Yönetim ve Operasyon Sistemi
            </p>

            {/* Error */}
            {error && (
              <div className="bg-[#D96C6C]/10 border border-[#D96C6C]/30 text-[#D96C6C] px-4 py-3 rounded-xl mb-5 text-sm whitespace-pre-line">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-[#8A8A8A] uppercase tracking-wider mb-2">
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
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/[0.08] rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-[#8FAF9A]/50 focus:border-[#8FAF9A]/30 transition-all"
                  placeholder="ornek@email.com"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#8A8A8A] uppercase tracking-wider mb-2">
                  Şifre
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/[0.08] rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-[#8FAF9A]/50 focus:border-[#8FAF9A]/30 transition-all"
                  placeholder="••••••••••"
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#8FAF9A] hover:bg-[#7A9E86] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-[#1a1a1a] font-semibold py-3 px-4 rounded-xl transition-all duration-200 mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#1a1a1a] border-t-transparent"></span>
                    Kontrol ediliyor...
                  </span>
                ) : (
                  'Giriş Yap'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[11px] font-semibold text-white/20 tracking-widest">MGT App®</p>
          <p className="text-[9px] text-white/10 mt-0.5">powered by Aziz Erkan Yolcu</p>
        </div>
      </div>
    </div>
  );
}
