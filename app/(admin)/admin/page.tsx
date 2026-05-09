'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import { useStore } from '@/lib/store';
import { connectSocket } from '@/lib/socket';
import { apiFetch, configureApi } from '@/lib/api';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

interface DriverSnapshot {
  id: string;
  lastLat: number;
  lastLng: number;
  vehicleTier: string;
  status: string;
}

interface SosAlert {
  sosId: string;
  tripId: string;
  rideId: string;
  riderName: string;
  riderPhone: string | null;
  driverId: string | null;
  triggeredLat: number | null;
  triggeredLng: number | null;
  trackingUrl: string;
  triggeredAt: string;
}

export default function AdminPage() {
  const { _hasHydrated, user, accessToken } = useStore();
  const router = useRouter();
  const [drivers, setDrivers] = useState<DriverSnapshot[]>([]);
  const [pspRate, setPspRate] = useState(5);
  const [toast, setToast] = useState('');
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [activeRides, setActiveRides] = useState<any[]>([]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user || !accessToken) { router.replace('/login'); return; }
    if (user.role !== 'admin') { router.replace('/'); return; }

    // Wire API client so REST calls from this page include the auth token
    configureApi(() => accessToken, () => router.replace('/login'));

    // REST poll on mount — recovers SOS events and active rides missed while admin tab was closed
    apiFetch<{ activeRides: any[]; activeSos: any[] }>('/v1/admin/active')
      .then((data) => {
        setActiveRides(data.activeRides ?? []);
        if (data.activeSos?.length > 0) {
          setSosAlerts((prev) => {
            const existingIds = new Set(prev.map((a) => a.rideId));
            const newAlerts = data.activeSos.filter((s: any) => !existingIds.has(s.rideId));
            return [...newAlerts, ...prev];
          });
        }
      })
      .catch(() => {});

    const socket = connectSocket(accessToken);

    const handleSnapshot = (data: { availableDrivers: DriverSnapshot[]; activeRides?: any[] }) => {
      setDrivers(data.availableDrivers ?? []);
      if (data.activeRides !== undefined) setActiveRides(data.activeRides);
    };
    const handlePaymentFailed = (data: any) => {
      setToast(`Payment failed for trip ${data.tripId}: ${data.error}`);
      setTimeout(() => setToast(''), 5000);
    };
    const handleSos = (data: SosAlert) => {
      setSosAlerts((prev) => [data, ...prev.filter((a) => a.tripId !== data.tripId)]);
    };
    const handleSosResolved = (data: { tripId: string }) => {
      setSosAlerts((prev) => prev.filter((a) => a.tripId !== data.tripId));
    };

    socket.on('admin.snapshot', handleSnapshot);
    socket.on('payment.failed', handlePaymentFailed);
    socket.on('sos.triggered', handleSos);
    socket.on('sos.resolved', handleSosResolved);

    return () => {
      socket.off('admin.snapshot', handleSnapshot);
      socket.off('payment.failed', handlePaymentFailed);
      socket.off('sos.triggered', handleSos);
      socket.off('sos.resolved', handleSosResolved);
    };
  }, [_hasHydrated, user?.id, accessToken]);

  if (!_hasHydrated) return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading...</div>;
  if (!user) return null;

  const updatePspRate = async () => {
    try {
      await apiFetch('/dev/psp-failure-rate', { method: 'PATCH', body: JSON.stringify({ rate: pspRate / 100 }) });
      setToast(`PSP failure rate set to ${pspRate}%`);
      setTimeout(() => setToast(''), 2000);
    } catch (err: any) { setToast(err.message); }
  };

  const forceEndRide = async (rideId: string) => {
    if (!confirm('Force-end this ride? This will cancel it and free the driver.')) return;
    try {
      await apiFetch(`/v1/admin/rides/${rideId}/force-end`, { method: 'POST' });
      setActiveRides((prev) => prev.filter((r) => r.id !== rideId));
      setToast('Ride force-ended');
      setTimeout(() => setToast(''), 2000);
    } catch (err: any) { setToast(err.message); }
  };

  const resolveSos = async (rideId: string) => {
    try {
      await apiFetch(`/v1/trips/${rideId}/sos/resolve`, { method: 'POST' });
      setSosAlerts((prev) => prev.filter((a) => a.rideId !== rideId));
    } catch (err: any) { setToast(err.message); }
  };

  const driverMarkers = drivers
    .filter((d) => d.lastLat && d.lastLng)
    .map((d) => ({ id: d.id, lat: d.lastLat, lng: d.lastLng, color: '#22c55e', emoji: '🚗' }));

  const sosMarkers = sosAlerts
    .filter((s) => s.triggeredLat && s.triggeredLng)
    .map((s) => ({ id: `sos-${s.sosId}`, lat: s.triggeredLat!, lng: s.triggeredLng!, color: '#dc2626', emoji: '🆘' }));

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* SOS banner — full width, above everything */}
      {sosAlerts.length > 0 && (
        <div className="mt-12 bg-red-600 text-white px-4 py-2 flex items-center gap-3 z-50">
          <span className="text-xl animate-pulse">🚨</span>
          <span className="font-bold flex-1">
            EMERGENCY SOS — {sosAlerts[0].riderName}
            {sosAlerts[0].riderPhone && ` · ${sosAlerts[0].riderPhone}`}
          </span>
          <a href={sosAlerts[0].trackingUrl} target="_blank" rel="noreferrer"
            className="bg-white text-red-600 text-xs font-bold px-3 py-1 rounded hover:bg-red-50">
            Track Live
          </a>
          <button onClick={() => resolveSos(sosAlerts[0].rideId)}
            className="bg-red-800 text-white text-xs px-3 py-1 rounded hover:bg-red-900">
            Resolve
          </button>
          {sosAlerts.length > 1 && (
            <span className="text-xs bg-red-800 px-2 py-1 rounded">+{sosAlerts.length - 1} more</span>
          )}
        </div>
      )}

      <div className={`flex-1 flex ${sosAlerts.length > 0 ? '' : 'mt-12'}`}>
        {/* Map */}
        <div className="flex-1 relative">
          <Map markers={[...driverMarkers, ...sosMarkers]} />
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

          {/* Active SOS list */}
          {sosAlerts.length > 0 && (
            <div className="border-b bg-red-50">
              {sosAlerts.map((alert) => (
                <div key={alert.sosId} className="p-3 border-b border-red-100 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-red-700">🆘 SOS — {alert.riderName}</p>
                    <button onClick={() => resolveSos(alert.rideId)}
                      className="text-xs text-red-600 border border-red-300 px-2 py-0.5 rounded hover:bg-red-100">
                      Resolve
                    </button>
                  </div>
                  {alert.riderPhone && <p className="text-xs text-red-600">{alert.riderPhone}</p>}
                  <a href={alert.trackingUrl} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-600 underline">View tracking link</a>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Active rides */}
            {activeRides.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Rides ({activeRides.length})</p>
                <div className="space-y-1">
                  {activeRides.map((r) => (
                    <div key={r.id} className="bg-blue-50 rounded-lg p-2 text-xs mb-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`px-1.5 py-0.5 rounded text-white text-xs font-medium ${
                          r.state === 'started' ? 'bg-green-500' : r.state === 'assigned' ? 'bg-blue-500' : 'bg-yellow-500'
                        }`}>{r.state}</span>
                        <button
                          onClick={() => forceEndRide(r.id)}
                          className="text-xs text-red-500 border border-red-300 px-1.5 py-0.5 rounded hover:bg-red-50"
                        >
                          Force End
                        </button>
                      </div>
                      <p className="text-gray-500 truncate capitalize">{r.tier} · {r.id.slice(0, 8)}...</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available drivers */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Available Drivers ({drivers.length})</p>
              {drivers.map((d) => (
                <div key={d.id} className="bg-gray-50 rounded-lg p-2 text-xs mb-1">
                  <p className="font-medium text-gray-700 truncate">{d.id.slice(0, 8)}...</p>
                  <p className="text-gray-500 capitalize">{d.vehicleTier} · {d.status}</p>
                  <p className="text-gray-400">{d.lastLat?.toFixed(4)}, {d.lastLng?.toFixed(4)}</p>
                </div>
              ))}
              {drivers.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No available drivers</p>}
            </div>
          </div>

          <div className="p-4 border-t space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dev Controls</p>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Simulate Payment Failures: {pspRate}%
              </label>
              <p className="text-xs text-gray-400 mb-1">
                Set to 100% to force failures and watch the outbox retry with backoff. Set back to 0% to see it recover.
              </p>
              <input type="range" min={0} max={100} value={pspRate} onChange={(e) => setPspRate(Number(e.target.value))}
                className="w-full" />
              <button onClick={updatePspRate} className="w-full mt-1 text-xs bg-orange-500 text-white py-1 rounded hover:bg-orange-600">
                Apply ({pspRate}% failure rate)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
