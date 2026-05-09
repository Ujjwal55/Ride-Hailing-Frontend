'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { apiRegister, parseJwtPayload } from '@/lib/auth';
import { configureApi } from '@/lib/api';
import { connectSocket } from '@/lib/socket';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', role: 'rider', name: '', phone: '', vehicleTier: 'economy' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setAccessToken } = useStore();
  const router = useRouter();

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRegister(form);
      setAccessToken(data.accessToken);
      setUser({ ...data.user, tenantId: parseJwtPayload(data.accessToken)?.tenantId ?? '' });
      configureApi(() => data.accessToken, () => router.push('/login'));
      connectSocket(data.accessToken);
      if (data.user.role === 'rider') router.push('/rider');
      else router.push('/driver');
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-teal-100">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Create Account</h1>
        <form onSubmit={handleRegister} className="space-y-3">
          <input className="w-full border rounded-lg px-4 py-2" type="email" placeholder="Email *" value={form.email} onChange={set('email')} required />
          <input className="w-full border rounded-lg px-4 py-2" type="password" placeholder="Password (min 8 chars) *" value={form.password} onChange={set('password')} required minLength={8} />
          <input className="w-full border rounded-lg px-4 py-2" type="text" placeholder="Full name" value={form.name} onChange={set('name')} />
          <input className="w-full border rounded-lg px-4 py-2" type="tel" placeholder="Phone" value={form.phone} onChange={set('phone')} />
          <select className="w-full border rounded-lg px-4 py-2" value={form.role} onChange={set('role')}>
            <option value="rider">Rider</option>
            <option value="driver">Driver</option>
          </select>
          {form.role === 'driver' && (
            <select className="w-full border rounded-lg px-4 py-2" value={form.vehicleTier} onChange={set('vehicleTier')}>
              <option value="economy">Economy</option>
              <option value="premium">Premium</option>
              <option value="xl">XL</option>
            </select>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Have an account? <Link href="/login" className="text-green-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
