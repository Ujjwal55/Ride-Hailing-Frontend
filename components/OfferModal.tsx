'use client';
import { useState, useEffect } from 'react';
import { Offer } from '@/lib/store';

interface Props {
  offer: Offer;
  onAccept: () => void;
  onDecline: () => void;
}

export default function OfferModal({ offer, onAccept, onDecline }: Props) {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const remaining = Math.max(0, Math.floor((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
    setCountdown(remaining);
    const t = setInterval(() => setCountdown((c) => {
      if (c <= 1) { clearInterval(t); onDecline(); return 0; }
      return c - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [offer]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-800">New Ride Offer!</h2>
          <span className={`text-2xl font-bold ${countdown <= 3 ? 'text-red-500' : 'text-orange-500'}`}>{countdown}s</span>
        </div>
        <div className="space-y-2 text-sm text-gray-600 mb-5">
          <div className="flex justify-between"><span>Tier</span><span className="font-medium capitalize">{offer.tier ?? 'economy'}</span></div>
          <div className="flex justify-between"><span>Surge</span><span className="font-medium">{Number(offer.surgeMultiplier).toFixed(2)}x</span></div>
          <div className="flex justify-between"><span>Est. Fare</span><span className="font-medium text-green-600">₹{offer.fareEstimate != null ? Number(offer.fareEstimate).toFixed(0) : '--'}</span></div>
        </div>
        <div className="flex gap-3">
          <button onClick={onDecline} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-xl hover:bg-gray-50">Decline</button>
          <button onClick={onAccept} className="flex-1 bg-green-600 text-white py-2 rounded-xl hover:bg-green-700 font-medium">Accept</button>
        </div>
      </div>
    </div>
  );
}
