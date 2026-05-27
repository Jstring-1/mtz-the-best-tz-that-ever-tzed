import { getAllJsonTimestamps, getRowCounts } from '@/lib/cache';
import AdminPanel from './AdminPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Each bucket's `desc` lists EXACTLY the jobs in src/lib/cron.ts so the
// admin UI doesn't drift from reality. Order matches the cron file.
const BUCKETS = [
  { id: '1m',  desc: 'weatherapi_current' },
  { id: '2m',  desc: 'purpleair' },
  { id: '5m',  desc: 'noaa_alerts · twelvedata_stocks' },
  { id: '15m', desc: 'trains_mtz' },
  { id: '1h',  desc: 'noaa_hourly · noaa_buoys' },
  { id: '4h',  desc: 'news_feeds · news_aggregated · local_events · shelter_pets · noaa_forecast · noaa_aviation · weatherapi_marine · weatherapi_forecast · usgs_quakes · ebird' },
  { id: '12h', desc: 'osm_places · ticketmaster_events · gov_local · gov_national · outbreaks · affecting_bills · rep_votes · purge_stores' },
  { id: '1d',  desc: 'council_votes · ccrmc_data · ccc_comp · reps_data · crime_data · cch_health · housing' },
  { id: 'all', desc: 'Every bucket sequentially (manual / cold start)' },
];

export default async function AdminPage() {
  let timestamps: Record<string, string> = {};
  let counts: Record<string, number> = {};
  try { timestamps = await getAllJsonTimestamps(); } catch { /* DB cold */ }
  try { counts = await getRowCounts(); } catch { /* DB cold */ }

  return (
    <div className="page admin">
      <h1>Admin</h1>
      <AdminPanel buckets={BUCKETS} timestamps={timestamps} counts={counts} />
    </div>
  );
}
