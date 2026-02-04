import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      console.log('🔥 [LOGIN] Attempting login...');
      await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ [LOGIN] Success!');
      navigate('/');
    } catch (err: any) {
      console.error('❌ [LOGIN] Error:', err);
      setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-900">
      <div className="bg-stone-800 p-8 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center">
            <span className="text-2xl">👰</span>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          Gizem Yolcu Studio
        </h1>
        <p className="text-center text-stone-400 mb-8">
          Gelin Güzelliği Yönetim Sistemi
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              E-posta
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-stone-700 border border-stone-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="ornek@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-stone-700 border border-stone-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Giriş Yap
          </button>
        </form>

        <p className="text-center text-stone-500 text-sm mt-6">
          © 2025 Gizem Yolcu Studio
        </p>
      </div>
    </div>
  );
}
