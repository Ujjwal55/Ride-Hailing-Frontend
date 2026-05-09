'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import { useStore } from '@/lib/store';
import { apiFetch, configureApi } from '@/lib/api';
import { connectSocket, joinRideRoom } from '@/lib/socket';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

type ClickStep = 'pickup' | 'dest' | 'done';

export default function RiderPage() {
  const { _hasHydrated, user, accessToken, currentRide, setCurrentRide, driverLocation, setDriverLocation } = useStore();
  const router = useRouter();
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(null);
  const [step, setStep] = useState<ClickStep>('pickup');
  const [fareEst, setFareEst] = useState<number | null>(null);
  const [surge, setSurge] = useState<number>(1.0);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // ALL hooks must run before any early return — check _hasHydrated inside the effect
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user || !accessToken) { router.replace('/login'); return; }
    if (user.role !== 'rider') { router.replace('/'); return; }

    configureApi(() => accessToken, () => router.replace('/login'));

    const socket = connectSocket(accessToken);

    const handleAssigned = (data: any) => {
      setCurrentRide({ id: data.rideId, state: 'assigned', driverId: data.driverId });
      setStatus('Driver assigned! Heading to you...');
      joinRideRoom(data.rideId);
    };
    const handleDriverLocation = (data: any) => setDriverLocation({ lat: data.lat, lng: data.lng });
    const handleStarted = (data: any) => { setCurrentRide({ id: data.rideId, state: 'started' }); setStatus('Trip started!'); };
    const handleEnded = (data: any) => {
      setCurrentRide({ id: data.rideId, state: 'ended', fareFinal: Number(data.fare) });
      setStatus(`Trip ended! Fare: ₹${Number(data.fare).toFixed(0)}`);
    };
    const handleCancelled = () => { setCurrentRide(null); setStatus('Ride cancelled.'); };

    socket.on('ride.assigned', handleAssigned);
    socket.on('driver.location', handleDriverLocation);
    socket.on('ride.started', handleStarted);
    socket.on('ride.ended', handleEnded);
    socket.on('ride.cancelled', handleCancelled);

    return () => {
      socket.off('ride.assigned', handleAssigned);
      socket.off('driver.location', handleDriverLocation);
      socket.off('ride.started', handleStarted);
      socket.off('ride.ended', handleEnded);
      socket.off('ride.cancelled', handleCancelled);
    };
  }, [_hasHydrated, user?.id, accessToken]);

  // Early returns come AFTER all hooks
  if (!_hasHydrated) return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading...</div>;
  if (!user) return null;

  const handleMapClick = async (lat: number, lng: number) => {
    if (currentRide && currentRide.state !== 'ended' && currentRide.state !== 'cancelled') return;
    if (step === 'pickup') {
      setPickup({ lat, lng }); setStep('dest'); setStatus('Now click your destination');
    } else if (step === 'dest') {
      setDest({ lat, lng }); setStep('done');
      try {
        const res = await apiFetch<{ fareEstimate: number; surgeMultiplier: number }>('/v1/rides/estimate', {
          method: 'POST',
          body: JSON.stringify({ pickupLat: pickup!.lat, pickupLng: pickup!.lng, destLat: lat, destLng: lng }),
        });
        setFareEst(Number(res.fareEstimate));
        setSurge(Number(res.surgeMultiplier));
        setStatus(`Estimated fare: ₹${Number(res.fareEstimate).toFixed(0)} (surge ${Number(res.surgeMultiplier)}x)`);
      } catch {}
    }
  };

  const requestRide = async () => {
    if (!pickup || !dest) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ id: string; state: string; fareEstimate: number; surgeMultiplier: number }>('/v1/rides', {
        method: 'POST',
        body: JSON.stringify({
          pickupLat: pickup.lat, pickupLng: pickup.lng,
          destLat: dest.lat, destLng: dest.lng,
          tier: 'economy', paymentMethod: 'card',
        }),
      });
      setCurrentRide({ id: res.id, state: res.state, fareEstimate: res.fareEstimate });
      joinRideRoom(res.id);
      setStatus('Finding your driver...');
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPickup(null); setDest(null); setStep('pickup');
    setCurrentRide(null); setDriverLocation(null); setFareEst(null); setStatus('');
  };

  const markers = [
    ...(pickup ? [{ id: 'pickup', lat: pickup.lat, lng: pickup.lng, color: '#22c55e', emoji: 'P' }] : []),
    ...(dest ? [{ id: 'dest', lat: dest.lat, lng: dest.lng, color: '#ef4444', emoji: 'D' }] : []),
    ...(driverLocation ? [{ id: 'driver', lat: driverLocation.lat, lng: driverLocation.lng, color: '#f59e0b', emoji: '🚗' }] : []),
  ];

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 mt-12 relative">
        <Map markers={markers} onClick={handleMapClick}
          routeCoords={pickup && dest ? [pickup, ...(driverLocation ? [driverLocation] : []), dest] : undefined} />

        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 z-10">
          {!currentRide || ['ended', 'cancelled', 'failed'].includes(currentRide.state) ? (
            <>
              <p className="text-sm text-gray-500 mb-2">
                {step === 'pickup' ? 'Click map to set pickup' : step === 'dest' ? 'Click map to set destination' : 'Ready to request'}
              </p>
              {status && <p className="text-sm font-medium text-blue-600 mb-2">{status}</p>}
              {fareEst && surge > 1 && <p className="text-xs text-orange-500 mb-2">Surge active: {surge}x</p>}
              <div className="flex gap-2">
                {step === 'done' && (
                  <button onClick={requestRide} disabled={loading} className="flex-1 bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium">
                    {loading ? 'Requesting...' : `Request Ride${fareEst ? ` · ₹${fareEst.toFixed(0)}` : ''}`}
                  </button>
                )}
                <button onClick={reset} className="px-4 py-2 border rounded-xl text-gray-500 hover:bg-gray-50 text-sm">Reset</button>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <p className="font-semibold text-gray-800 capitalize">Status: {currentRide.state}</p>
              <p className="text-sm text-gray-500">{status}</p>
              {currentRide.state === 'ended' && <p className="text-green-600 font-medium">Fare: ₹{currentRide.fareFinal?.toFixed(0)}</p>}
              {currentRide.state !== 'ended' && (
                <button onClick={() => apiFetch(`/v1/rides/${currentRide.id}/cancel`, { method: 'POST' }).then(() => reset()).catch(() => {})}
                  className="text-sm text-red-500 hover:underline">Cancel ride</button>
              )}
              {currentRide.state === 'ended' && <button onClick={reset} className="mt-2 w-full bg-blue-600 text-white py-2 rounded-xl">Book another</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
