'use client';

// Image-overlay tool: Leaflet map + Leaflet.DistortableImage plugin.
// Standalone page — sits full-viewport above the site chrome via z-index.
// Leaflet + plugin are loaded from a CDN at runtime so we don't drag npm
// dependencies into the main bundle. Nothing here ships unless /overlay
// is visited.
//
// Multi-image: upload as many images as you like. The list of uploaded
// images appears in the toolbar; clicking one shows just that image with
// its own remembered opacity / corners / mode. Others are removed from
// the map but kept in state (Leaflet preserves corners across remove /
// addTo) so the state is fully isolated per image.

import { useCallback, useEffect, useRef, useState } from 'react';

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
  hasLayer: (l: LeafletLayer) => boolean;
};
// Plugin instance — the actual API is a mix of public + underscored
// methods. We type loosely and call defensively via helpers below.
type DistortableImage = LeafletLayer & {
  setOpacity: (n: number) => unknown;
  _image?: HTMLImageElement;
  editing?: Record<string, unknown> & {
    enable?: () => void;
    disable?: () => void;
    setSelected?: (s: boolean) => void;
    _setMode?: (mode: string) => void;
    nextMode?: () => void;
    _mode?: string;
    _enabled?: boolean;
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
const PDFJS_VER = '3.11.174';                       // last UMD-compatible release
const PDFJS_MAIN = `https://unpkg.com/pdfjs-dist@${PDFJS_VER}/build/pdf.min.js`;
const PDFJS_WORKER = `https://unpkg.com/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.js`;

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
const MODES: Mode[] = ['scale', 'rotate', 'freeRotate', 'distort', 'drag', 'lock'];

interface OverlayItem {
  id: string;
  name: string;
  url: string;
  obj: DistortableImage;
  opacity: number;
  mode: Mode;
}

// ---------- Plugin call helpers (defensive — the plugin's API mixes
// public and underscored methods, and the version pinned to @latest may
// drift). Each helper tries several known method names and bails on the
// first one that's callable.

function callFirst<T>(obj: unknown, names: string[], args: unknown[] = []): T | undefined {
  if (!obj) return undefined;
  const o = obj as Record<string, unknown>;
  for (const n of names) {
    const fn = o[n];
    if (typeof fn === 'function') {
      try { return (fn as (...a: unknown[]) => T).apply(obj, args); }
      catch (e) { console.warn(`[overlay] ${n} threw`, e); }
    }
  }
  return undefined;
}

function enableEditing(img: DistortableImage) {
  if (img.editing?._enabled) return;
  callFirst(img.editing, ['enable']);
}

function setSelected(img: DistortableImage, selected: boolean) {
  if (callFirst(img.editing, ['setSelected'], [selected]) !== undefined) return;
  callFirst(img.editing, selected ? ['_select', 'select'] : ['_deselect', 'deselect']);
}

function setMode(img: DistortableImage, mode: string) {
  // Try direct setters first
  if (callFirst(img.editing, ['_setMode', 'setMode', 'runMode'], [mode]) !== undefined) return;
  // Fallback: cycle nextMode() until we land on the requested one.
  const e = img.editing;
  if (!e || typeof e.nextMode !== 'function') return;
  for (let i = 0; i < 8; i++) {
    if (e._mode === mode) return;
    e.nextMode();
  }
}

// Apply post-add settings — wait for the image element to load so the
// plugin has finished initialising before we poke at it.
function whenReady(img: DistortableImage, fn: () => void) {
  const el = img._image;
  if (el && el.complete && el.naturalWidth > 0) { fn(); return; }
  if (el) { el.addEventListener('load', fn, { once: true }); return; }
  // No image element yet — give the plugin a tick and try again.
  setTimeout(() => whenReady(img, fn), 50);
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}
// PDF.js loaded lazily — only when a PDF is actually uploaded.
type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (ctx: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};
let pdfjsReady: Promise<PdfJsLib> | null = null;
async function ensurePdfJs(): Promise<PdfJsLib> {
  if (pdfjsReady) return pdfjsReady;
  pdfjsReady = (async () => {
    await loadJs(PDFJS_MAIN);
    const lib = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib;
    if (!lib) throw new Error('pdfjs failed to load');
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return lib;
  })();
  return pdfjsReady;
}

// Render every page of a PDF to a PNG blob URL. Caller is responsible
// for revokeObjectURL when the overlay is removed.
async function pdfToImageUrls(file: File, scale = 2): Promise<string[]> {
  const pdfjs = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d ctx unavailable');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const url: string = await new Promise((res, rej) =>
      canvas.toBlob((b) => b ? res(URL.createObjectURL(b)) : rej(new Error('blob failed')), 'image/png')
    );
    out.push(url);
  }
  return out;
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
    s.async = false;
    s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
    s.onerror = () => reject(new Error(`load ${src}`));
    document.body.appendChild(s);
  });
}

