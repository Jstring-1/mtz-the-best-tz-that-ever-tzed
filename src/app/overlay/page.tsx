'use client';

// Image-overlay tool: Leaflet map + Leaflet.DistortableImage plugin.
// Standalone page — sits full-viewport above the site chrome via z-index.
// Leaflet + plugin are loaded from a CDN at runtime so we don't drag npm
// dependencies into the main bundle. Nothing here ships unless /overlay
// is visited.

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    // Leaflet attaches its global as `L`. We type loosely — the plugin
    // augments L with `distortableImageOverlay` which has no public types.
    L: unknown;
  }
}

type LMap = { setView: (c: [number, number], z: number) => unknown; flyTo: (c: [number, number], z: number) => unknown; };
type LeafletNS = {
  map: (el: HTMLElement) => LMap;
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: LMap) => unknown };
  distortableImageOverlay: (url: string) => { addTo: (m: LMap) => { remove: () => void } };
};

const LEAFLET_VER = '1.9.4';
const DI_VER = 'latest';

const STYLES: string[] = [
  `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`,
  `https://unpkg.com/leaflet-distortableimage@${DI_VER}/dist/vendor.css`,
];
const SCRIPTS: string[] = [
  `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`,
  `https://unpkg.com/leaflet-distortableimage@${DI_VER}/dist/vendor.js`,
  `https://unpkg.com/leaflet-distortableimage@${DI_VER}/dist/leaflet.distortableimage.js`,
];

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function loadJs(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`load ${src}`)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;       // preserve order
    s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
    s.onerror = () => reject(new Error(`load ${src}`));
    document.body.appendChild(s);
  });
}

export default function OverlayPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const overlayRef = useRef<{ remove: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Load CDN deps once.
  useEffect(() => {
    let cancelled = false;
    STYLES.forEach(loadCss);
    (async () => {
      try {
        for (const s of SCRIPTS) await loadJs(s);
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Init map once Leaflet + plugin are present.
  useEffect(() => {
    if (!ready || !mapEl.current || mapRef.current) return;
    const L = window.L as unknown as LeafletNS;
    const map = L.map(mapEl.current);
    map.setView([38.0194, -122.1341], 14);  // Martinez default
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
  }, [ready]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !mapRef.current) return;
    const url = URL.createObjectURL(f);
    const L = window.L as unknown as LeafletNS;
    if (overlayRef.current) overlayRef.current.remove();
    overlayRef.current = L.distortableImageOverlay(url).addTo(mapRef.current);
  };

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || !mapRef.current) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
      const j: Array<{ lat?: string; lon?: string }> = await r.json();
      const hit = j[0];
      if (hit?.lat && hit?.lon) {
        mapRef.current.flyTo([Number(hit.lat), Number(hit.lon)], 15);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="overlay-page">
      <div className="overlay-controls">
        <form onSubmit={onSearch}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place…"
            aria-label="Search location"
          />
          <button type="submit" disabled={searching}>{searching ? '…' : 'Go'}</button>
        </form>
        <label className="upload-btn">
          Upload image
          <input type="file" accept="image/*" onChange={onFile} />
        </label>
        <span className="hint">
          Drag corners to resize · double-click overlay for opacity / rotate / lock
        </span>
        <a className="back" href="/">← back to mtz.city</a>
      </div>
      <div ref={mapEl} className="overlay-map" />
      {!ready && !err && <div className="overlay-loading">Loading map…</div>}
      {err && <div className="overlay-loading err">Failed to load Leaflet: {err}</div>}
    </div>
  );
}
