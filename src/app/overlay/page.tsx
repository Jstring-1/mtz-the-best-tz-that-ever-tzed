'use client';

// Image-overlay tool: Leaflet map + Leaflet.DistortableImage plugin.
// Standalone page — sits full-viewport above the site chrome via z-index.
// Leaflet + plugin are loaded from a CDN at runtime so we don't drag npm
// dependencies into the main bundle. Nothing here ships unless /overlay
// is visited.

import { useEffect, useRef, useState } from 'react';

// Loose Leaflet typings — Leaflet from CDN has no static types. We only
// hit a handful of methods so we describe just what we touch.
type LatLng = [number, number];
type LeafletLayer = { addTo: (m: LeafletMap) => LeafletLayer; remove: () => void };
type TileLayer = LeafletLayer;
type LeafletMap = {
  setView: (c: LatLng, z: number) => LeafletMap;
  flyTo: (c: LatLng, z: number) => LeafletMap;
  getCenter: () => { lat: number; lng: number };
  removeLayer: (l: LeafletLayer) => void;
  addLayer: (l: LeafletLayer) => void;
};
type DistortableImage = LeafletLayer & {
  setOpacity: (n: number) => void;
  select?: () => void;
  editing?: {
    enable?: () => void;
    runMode?: (mode: 'distort' | 'scale' | 'rotate' | 'lock' | 'drag' | 'freeRotate') => void;
  };
};
type LeafletNS = {
  map: (el: HTMLElement) => LeafletMap;
  tileLayer: (url: string, opts: Record<string, unknown>) => TileLayer;
  distortableImageOverlay: (url: string, opts?: Record<string, unknown>) => DistortableImage;
};

declare global { interface Window { L: unknown } }

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

type BaseLayerKey = 'street' | 'satellite' | 'topo';
const BASE_LAYERS: Record<BaseLayerKey, { url: string; attr: string; maxZoom: number; subdomains?: string }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles © Esri — World Imagery',
    maxZoom: 19,
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap',
    maxZoom: 17,
    subdomains: 'abc',
  },
};

type Mode = 'distort' | 'scale' | 'rotate' | 'freeRotate' | 'drag' | 'lock';

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
  const mapRef = useRef<LeafletMap | null>(null);
  const overlayRef = useRef<DistortableImage | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [opacity, setOpacity] = useState(0.6);
  const [mode, setMode] = useState<Mode>('scale');
  const [baseLayer, setBaseLayer] = useState<BaseLayerKey>('street');
  const [hasImage, setHasImage] = useState(false);

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
    mapRef.current = map;
    setTileLayer('street');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Swap base tile layer.
  const setTileLayer = (key: BaseLayerKey) => {
    if (!mapRef.current) return;
    const L = window.L as unknown as LeafletNS;
    const cfg = BASE_LAYERS[key];
    const layer = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      attribution: cfg.attr,
      subdomains: cfg.subdomains ?? 'abc',
    });
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    layer.addTo(mapRef.current);
    tileLayerRef.current = layer;
    setBaseLayer(key);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !mapRef.current) return;
    const url = URL.createObjectURL(f);
    const L = window.L as unknown as LeafletNS;
    if (overlayRef.current) overlayRef.current.remove();
    const img = L.distortableImageOverlay(url, {
      selected: true,
      suppressToolbar: false,
    });
    img.addTo(mapRef.current);
    overlayRef.current = img;
    setHasImage(true);
    // Push opacity + initial mode now that the image is on the map.
    setTimeout(() => {
      try { img.setOpacity(opacity); } catch { /* ignore */ }
      try { img.editing?.runMode?.(mode); } catch { /* ignore */ }
      try { img.select?.(); } catch { /* ignore */ }
    }, 50);
    // Allow re-uploading the same file (input.onChange won't fire on same path).
    e.target.value = '';
  };

  const applyOpacity = (n: number) => {
    setOpacity(n);
    overlayRef.current?.setOpacity(n);
  };

  const applyMode = (m: Mode) => {
    setMode(m);
    overlayRef.current?.editing?.runMode?.(m);
  };

  const recenterImage = () => {
    // The plugin doesn't expose a "fit to view" helper directly. Easiest
    // user-facing recenter: drop the existing image and tell the user to
    // re-upload — but a smoother trick is to re-create with no corners so
    // the plugin places fresh corners around the current map view.
    if (!overlayRef.current || !mapRef.current) return;
    // No-op stub: kept for future implementation. For now, instruct via
    // hint that scrolling/zooming reframes the work area.
  };

  const removeImage = () => {
    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
      setHasImage(false);
    }
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

        <form onSubmit={onSearch} className="grp">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place…"
            aria-label="Search location"
          />
          <button type="submit" disabled={searching}>{searching ? '…' : 'Go'}</button>
        </form>

        <div className="grp">
          <span className="grp-label">Base</span>
          {(['street', 'satellite', 'topo'] as BaseLayerKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`mini ${baseLayer === k ? 'on' : ''}`}
              onClick={() => setTileLayer(k)}
            >{k}</button>
          ))}
        </div>

        <label className="upload-btn">
          {hasImage ? 'Replace image' : 'Upload image'}
          <input type="file" accept="image/*" onChange={onFile} />
        </label>

        {hasImage && (
          <>
            <div className="grp">
              <span className="grp-label">Opacity</span>
              <input
                type="range" min={0} max={1} step={0.05}
                value={opacity}
                onChange={(e) => applyOpacity(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span className="num">{Math.round(opacity * 100)}%</span>
            </div>

            <div className="grp">
              <span className="grp-label">Mode</span>
              {(['scale', 'rotate', 'freeRotate', 'distort', 'drag', 'lock'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mini ${mode === m ? 'on' : ''}`}
                  onClick={() => applyMode(m)}
                  title={
                    m === 'scale'      ? 'Drag corner: scale uniformly'
                    : m === 'rotate'     ? 'Drag corner: rotate around center'
                    : m === 'freeRotate' ? 'Free-form rotation handle'
                    : m === 'distort'    ? 'Drag each corner independently'
                    : m === 'drag'       ? 'Move only (no resize)'
                    : 'Read-only — pan/zoom map underneath'
                  }
                >{m === 'freeRotate' ? 'free-rot' : m}</button>
              ))}
            </div>

            <button type="button" className="danger" onClick={removeImage}>Remove</button>
          </>
        )}

        <span className="hint">
          Click the image to select · drag corner handles to {mode === 'scale' ? 'scale' : mode === 'distort' ? 'distort' : mode === 'rotate' ? 'rotate' : 'edit'}
        </span>

        <a className="back" href="/">← back</a>
      </div>

      <div ref={mapEl} className="overlay-map" />
      {!ready && !err && <div className="overlay-loading">Loading map…</div>}
      {err && <div className="overlay-loading err">Failed to load Leaflet: {err}</div>}
    </div>
  );
}
