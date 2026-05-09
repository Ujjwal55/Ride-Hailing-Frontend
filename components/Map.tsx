'use client';
import { Map as MapGL, Marker, Source, Layer } from 'react-map-gl';

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  emoji?: string;
}

interface Props {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MarkerData[];
  routeCoords?: { lat: number; lng: number }[];
  onClick?: (lat: number, lng: number) => void;
}

export default function Map({
  center = { lat: 12.9716, lng: 77.5946 },
  zoom = 12,
  markers = [],
  routeCoords,
  onClick,
}: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

  const geoJson = routeCoords
    ? {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: routeCoords.map((c) => [c.lng, c.lat]),
        },
        properties: {},
      }
    : null;

  return (
    <div className="w-full h-full">
      <MapGL
        initialViewState={{ longitude: center.lng, latitude: center.lat, zoom }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={token}
        style={{ width: '100%', height: '100%' }}
        onClick={(e) => onClick?.(e.lngLat.lat, e.lngLat.lng)}
      >
        {markers.map((m) => (
          <Marker key={m.id} longitude={m.lng} latitude={m.lat} anchor="center">
            <div
              title={m.id}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                backgroundColor: m.color ?? '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                cursor: 'default',
              }}
            >
              {m.emoji ?? ''}
            </div>
          </Marker>
        ))}

        {geoJson && (
          <Source id="route" type="geojson" data={geoJson}>
            <Layer
              id="route-line"
              type="line"
              paint={{ 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 0.8 }}
            />
          </Source>
        )}
      </MapGL>
    </div>
  );
}
