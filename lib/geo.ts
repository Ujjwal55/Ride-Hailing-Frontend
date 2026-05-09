export function interpolate(from: { lat: number; lng: number }, to: { lat: number; lng: number }, step: number): { lat: number; lng: number } {
  return {
    lat: from.lat + (to.lat - from.lat) * step,
    lng: from.lng + (to.lng - from.lng) * step,
  };
}

export function distanceDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2);
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
