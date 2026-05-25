'use client';

import { useEffect, useRef } from 'react';
import type { Park } from '@/lib/types';
import 'leaflet/dist/leaflet.css';

// Leaflet-based multi-pin map for the parks popup. Loaded only when
// the popup is open (ParksDetail mounts us conditionally) so the
// Leaflet bundle stays out of the initial page weight. We dynamic-
// import the library inside useEffect because it touches `window` at
// import time and would crash SSR.
//
// Markers use a small DivIcon (sidesteps the well-known Leaflet/
// Webpack PNG-marker-404 gotcha). Click a pin -> calls onSelect(id)
// directly, which opens the existing park-detail modal. We don't
// bind Leaflet popups: their default chrome fights with the modal's
// dark theme + wildcard word-break, and skipping them entirely is
// simpler than CSS-overriding every default.
export default function ParksMap({
  parks,
  onSelect,
  focus,
  height = 320,
}: {
  parks: Park[];
  onSelect: (id: string) => void;
  /** "Zoom to this park" request from the parent. The `nonce` makes
   *  re-clicking the same park re-trigger the flyTo animation. */
  focus?: { id: string; nonce: number } | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let map: import('leaflet').Map | null = null;
    let resizeObs: ResizeObserver | null = null;
    let lastFitSize = { w: 0, h: 0 };

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      const withCoords = parks.filter(
        (p): p is Park & { lat: number; lng: number } =>
          typeof p.lat === 'number' && typeof p.lng === 'number',
      );
      if (!withCoords.length) return;

      // Pad bounds slightly so the outermost pins don't sit on the
      // edge. No maxZoom cap — the cap caused the map to lock at the
      // initial (small-container) zoom and leave outer pins off-screen
      // when the modal expanded.
      const bounds = L.latLngBounds(withCoords.map((p) => [p.lat, p.lng]));
      map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomSnap: 0.25,
      });
      map.fitBounds(bounds, { padding: [24, 24] });
      mapRef.current = map;

      // OSM tiles — free, no API key, attribution required.
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'park-pin',
        html: '<span class="park-pin-dot"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      for (const p of withCoords) {
        const marker = L.marker([p.lat, p.lng], { icon: pinIcon, title: p.name }).addTo(map);
        // Click pin -> route through onSelect, which the parent uses to
        // open the existing park-detail modal. No Leaflet popup in
        // between, so no popup chrome to style.
        marker.on('click', () => onSelectRef.current(p.id));
      }

      // Re-fit on container resize. The modal animates in, so the
      // initial fitBounds runs against a smaller-than-final container
      // and can leave outer pins off-screen. We compare against the
      // last fit size so popup-triggered resizes (there shouldn't be
      // any now that popups are gone, but defense in depth) don't
      // re-trigger fitBounds for trivial deltas.
      if (containerRef.current) {
        resizeObs = new ResizeObserver((entries) => {
          if (!map) return;
          map.invalidateSize();
          const cr = entries[0]?.contentRect;
          if (!cr) return;
          const dw = Math.abs(cr.width - lastFitSize.w);
          const dh = Math.abs(cr.height - lastFitSize.h);
          if (dw > 8 || dh > 8) {
            map.fitBounds(bounds, { padding: [24, 24] });
            lastFitSize = { w: cr.width, h: cr.height };
          }
        });
        resizeObs.observe(containerRef.current);
      }
    })();

    return () => {
      cancelled = true;
      if (resizeObs) resizeObs.disconnect();
      if (map) map.remove();
      mapRef.current = null;
    };
  }, [parks]);

  // Parent requests "zoom to this park" by changing `focus`. The nonce
  // ensures useEffect re-runs even when the same park is clicked twice.
  useEffect(() => {
    if (!focus) return;
    const m = mapRef.current;
    if (!m) return;
    const p = parks.find((x) => x.id === focus.id);
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
    m.flyTo([p.lat, p.lng], 17, { duration: 0.7 });
  }, [focus, parks]);

  return (
    <div
      ref={containerRef}
      className="parks-map"
      style={{ height, width: '100%', borderRadius: 4, marginBottom: 12 }}
      aria-label="Map of Martinez parks"
    />
  );
}