export default function OverlayPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);
  const itemsRef = useRef<OverlayItem[]>([]);  // mirror for stable event handlers

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [baseLayer, setBaseLayer] = useState<BaseLayerKey>('street');
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  itemsRef.current = items;
  const active = items.find((it) => it.id === activeId) ?? null;

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
    map.setView([38.0194, -122.1341], 14);
    mapRef.current = map;
    setTileLayer('street');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Clean up blob URLs on unmount.
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => {
        try { it.obj.remove(); } catch { /* ignore */ }
        URL.revokeObjectURL(it.url);
      });
    };
  }, []);

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

  // Show only this id; hide all others. Each obj preserves its own corners,
  // opacity, and mode across remove/addTo cycles.
  const selectItem = useCallback((id: string | null, list?: OverlayItem[]) => {
    const map = mapRef.current;
    if (!map) return;
    const arr = list ?? itemsRef.current;
    arr.forEach((it) => {
      const onMap = map.hasLayer(it.obj);
      if (it.id === id) {
        if (!onMap) it.obj.addTo(map);
        whenReady(it.obj, () => {
          enableEditing(it.obj);
          try { it.obj.setOpacity(it.opacity); } catch { /* ignore */ }
          setMode(it.obj, it.mode);
          setSelected(it.obj, true);
        });
      } else {
        setSelected(it.obj, false);
        if (onMap) it.obj.remove();
      }
    });
    setActiveId(id);
  }, []);

  const makeId = () =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';                              // allow re-picking same file
    if (!files.length || !mapRef.current) return;
    const L = window.L as unknown as LeafletNS;
    const fresh: OverlayItem[] = [];
    try {
      for (const f of files) {
        if (isPdf(f)) {
          setImporting(`Rendering ${f.name}…`);
          const urls = await pdfToImageUrls(f);
          urls.forEach((url, i) => {
            const obj = L.distortableImageOverlay(url, { selected: true, suppressToolbar: false, mode: 'scale', opacity: 0.6 });
            fresh.push({
              id: makeId(),
              name: urls.length > 1 ? `${f.name} [${i + 1}/${urls.length}]` : f.name,
              url, obj, opacity: 0.6, mode: 'scale',
            });
          });
        } else {
          const url = URL.createObjectURL(f);
          const obj = L.distortableImageOverlay(url, { selected: true, suppressToolbar: false, mode: 'scale', opacity: 0.6 });
          fresh.push({ id: makeId(), name: f.name, url, obj, opacity: 0.6, mode: 'scale' });
        }
      }
    } catch (e) {
      console.error('upload failed', e);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
    if (!fresh.length) return;
    const next = [...itemsRef.current, ...fresh];
    setItems(next);
    selectItem(fresh[fresh.length - 1].id, next);
  };

  const applyOpacity = (n: number) => {
    if (!active) return;
    whenReady(active.obj, () => {
      try { active.obj.setOpacity(n); } catch (e) { console.warn(e); }
    });
    setItems((prev) => prev.map((it) => it.id === active.id ? { ...it, opacity: n } : it));
  };
  const applyMode = (m: Mode) => {
    if (!active) return;
    whenReady(active.obj, () => {
      enableEditing(active.obj);
      setMode(active.obj, m);
      setSelected(active.obj, true);
    });
    setItems((prev) => prev.map((it) => it.id === active.id ? { ...it, mode: m } : it));
  };

  const removeItem = (id: string) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it) return;
    try { it.obj.remove(); } catch { /* ignore */ }
    URL.revokeObjectURL(it.url);
    const next = itemsRef.current.filter((x) => x.id !== id);
    setItems(next);
    if (activeId === id) {
      const fallback = next[next.length - 1]?.id ?? null;
      selectItem(fallback, next);
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
    } catch (e) { console.error(e); }
    finally { setSearching(false); }
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
          + Upload (image / PDF)
          <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={onFile} />
        </label>
        {importing && <span className="hint" style={{ color: 'gold' }}>{importing}</span>}

        {items.length > 0 && (
          <div className="grp grp-images">
            <span className="grp-label">Images</span>
            {items.map((it) => (
              <span key={it.id} className={`img-row ${activeId === it.id ? 'on' : ''}`}>
                <button
                  type="button"
                  className="mini name"
                  onClick={() => selectItem(it.id)}
                  title={it.name}
                >{it.name.length > 22 ? it.name.slice(0, 19) + '…' : it.name}</button>
                <button
                  type="button"
                  className="mini x"
                  onClick={() => removeItem(it.id)}
                  title={`Remove ${it.name}`}
                >×</button>
              </span>
            ))}
          </div>
        )}

        {active && (
          <>
            <div className="grp">
              <span className="grp-label">Opacity</span>
              <input
                type="range" min={0} max={1} step={0.05}
                value={active.opacity}
                onChange={(e) => applyOpacity(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span className="num">{Math.round(active.opacity * 100)}%</span>
            </div>

            <div className="grp">
              <span className="grp-label">Mode</span>
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mini ${active.mode === m ? 'on' : ''}`}
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
          </>
        )}

        <span className="hint">
          {active ? `Editing "${active.name}" — other images hidden` : items.length === 0 ? 'Upload one or more images to begin' : 'Select an image from the list'}
        </span>

        <a className="back" href="/">← back</a>
      </div>

      <div ref={mapEl} className="overlay-map" />
      {!ready && !err && <div className="overlay-loading">Loading map…</div>}
      {err && <div className="overlay-loading err">Failed to load Leaflet: {err}</div>}
    </div>
  );
}
