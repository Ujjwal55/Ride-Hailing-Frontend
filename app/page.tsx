'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export default function Home() {
  const { user, _hasHydrated } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!_hasHydrated) return; // Wait for localStorage rehydration before redirecting
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'rider') router.replace('/rider');
    else if (user.role === 'driver') router.replace('/driver');
    else router.replace('/admin');
  }, [_hasHydrated, user, router]);

  return (
    <div className="flex items-center justify-center h-screen text-gray-400 text-sm">
      Loading...
    </div>
  );
}
