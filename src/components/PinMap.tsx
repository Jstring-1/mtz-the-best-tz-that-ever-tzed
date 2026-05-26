'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

// Generic Leaflet multi-pin map. Used by ParksDetail, EonetDetail,
// and anywhere else we want to drop points on a tile map.
//
// Loaded dynamically so the leaflet bundle stays out of the initial
// page weight, and so SSR (where `window` is undefined) doesn't crash.
// Markers use a DivIcon (sidesteps the well-known Leaflet/Webpack
// PNG-marker-404 gotcha). Clicking a pin routes through onSelect; we
// deliberately do NOT bind leaflet popups because the upstream popup
// chrome fights with our modal styles -- callers handle their own
// detail UX in the parent component.

export interface PinPoint {
  id: string;
  lat: number;
  lng: number;
  title?: string;
}

export default function PinMap({
  points,
  onSelect,
  focus,
  height = 320,
  flyZoom = 17,
  maxFitZoom,
  ariaLabel = 'Map',
  // Color of the pin dot — falls back to dodger blue. Pass any CSS
  // color (named, hex, or var(--token)) to theme the markers per use.
  pinColor = 'var(--dodger, #1e90ff)',
}: {
  points: PinPoint[];
  onSelect?: (id: string) => void;
  /** "Zoom to this id" request. The nonce makes repeat-clicks of the
   *  same id re-trigger the flyTo animation. */
  focus?: { id: string; nonce: number } | null;
  height?: number;
  flyZoom?: number;
  /** Cap on fitBounds zoom — keeps clustered pins from zooming all
   *  the way to street level. Use 14 for a city, 7 for regional, 4
   *  for continental, etc. Omit for no cap. */
  maxFitZoom?: number;
  ariaLabel?: string;
  pinColor?: string;
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
      if (!points.length) return;

      // Fit-bounds with a per-caller maxZoom cap so a single quake
      // doesn't zoom to street level. Without a cap, two close points
      // would auto-zoom way in and lose all regional context.
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      const fitOpts: import('leaflet').FitBoundsOptions = { padding: [24, 24] };
      if (typeof maxFitZoom === 'number') fitOpts.maxZoom = maxFitZoom;
      map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomSnap: 0.25,
        worldCopyJump: true, // useful for global-scale maps (EONET)
      });
      map.fitBounds(bounds, fitOpts);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'pin-map-pin',
        html: `<span class="pin-map-dot" style="background:${pinColor}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      for (const p of points) {
        const marker = L.marker([p.lat, p.lng], { icon: pinIcon, title: p.title ?? '' }).addTo(map);
        marker.on('click', () => onSelectRef.current?.(p.id));
      }

      if (containerRef.current) {
        resizeObs = new ResizeObserver((entries) => {
          if (!map) return;
          map.invalidateSize();
          const cr = entries[0]?.contentRect;
          if (!cr) return;
          const dw = Math.abs(cr.width - lastFitSize.w);
          const dh = Math.abs(cr.height - lastFitSize.h);
          if (dw > 8 || dh > 8) {
            map.fitBounds(bounds, fitOpts);
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
  }, [points, pinColor, maxFitZoom]);

  // Parent requests "fly to this id". The nonce ensures useEffect
  // re-runs even when the same id is clicked twice.
  useEffect(() => {
    if (!focus) return;
    const m = mapRef.current;
    if (!m) return;
    const p = points.find((x) => x.id === focus.id);
    if (!p) return;
    m.flyTo([p.lat, p.lng], flyZoom, { duration: 0.7 });
  }, [focus, points, flyZoom]);

  return (
    <div
      ref={containerRef}
      className="pin-map"
      style={{ height, width: '100%', borderRadius: 4, marginBottom: 12 }}
      aria-label={ariaLabel}
    />
  );
}
