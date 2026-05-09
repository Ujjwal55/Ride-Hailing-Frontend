import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  tenantId: string;
  role: 'rider' | 'driver' | 'admin';
  name: string | null;
  email: string;
}

export interface LngLat {
  lng: number;
  lat: number;
}

export interface Ride {
  id: string;
  state: string;
  fareEstimate?: number;
  fareFinal?: number;
  surgeMultiplier?: number;
  driverId?: string;
  pickupLat?: number;
  pickupLng?: number;
  destLat?: number;
  destLng?: number;
}

export interface Offer {
  offerId: string;
  rideId: string;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  fareEstimate: number;
  surgeMultiplier: number;
  expiresAt: string;
  tier?: string;
}

interface AppState {
  _hasHydrated: boolean;
  user: User | null;
  accessToken: string | null;
  currentRide: Ride | null;
  pendingOffer: Offer | null;
  driverLocation: LngLat | null;
  online: boolean;
  tripId: string | null;

  setHasHydrated: (v: boolean) => void;
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setCurrentRide: (ride: Ride | null) => void;
  setPendingOffer: (offer: Offer | null) => void;
  setDriverLocation: (loc: LngLat | null) => void;
  setOnline: (online: boolean) => void;
  setTripId: (id: string | null) => void;
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      user: null,
      accessToken: null,
      currentRide: null,
      pendingOffer: null,
      driverLocation: null,
      online: false,
      tripId: null,

      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setUser: (user) => set({ user }),
      setAccessToken: (token) => set({ accessToken: token }),
      setCurrentRide: (ride) => set({ currentRide: ride }),
      setPendingOffer: (offer) => set({ pendingOffer: offer }),
      setDriverLocation: (loc) => set({ driverLocation: loc }),
      setOnline: (online) => set({ online }),
      setTripId: (id) => set({ tripId: id }),
      logout: () => set({ user: null, accessToken: null, currentRide: null, pendingOffer: null, online: false, tripId: null }),
    }),
    {
      name: 'rh-auth',
      storage: createJSONStorage(() => localStorage),
      // Only persist auth fields — _hasHydrated is a session flag, not persisted
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
