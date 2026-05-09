'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface TrackingData {
  riderName: string;
  triggeredAt: string;
  status: 'active' | 'resolved';
  driverLocation: { lat: number; lng: number } | null;
  rideId: string;
}

export default function TrackingPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTracking = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/track/${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? 'Tracking link expired or invalid');
        return;
      }
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch {
      setError('Unable to connect. Please try again.');
    }
  };

  useEffect(() => {
    fetchTracking();
    // Poll every 3s for live driver location
    intervalRef.current = setInterval(fetchTracking, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <p className="text-4xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link expired</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading tracking data...</p>
      </div>
    );
  }

  const markers = data.driverLocation
    ? [{ id: 'driver', lat: data.driverLocation.lat, lng: data.driverLocation.lng, color: '#f59e0b', emoji: '🚗' }]
    : [];

  const triggeredTime = new Date(data.triggeredAt).toLocaleTimeString();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className={`p-4 text-white ${data.status === 'active' ? 'bg-red-600' : 'bg-green-600'}`}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{data.status === 'active' ? '🆘' : '✅'}</span>
            <h1 className="text-lg font-bold">
              {data.status === 'active' ? 'Emergency SOS Active' : 'SOS Resolved'}
            </h1>
          </div>
          <p className="text-sm opacity-90">
            <strong>{data.riderName}</strong> triggered this alert at {triggeredTime}
          </p>
          {data.status === 'active' && (
            <p className="text-xs opacity-75 mt-1 animate-pulse">● Live tracking — updates every 3 seconds</p>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative" style={{ minHeight: '400px' }}>
        <Map
          markers={markers}
          center={data.driverLocation ?? { lat: 12.9716, lng: 77.5946 }}
          zoom={14}
        />
        {!data.driverLocation && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <p className="text-gray-500 text-sm">Waiting for driver location...</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t p-4 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>GoComet Rides Safety</span>
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
        </div>
        {data.status === 'active' && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            This is a live safety tracking page. If this is an emergency, please call <strong>112</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
