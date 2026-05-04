import postgres from 'postgres';

// Single shared client.  postgres.js handles connection pooling internally.
// Marked as a module-level singleton via globalThis so Next's dev hot reload
// doesn't open a new pool on every request.

declare global {
  // eslint-disable-next-line no-var
  var __mtz_sql: ReturnType<typeof postgres> | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export const sql: ReturnType<typeof postgres> =
  globalThis.__mtz_sql ?? (globalThis.__mtz_sql = makeClient());
