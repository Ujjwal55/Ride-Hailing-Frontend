'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import { useStore } from '@/lib/store';
import { connectSocket } from '@/lib/socket';
import { apiFetch } from '@/lib/api';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

interface DriverSnapshot {
  id: string;
  lastLat: number;
  lastLng: number;
  vehicleTier: string;
  status: string;
}

export default function AdminPage() {
  const { _hasHydrated, user, accessToken } = useStore();
  const router = useRouter();
  const [drivers, setDrivers] = useState<DriverSnapshot[]>([]);
  const [pspRate, setPspRate] = useState(5);
  const [toast, setToast] = useState('');

  // Hook must be before any early return
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user || !accessToken) { router.replace('/login'); return; }
    if (user.role !== 'admin') { router.replace('/'); return; }

    const socket = connectSocket(accessToken);

    const handleSnapshot = (data: { availableDrivers: DriverSnapshot[] }) => setDrivers(data.availableDrivers ?? []);
    const handlePaymentFailed = (data: any) => {
      setToast(`Payment failed for trip ${data.tripId}: ${data.error}`);
      setTimeout(() => setToast(''), 5000);
    };

    socket.on('admin.snapshot', handleSnapshot);
    socket.on('payment.failed', handlePaymentFailed);

    return () => {
      socket.off('admin.snapshot', handleSnapshot);
      socket.off('payment.failed', handlePaymentFailed);
    };
  }, [_hasHydrated, user?.id, accessToken]);

  // Early return AFTER all hooks
  if (!_hasHydrated) return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading...</div>;
  if (!user) return null;

  const updatePspRate = async () => {
    try {
      await apiFetch('/dev/psp-failure-rate', { method: 'PATCH', body: JSON.stringify({ rate: pspRate / 100 }) });
      setToast(`PSP failure rate set to ${pspRate}%`);
      setTimeout(() => setToast(''), 2000);
    } catch (err: any) { setToast(err.message); }
  };

  const markers = drivers
    .filter((d) => d.lastLat && d.lastLng)
    .map((d) => ({ id: d.id, lat: d.lastLat, lng: d.lastLng, color: '#22c55e', emoji: '🚗' }));

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 mt-12 flex">
        {/* Map */}
        <div className="flex-1 relative">
          <Map markers={markers} />
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg z-20 shadow">
              {toast}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-72 bg-white shadow-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-bold text-gray-800">Admin Dashboard</h2>
            <p className="text-sm text-gray-500 mt-1">{drivers.length} drivers available</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {drivers.map((d) => (
              <div key={d.id} className="bg-gray-50 rounded-lg p-2 text-xs">
                <p className="font-medium text-gray-700 truncate">{d.id.slice(0, 8)}...</p>
                <p className="text-gray-500 capitalize">{d.vehicleTier} · {d.status}</p>
                <p className="text-gray-400">{d.lastLat?.toFixed(4)}, {d.lastLng?.toFixed(4)}</p>
              </div>
            ))}
            {drivers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No available drivers</p>}
          </div>

          <div className="p-4 border-t space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">PSP Failure Rate: {pspRate}%</label>
              <input type="range" min={0} max={100} value={pspRate} onChange={(e) => setPspRate(Number(e.target.value))}
                className="w-full mt-1" />
              <button onClick={updatePspRate} className="w-full mt-1 text-xs bg-orange-500 text-white py-1 rounded hover:bg-orange-600">
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
