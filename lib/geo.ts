export function interpolate(from: { lat: number; lng: number }, to: { lat: number; lng: number }, step: number): { lat: number; lng: number } {
  return {
    lat: from.lat + (to.lat - from.lat) * step,
    lng: from.lng + (to.lng - from.lng) * step,
  };
}

export function distanceDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2);
}

// Haversine distance in metres
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const SPEED = 0.0005; // degrees per tick (~55m/s, fast for demo)

export function moveToward(from: { lat: number; lng: number }, to: { lat: number; lng: number }): { lat: number; lng: number; arrived: boolean } {
  const dist = distanceDeg(from, to);
  if (dist < SPEED) return { ...to, arrived: true };
  const ratio = SPEED / dist;
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
    arrived: false,
  };
}
