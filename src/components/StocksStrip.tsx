import { getJson } from '@/lib/cache';
import StocksClient, { type StockEntry, type TwelveQuote } from './StocksClient';

// Display order + symbol mapping. Twelvedata uses bare symbols for major
// indices (SPX / DJI / IXIC); we render them with their familiar
// Yahoo-style ^ prefix and link to Yahoo Finance for more detail.
const SYMBOLS: Array<{ display: string; tdSymbol: string; name: string; yahooId: string }> = [
  { display: '^GSPC', tdSymbol: 'SPX',  name: 'S&P 500',                    yahooId: '%5EGSPC' },
  { display: '^DJI',  tdSymbol: 'DJI',  name: 'Dow Jones Industrial Avg',   yahooId: '%5EDJI'  },
  { display: '^IXIC', tdSymbol: 'IXIC', name: 'Nasdaq Composite',           yahooId: '%5EIXIC' },
  { display: 'GME',   tdSymbol: 'GME',  name: 'GameStop Corp',              yahooId: 'GME'     },
  { display: 'PSLV',  tdSymbol: 'PSLV', name: 'Sprott Physical Silver',     yahooId: 'PSLV'    },
];

export default async function StocksStrip() {
  const raw = await getJson<Record<string, TwelveQuote> | TwelveQuote | null>('12D_stocks');
  if (!raw || typeof raw !== 'object') return null;

  // Twelvedata returns a single object for one symbol, or a map keyed by
  // symbol for many. Normalise to a map.
  const map: Record<string, TwelveQuote> = ('symbol' in raw && typeof raw.symbol === 'string')
    ? { [raw.symbol]: raw as TwelveQuote }
    : (raw as Record<string, TwelveQuote>);

  const stocks: StockEntry[] = SYMBOLS.map((s) => ({
    display:   s.display,
    name:      s.name,
    yahooUrl:  `https://finance.yahoo.com/quote/${s.yahooId}`,
    quote:     map[s.tdSymbol] ?? map[s.display] ?? null,
  }));

  return <StocksClient stocks={stocks} />;
}
