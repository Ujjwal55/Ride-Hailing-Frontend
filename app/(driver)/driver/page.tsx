'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import OfferModal from '@/components/OfferModal';
import { useStore } from '@/lib/store';
import { apiFetch, configureApi } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { moveToward } from '@/lib/geo';

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

    socket.on('offer.new', handleOffer);
    socket.on('offer.expired', handleExpired);

    return () => {
      socket.off('offer.new', handleOffer);
      socket.off('offer.expired', handleExpired);
    };
  }, [_hasHydrated, user?.id, accessToken]);

  // Early returns come AFTER all hooks
  if (!_hasHydrated) return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading...</div>;
  if (!user) return null;

  const startLocationPings = () => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(async () => {
      const target = rideState === 'assigned' && pickup
        ? pickup
        : rideState === 'started' && dest
        ? dest
        : null;

      if (target) {
        const next = moveToward(locationRef.current, target);
        locationRef.current = next;
        setDisplayLocation({ ...next });
        if (next.arrived && rideState === 'started') showToastFn('Arrived at destination! End the trip.');
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
      setPickup({ lat: pendingOffer.pickupLat, lng: pendingOffer.pickupLng });
      setDest({ lat: pendingOffer.destLat, lng: pendingOffer.destLng });
      setRideState('assigned');
      setPendingOffer(null);
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
      setRideState('started');
      showToastFn('Trip started!');
    } catch (err: any) { showToastFn(err.message); }
  };

  const endTrip = async () => {
    if (!tripId) return;
    try {
      const res = await apiFetch<{ fare: number }>(`/v1/trips/${tripId}/end`, { method: 'POST' });
      setFare(Number(res.fare));
      setRideState('ended');
      setCurrentRide(null);
      setPickup(null); setDest(null);
      stopLocationPings();
      setOnline(false);
      showToastFn(`Trip ended! Fare: ₹${Number(res.fare).toFixed(0)}`);
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

          {rideState === 'assigned' && (
            <button onClick={startTrip} className="w-full bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 font-medium">
              Start Trip
            </button>
          )}
          {rideState === 'started' && (
            <button onClick={endTrip} className="w-full bg-green-600 text-white py-2 rounded-xl hover:bg-green-700 font-medium">
              End Trip
            </button>
          )}
          {rideState === 'ended' && fare !== null && (
            <div className="text-center">
              <p className="text-green-600 font-bold text-xl">Trip Complete!</p>
              <p className="text-gray-600">Fare collected: ₹{fare.toFixed(0)}</p>
              <button onClick={() => { setRideState('idle'); setFare(null); }} className="mt-2 text-blue-600 text-sm hover:underline">
                Ready for next ride
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
