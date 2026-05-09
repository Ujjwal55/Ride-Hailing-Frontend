'use client';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { apiLogout, getStoredRefreshToken } from '@/lib/auth';
import { disconnectSocket } from '@/lib/socket';

const roleColors: Record<string, string> = {
  rider: 'bg-blue-100 text-blue-700',
  driver: 'bg-green-100 text-green-700',
  admin: 'bg-red-100 text-red-700',
};

export default function Header() {
  const { user, accessToken, logout } = useStore();
  const router = useRouter();

  const handleLogout = async () => {
    if (accessToken) await apiLogout(accessToken, getStoredRefreshToken());
    disconnectSocket();
    logout();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm flex items-center justify-between px-4 py-2 h-12">
      <span className="font-bold text-blue-700 text-lg">GoComet Rides</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{user.name ?? user.email}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
          {user.role}
        </span>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600 border px-2 py-1 rounded">
          Logout
        </button>
      </div>
    </header>
  );
}
