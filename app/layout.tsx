import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GoComet Ride-Hailing',
  description: 'Real-time ride-hailing platform demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css" rel="stylesheet" />
      </head>
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
