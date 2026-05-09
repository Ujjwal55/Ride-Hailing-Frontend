'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import { useStore } from '@/lib/store';
import { apiFetch, configureApi } from '@/lib/api';
import { connectSocket, joinRideRoom } from '@/lib/socket';
import { distanceMetres } from '@/lib/geo';

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
  const [tier, setTier] = useState<'economy' | 'premium' | 'xl'>('economy');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'wallet' | 'cash'>('card');
  const [sosTriggered, setSosTriggered] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);

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
    const handleFailed = (data: any) => {
      // No drivers accepted within the retry window — reset so rider can try again
      const reason = data?.reason === 'no_drivers' ? 'No drivers available nearby.' : 'Could not find a driver. Please try again.';
      setCurrentRide(null);
      setStatus(reason);
    };

    socket.on('ride.assigned', handleAssigned);
    socket.on('driver.location', handleDriverLocation);
    socket.on('ride.started', handleStarted);
    socket.on('ride.ended', handleEnded);
    socket.on('ride.cancelled', handleCancelled);
    socket.on('ride.failed', handleFailed);

    return () => {
      socket.off('ride.assigned', handleAssigned);
      socket.off('driver.location', handleDriverLocation);
      socket.off('ride.started', handleStarted);
      socket.off('ride.ended', handleEnded);
      socket.off('ride.cancelled', handleCancelled);
      socket.off('ride.failed', handleFailed);
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
          body: JSON.stringify({ pickupLat: pickup!.lat, pickupLng: pickup!.lng, destLat: lat, destLng: lng, tier }),
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
          tier,
          paymentMethod,
        }),
      });
      setCurrentRide({ id: res.id, state: res.state, fareEstimate: res.fareEstimate });
      joinRideRoom(res.id);
      setStatus('Finding your driver… Each driver gets 30s to accept.');
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerSos = async (tripId: string) => {
    try {
      const res = await apiFetch<{ trackingUrl: string }>(`/v1/trips/${tripId}/sos`, {
        method: 'POST',
        body: JSON.stringify({ lat: driverLocation?.lat, lng: driverLocation?.lng }),
      });
      setSosTriggered(true);
      setTrackingUrl(res.trackingUrl);
    } catch (err: any) {
      alert(`SOS failed: ${err.message}`);
    }
  };

  const reset = () => {
    setPickup(null); setDest(null); setStep('pickup');
    setCurrentRide(null); setDriverLocation(null); setFareEst(null); setStatus('');
    setSosTriggered(false); setTrackingUrl(null);
    setTier('economy'); setPaymentMethod('card');
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

              {step === 'done' && (
                <div className="space-y-3 mb-3">
                  {/* Tier selector */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Ride type</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'economy', label: 'Economy', emoji: '🚗', desc: 'Affordable' },
                        { value: 'premium', label: 'Premium', emoji: '🚙', desc: 'Comfortable' },
                        { value: 'xl',      label: 'XL',      emoji: '🚐', desc: 'Extra space' },
                      ] as const).map((t) => (
                        <button key={t.value} onClick={() => setTier(t.value)}
                          className={`p-2 rounded-xl border text-center text-xs transition-all ${
                            tier === t.value
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}>
                          <div className="text-lg">{t.emoji}</div>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-gray-400">{t.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment method selector */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Payment</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'card',   label: 'Card',   emoji: '💳' },
                        { value: 'wallet', label: 'Wallet', emoji: '👛' },
                        { value: 'cash',   label: 'Cash',   emoji: '💵' },
                      ] as const).map((p) => (
                        <button key={p.value} onClick={() => setPaymentMethod(p.value)}
                          className={`p-2 rounded-xl border text-center text-xs transition-all ${
                            paymentMethod === p.value
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}>
                          <div className="text-lg">{p.emoji}</div>
                          <div className="font-medium">{p.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {step === 'done' && (
                  <button onClick={requestRide} disabled={loading} className="flex-1 bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium">
                    {loading ? 'Requesting...' : `Request ${tier.charAt(0).toUpperCase() + tier.slice(1)}${fareEst ? ` · ₹${fareEst.toFixed(0)}` : ''}`}
                  </button>
                )}
                <button onClick={reset} className="px-4 py-2 border rounded-xl text-gray-500 hover:bg-gray-50 text-sm">Reset</button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold text-gray-800 capitalize">Status: {currentRide.state}</p>
              <p className="text-sm text-gray-500">{status}</p>

              {/* Show driver distance on rider's screen when driver location is known */}
              {driverLocation && pickup && ['assigned', 'started'].includes(currentRide.state) && (() => {
                const target = currentRide.state === 'assigned' ? pickup : (dest ?? pickup);
                const distM = Math.round(distanceMetres(driverLocation, target));
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                    <span className="text-amber-700 font-medium">
                      🚗 Driver is {distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}km`} away
                      {currentRide.state === 'assigned' ? ' — heading to pickup' : ' — on the way'}
                    </span>
                  </div>
                );
              })()}

              {currentRide.state === 'ended' && <p className="text-green-600 font-medium">Fare: ₹{currentRide.fareFinal?.toFixed(0)}</p>}

              {/* SOS — only visible during active trip */}
              {currentRide.state === 'started' && (
                <div className="pt-1">
                  {!sosTriggered ? (
                    <button
                      onClick={() => {
                        if (confirm('Send emergency SOS? This will alert our safety team and share your live location.')) {
                          triggerSos(currentRide.id);
                        }
                      }}
                      className="w-full bg-red-600 text-white py-2 rounded-xl font-bold hover:bg-red-700 flex items-center justify-center gap-2"
                    >
                      🆘 Emergency SOS
                    </button>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-red-700 font-semibold text-sm">🚨 SOS Active — Safety team alerted</p>
                      {trackingUrl && (
                        <div className="mt-1">
                          <p className="text-xs text-gray-500 mb-1">Share this link with someone you trust:</p>
                          <a href={trackingUrl} target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 underline break-all">{trackingUrl}</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {/* Can only cancel before the trip physically starts — not during an active trip */}
                {currentRide.state !== 'ended' && currentRide.state !== 'started' && (
                  <button onClick={() => apiFetch(`/v1/rides/${currentRide.id}/cancel`, { method: 'POST' }).then(() => reset()).catch(() => {})}
                    className="text-sm text-red-500 hover:underline">Cancel ride</button>
                )}
                {currentRide.state === 'started' && (
                  <p className="text-xs text-gray-400">Trip in progress — only the driver can end the trip</p>
                )}
                {currentRide.state === 'ended' && <button onClick={reset} className="w-full bg-blue-600 text-white py-2 rounded-xl">Book another</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
