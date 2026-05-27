'use client';

import Modal from './Modal';
import { useUrlBool, useUrlEnum } from '@/lib/useUrlState';
import { EconomyBody } from './EconomyDetail';
import { HousingBody } from './HousingDetail';
import { CrimeBody } from './CrimeDetail';
import type { GovNationalPayload } from '@/lib/gov';
import type { HousingPayload } from '@/lib/housing';

interface StockQuote {
  symbol: string;
  name: string;
  close: string;
  previous_close: string;
  change: string;
  percent_change: string;
  is_market_open?: boolean;
  fifty_two_week?: { low: string; high: string };
}

interface Props {
  label: string;
  tooltip?: string;
  economy: GovNationalPayload['economy'] | null;
  stocks: Record<string, StockQuote> | null;
  gas: { value: string; period: string } | null;
  housing: HousingPayload | null;
}

type Tab = 'economy' | 'housing' | 'crime';
const TABS: Tab[] = ['economy', 'housing', 'crime'];
const TAB_LABEL: Record<Tab, string> = {
  economy: 'Economy',
  housing: 'Housing',
  crime: 'Crime',
};

// Consolidated "Indicators" civic-bar popup. Three tabs, each delegated
// to the matching body component from the (still-extant) standalone
// detail files. Replaces three peer civic-bar chips (Economy / Housing
// / Crime) — they all carry slow-moving macro stats that read as a
// group rather than individual incidents, so it makes more sense to
// surface them under one heading.
//
// Tabs are rendered conditionally so the Crime tab's lazy fetch only
// fires when the user activates it.
export default function IndicatorsDetail({ label, tooltip, economy, stocks, gas, housing }: Props) {
  const [open, setOpen] = useUrlBool('indicators');
  const [tab, setTab] = useUrlEnum<Tab>('itab', TABS, 'economy');

  return (
    <>
      <button type="button" className="civic-row-btn" onClick={() => setOpen(true)} title={tooltip}>
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Civic indicators" size="lg">
        <div className="news-tabs" role="tablist" style={{ marginTop: 0 }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`news-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {tab === 'economy' && <EconomyBody data={economy} stocks={stocks} gas={gas} />}
          {tab === 'housing' && <HousingBody data={housing} />}
          {tab === 'crime'   && <CrimeBody active={open && tab === 'crime'} />}
        </div>
      </Modal>
    </>
  );
}
