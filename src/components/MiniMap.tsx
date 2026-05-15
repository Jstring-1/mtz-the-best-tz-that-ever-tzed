'use client';

// Embedded Google Maps via the no-API-key text-query URL. Renders a
// modest iframe pinned to whatever the query string resolves to. No
// billing setup required; if Google can't resolve the query the iframe
// just shows its standard empty state.
//
// Used inside Places + Events modals.

export default function MiniMap({ query, height = 240 }: { query: string; height?: number }) {
  if (!query.trim()) return null;
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&ie=UTF8&iwloc=&output=embed`;
  return (
    <iframe
      title={`Map of ${query}`}
      src={src}
      style={{
        width: '100%',
        height,
        border: '1px solid var(--border)',
        borderRadius: 4,
        marginTop: 4,
      }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
