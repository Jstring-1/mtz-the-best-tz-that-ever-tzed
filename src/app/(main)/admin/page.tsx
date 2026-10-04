import { getAllJsonTimestamps, getRowCounts, getJson } from '@/lib/cache';
import type { DiscoveryPayload } from '@/lib/places-discovery';
import AdminPanel from './AdminPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Each bucket's `desc` lists EXACTLY the jobs in src/lib/cron.ts so the
// admin UI doesn't drift from reality. Order matches the cron file.
const BUCKETS = [
  { id: '1m',  desc: 'weatherapi_current' },
  { id: '2m',  desc: 'purpleair' },
  { id: '5m',  desc: 'noaa_alerts · twelvedata_stocks' },
  { id: '15m', desc: 'trains_mtz · regional_hazards · glance_live' },
  { id: '1h',  desc: 'noaa_hourly · noaa_buoys · glance_hourly' },
  { id: '4h',  desc: 'news_feeds · news_aggregated · local_events · shelter_pets · noaa_forecast · noaa_aviation · weatherapi_marine · weatherapi_forecast · usgs_quakes · ebird · glance_daily' },
  { id: '12h', desc: 'osm_places · ticketmaster_events · gov_local · gov_national · outbreaks · affecting_bills · rep_votes · purge_stores' },
  { id: '1d',  desc: 'council_votes · ccrmc_data · ccc_comp · reps_data · crime_data · cch_health · housing' },
  { id: 'all', desc: 'Every bucket sequentially (manual / cold start)' },
];

export default async function AdminPage() {
  let timestamps: Record<string, string> = {};
  let counts: Record<string, number> = {};
  try { timestamps = await getAllJsonTimestamps(); } catch { /* DB cold */ }
  try { counts = await getRowCounts(); } catch { /* DB cold */ }
  let discovery: DiscoveryPayload | null = null;
  try { discovery = await getJson<DiscoveryPayload>('places_discovery'); } catch { /* DB cold */ }

  return (
    <div className="page admin">
      <h1>Admin</h1>
      <AdminPanel buckets={BUCKETS} timestamps={timestamps} counts={counts} discovery={discovery} />
    </div>
  );
}
