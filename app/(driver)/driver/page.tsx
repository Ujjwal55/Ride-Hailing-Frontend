'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import OfferModal from '@/components/OfferModal';
import { useStore } from '@/lib/store';
import { apiFetch, configureApi } from '@/lib/api';
import { connectSocket, joinRideRoom } from '@/lib/socket';
import { moveToward, distanceMetres } from '@/lib/geo';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

const DEFAULT_LOCATION = { lat: 12.9716, lng: 77.5946 };

export default function DriverPage() {
  const { _hasHydrated, user, accessToken, online, setOnline, pendingOffer, setPendingOffer, currentRide, setCurrentRide, setTripId, tripId } = useStore();
  const router = useRouter();
  const locationRef = useRef(DEFAULT_LOCATION);
  const [displayLocation, setDisplayLocation] = useState(DEFAULT_LOCATION);
  const [rideState, setRideState] = useState<string>('idle');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Refs mirror state so the setInterval closure always reads current values (avoids stale closure)
  const rideStateRef = useRef<string>('idle');
  const pickupRef = useRef<{ lat: number; lng: number } | null>(null);
  const destRef = useRef<{ lat: number; lng: number } | null>(null);
  const showToastFn = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ALL hooks before any early return — guard with _hasHydrated inside the effect
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user || !accessToken) { router.replace('/login'); return; }
    if (user.role !== 'driver') { router.replace('/'); return; }

    configureApi(() => accessToken, () => router.replace('/login'));

    const socket = connectSocket(accessToken);

    const handleOffer = (offer: any) => setPendingOffer(offer);
    const handleExpired = () => { setPendingOffer(null); showToastFn('Offer expired'); };
    // SOS handler — show alert to driver but do NOT reset any ride state
    const handleSos = (data: any) => {
      showToastFn(`🚨 ${data.riderName ?? 'Rider'} has triggered an SOS. Please ensure their safety.`);
    };
    const handleRideCancelled = () => {
      // Clear location ping interval directly via ref (stopLocationPings defined after early return)
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setRideStateSynced('idle');
      setCurrentRide(null);
      setPickupSynced(null);
      setDestSynced(null);
      setTripId(null);
      setOnline(false);
      showToastFn('Rider cancelled the ride');
      if (user?.id) {
        apiFetch(`/v1/drivers/${user.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'offline' }),
        }).catch(() => {});
      }
    };

    socket.on('offer.new', handleOffer);
    socket.on('offer.expired', handleExpired);
    socket.on('sos.triggered', handleSos);
    socket.on('ride.cancelled', handleRideCancelled);

    return () => {
      socket.off('offer.new', handleOffer);
      socket.off('offer.expired', handleExpired);
      socket.off('sos.triggered', handleSos);
      socket.off('ride.cancelled', handleRideCancelled);
    };
  }, [_hasHydrated, user?.id, accessToken]);

  // Early returns come AFTER all hooks
  if (!_hasHydrated) return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading...</div>;
  if (!user) return null;

  // Helpers that keep state and ref in sync — use these instead of setRideState/setPickup/setDest directly
  const setRideStateSynced = (s: string) => { rideStateRef.current = s; setRideState(s); };
  const setPickupSynced = (p: { lat: number; lng: number } | null) => { pickupRef.current = p; setPickup(p); };
  const setDestSynced = (d: { lat: number; lng: number } | null) => { destRef.current = d; setDest(d); };

  const startLocationPings = () => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(async () => {
      // Read from refs — not state — so the closure always gets current values
      const target = rideStateRef.current === 'assigned' && pickupRef.current
        ? pickupRef.current
        : rideStateRef.current === 'started' && destRef.current
        ? destRef.current
        : null;

      if (target) {
        const next = moveToward(locationRef.current, target);
        locationRef.current = next;
        setDisplayLocation({ ...next });
        if (next.arrived && rideStateRef.current === 'started') showToastFn('Arrived at destination! End the trip.');
      }

      try {
        await apiFetch(`/v1/drivers/${user.id}/location`, {
          method: 'POST',
          body: JSON.stringify({ lat: locationRef.current.lat, lng: locationRef.current.lng, ts: Date.now() }),
        });
      } catch {}
    }, 1000);
  };

  const stopLocationPings = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const toggleOnline = async () => {
    const newStatus = online ? 'offline' : 'available';
    try {
      await apiFetch(`/v1/drivers/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      setOnline(!online);
      if (!online) startLocationPings(); else stopLocationPings();
    } catch (err: any) { showToastFn(err.message); }
  };

  const acceptOffer = async () => {
    if (!pendingOffer) return;
    try {
      await apiFetch(`/v1/rides/drivers/${user.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({ rideId: pendingOffer.rideId, offerId: pendingOffer.offerId }),
      });
      setCurrentRide({ id: pendingOffer.rideId, state: 'assigned' });
      setPickupSynced({ lat: pendingOffer.pickupLat, lng: pendingOffer.pickupLng });
      setDestSynced({ lat: pendingOffer.destLat, lng: pendingOffer.destLng });
      setRideStateSynced('assigned');
      setPendingOffer(null);
      // Join the ride room so the driver receives ride.cancelled if the rider cancels
      joinRideRoom(pendingOffer.rideId);
      showToastFn('Ride accepted! Head to pickup.');
    } catch (err: any) {
      showToastFn(err.message ?? 'Failed to accept');
      setPendingOffer(null);
    }
  };

  const declineOffer = async () => {
    if (!pendingOffer) return;
    try {
      await apiFetch(`/v1/rides/drivers/${user.id}/decline`, {
        method: 'POST',
        body: JSON.stringify({ rideId: pendingOffer.rideId, offerId: pendingOffer.offerId }),
      });
    } catch {}
    setPendingOffer(null);
  };

  const startTrip = async () => {
    if (!currentRide) return;
    try {
      const res = await apiFetch<{ tripId: string }>(`/v1/trips/${currentRide.id}/start`, { method: 'POST' });
      setTripId(res.tripId);
      setRideStateSynced('started');
      showToastFn('Trip started!');
    } catch (err: any) { showToastFn(err.message); }
  };

  const endTrip = async () => {
    if (!tripId) return;
    try {
      const res = await apiFetch<{ fare: number }>(`/v1/trips/${tripId}/end`, { method: 'POST' });
      setFare(Number(res.fare));
      setRideStateSynced('ended');
      setCurrentRide(null);
      setPickupSynced(null); setDestSynced(null);
      // Driver stays online and keeps pinging — ready for the next ride immediately
      // Location pings continue; they'll idle at destination until a new offer arrives
      showToastFn(`Trip ended! Fare: ₹${Number(res.fare).toFixed(0)}. Ready for next ride.`);
    } catch (err: any) { showToastFn(err.message); }
  };

  const markers = [
    { id: 'self', lat: displayLocation.lat, lng: displayLocation.lng, color: '#3b82f6', emoji: '🚗' },
    ...(pickup ? [{ id: 'pickup', lat: pickup.lat, lng: pickup.lng, color: '#22c55e', emoji: 'P' }] : []),
    ...(dest ? [{ id: 'dest', lat: dest.lat, lng: dest.lng, color: '#ef4444', emoji: 'D' }] : []),
  ];

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 mt-12 relative">
        <Map markers={markers} center={displayLocation}
          routeCoords={rideState === 'assigned' && pickup ? [displayLocation, pickup] :
            rideState === 'started' && dest ? [displayLocation, dest] : undefined} />

        {pendingOffer && <OfferModal offer={pendingOffer} onAccept={acceptOffer} onDecline={declineOffer} />}

        {toast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg z-20 shadow">
            {toast}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-gray-800">{online ? '🟢 Online' : '⚫ Offline'}</p>
              <p className="text-xs text-gray-500 capitalize">State: {rideState}</p>
            </div>
            <button onClick={toggleOnline}
              className={`px-4 py-2 rounded-xl font-medium ${online ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
              {online ? 'Go Offline' : 'Go Online'}
            </button>
          </div>

          {rideState === 'assigned' && pickup && (() => {
            const distM = Math.round(distanceMetres(displayLocation, pickup));
            const canStart = distM <= 300;
            return (
              <div className="space-y-1">
                <p className="text-xs text-center text-gray-500">
                  {canStart
                    ? `✅ At pickup (${distM}m) — ready to start`
                    : `🚗 ${distM}m to pickup — drive closer to start`}
                </p>
                <button
                  onClick={startTrip}
                  disabled={!canStart}
                  className={`w-full py-2 rounded-xl font-medium transition-all ${
                    canStart
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {canStart ? 'Start Trip' : `Start Trip (${distM}m away)`}
                </button>
              </div>
            );
          })()}
          {rideState === 'started' && (
            <button onClick={endTrip} className="w-full bg-green-600 text-white py-2 rounded-xl hover:bg-green-700 font-medium">
              End Trip
            </button>
          )}
          {rideState === 'ended' && fare !== null && (
            <div className="text-center">
              <p className="text-green-600 font-bold text-xl">Trip Complete!</p>
              <p className="text-gray-600">Fare collected: ₹{fare.toFixed(0)}</p>
              <p className="text-xs text-gray-400 mt-1">🟢 Still online — waiting for next ride</p>
              <button onClick={() => { setRideStateSynced('idle'); setFare(null); }} className="mt-2 text-blue-600 text-sm hover:underline">
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
