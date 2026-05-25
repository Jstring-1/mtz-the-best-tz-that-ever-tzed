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
// Markers use a small DivIcon — avoids the well-known Leaflet/webpack
// gotcha where the default PNG marker images 404 because the bundled
// URLs don't survive Next's build pipeline.
export default function ParksMap({
  parks,
  onSelect,
  selectedId,
  height = 320,
}: {
  parks: Park[];
  onSelect: (id: string) => void;
  selectedId?: string | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  // Keep marker refs so we can pop one open when `selectedId` changes
  // from outside (e.g. someone clicks a card in the list).
  const markersRef = useRef<Map<string, unknown>>(new Map());
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let map: import('leaflet').Map | null = null;
    let resizeObs: ResizeObserver | null = null;
    // Snapshot the ref Map for cleanup so we don't read .current later
    // (React-hooks lint: .current may change before cleanup runs).
    const markers = markersRef.current;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      const withCoords = parks.filter(
        (p): p is Park & { lat: number; lng: number } =>
          typeof p.lat === 'number' && typeof p.lng === 'number',
      );
      if (!withCoords.length) return;

      // Defer the initial fitBounds until ResizeObserver fires below —
      // the modal animates in, so right now the container is still
      // sized for its pre-animation state. Use a sane fallback center
      // (Martinez) so the first paint isn't blank.
      const bounds = L.latLngBounds(withCoords.map((p) => [p.lat, p.lng]));
      map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomSnap: 0.25,
        center: [38.0194, -122.1341],
        zoom: 13,
      });
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
        popupAnchor: [0, -8],
      });

      for (const p of withCoords) {
        const marker = L.marker([p.lat, p.lng], { icon: pinIcon, title: p.name }).addTo(map);
        const popupHtml =
          `<div class="park-pop">
             <button type="button" class="park-pop-btn" data-park-id="${p.id}">${escapeHtml(p.name)}</button>
             ${p.address ? `<div class="park-pop-addr">${escapeHtml(p.address)}</div>` : ''}
           </div>`;
        marker.bindPopup(popupHtml);
        marker.on('popupopen', (e) => {
          const root = (e.popup.getElement() as HTMLElement | null);
          const btn = root?.querySelector<HTMLButtonElement>(`button[data-park-id="${p.id}"]`);
          btn?.addEventListener('click', () => onSelectRef.current(p.id), { once: true });
        });
        markers.set(p.id, marker);
      }

      // The modal animates in, so the container's final size isn't
      // known when L.map() runs — Leaflet caches the (smaller) initial
      // size and only fetches tiles for that area, leaving the rest of
      // the panel gray. We invalidateSize() on every observed resize
      // so window-resize + modal-open both get covered, but only call
      // fitBounds the FIRST time we see a real size — otherwise every
      // popup auto-pan animation would retrigger fitBounds and the map
      // would jump around on click.
      if (containerRef.current) {
        let didInitialFit = false;
        resizeObs = new ResizeObserver(() => {
          if (!map) return;
          map.invalidateSize();
          if (!didInitialFit) {
            map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
            didInitialFit = true;
          }
        });
        resizeObs.observe(containerRef.current);
      }
    })();

    return () => {
      cancelled = true;
      if (resizeObs) resizeObs.disconnect();
      markers.clear();
      if (map) map.remove();
      mapRef.current = null;
    };
  }, [parks]);

  // External selection → pop the matching marker (no-op if not on map yet).
  useEffect(() => {
    if (!selectedId) return;
    const m = markersRef.current.get(selectedId) as
      | { openPopup: () => void } | undefined;
    m?.openPopup();
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      className="parks-map"
      style={{ height, width: '100%', borderRadius: 4, marginBottom: 12 }}
      aria-label="Map of Martinez parks"
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&#39;');
}
