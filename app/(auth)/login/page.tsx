'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { apiLogin, parseJwtPayload } from '@/lib/auth';
import { configureApi } from '@/lib/api';
import { connectSocket } from '@/lib/socket';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setAccessToken } = useStore();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(email, password);
      setAccessToken(data.accessToken);
      setUser({ ...data.user, tenantId: parseJwtPayload(data.accessToken)?.tenantId ?? '' });
      configureApi(() => data.accessToken, () => router.push('/login'));
      connectSocket(data.accessToken);
      if (data.user.role === 'rider') router.push('/rider');
      else if (data.user.role === 'driver') router.push('/driver');
      else router.push('/admin');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">GoComet Rides</h1>
        <p className="text-gray-500 mb-6 text-sm">Sign in to your account</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          No account? <Link href="/register" className="text-blue-600 hover:underline">Register</Link>
        </p>
        <div className="mt-4 text-xs text-gray-400 border-t pt-3">
          <p>Demo accounts (password: pass1234)</p>
          <p>rider@demo.com | driver1@demo.com | admin@demo.com</p>
        </div>
      </div>
    </div>
  );
}
