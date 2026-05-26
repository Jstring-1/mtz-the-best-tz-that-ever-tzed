'use client';

import { useState } from 'react';
import Modal from './Modal';

// Footer popup triggers — Privacy / Terms / Sources & API credits.
// Each opens the shared Modal so the popup chrome matches every
// other detail viewer in the app. Content is hand-written rather
// than pulled from a CMS — these change very rarely.

type Page = 'privacy' | 'terms' | 'sources';

export default function FooterLinks() {
  const [open, setOpen] = useState<Page | null>(null);

  return (
    <>
      <button type="button" className="ftr-link" onClick={() => setOpen('privacy')}>Privacy</button>
      <span className="ftr-sep" aria-hidden>·</span>
      <button type="button" className="ftr-link" onClick={() => setOpen('terms')}>Terms</button>
      <span className="ftr-sep" aria-hidden>·</span>
      <button type="button" className="ftr-link" onClick={() => setOpen('sources')}>Sources</button>

      <Modal open={open === 'privacy'} onClose={() => setOpen(null)} title="Privacy" size="md">
        <PrivacyBody />
      </Modal>
      <Modal open={open === 'terms'} onClose={() => setOpen(null)} title="Terms & Disclaimer" size="md">
        <TermsBody />
      </Modal>
      <Modal open={open === 'sources'} onClose={() => setOpen(null)} title="Sources & API credits" size="lg">
        <SourcesBody />
      </Modal>
    </>
  );
}

function PrivacyBody() {
  return (
    <div className="legalese">
      <p>
        <strong>mtz.city</strong> is a free, public-data hyperlocal dashboard for Martinez, California.
        It does not run analytics, set tracking cookies, or share visitor data with advertisers.
      </p>
      <h3>What we store</h3>
      <ul>
        <li>
          <strong>URL state.</strong> Modal open/close flags, list filters, and tab selections are
          encoded in the page URL (e.g. <code>?bills=1</code>) so links remain shareable. They
          live in browser history only — nothing is sent to a server.
        </li>
        <li>
          <strong>Cached upstream data.</strong> Weather, news, gov-data and similar feeds are
          cached in our database to keep the site fast and reduce upstream API load. None of it
          is keyed to you.
        </li>
        <li>
          <strong>Server access logs.</strong> Our hosting provider (Railway) keeps standard HTTP
          access logs that include IP addresses for short-term abuse prevention. We don&rsquo;t
          read them except to debug outages.
        </li>
      </ul>
      <h3>What we don&rsquo;t do</h3>
      <ul>
        <li>No Google Analytics, Meta Pixel, or any third-party analytics SDK.</li>
        <li>No advertising network — no display ads, no programmatic bidding.</li>
        <li>No user accounts. There&rsquo;s nothing to sign in to.</li>
        <li>No fingerprinting, session replay, or behavioral profiling.</li>
      </ul>
      <h3>Third-party data sources</h3>
      <p>
        When you open a popup that fetches live data on demand (e.g. article extraction for the
        News card, or a federal-bill detail in the Bills popup), the request goes through our
        server — your browser never talks directly to the upstream. The upstream API sees only
        our server&rsquo;s IP. See <em>Sources &amp; API credits</em> for the full list of
        upstreams.
      </p>
      <h3>Map tiles</h3>
      <p>
        Embedded maps use OpenStreetMap tiles loaded by your browser from{' '}
        <code>tile.openstreetmap.org</code>. OSM&rsquo;s tile service may log standard request
        metadata; we have no relationship with it.
      </p>
      <p className="muted">
        Questions? Reach out via the GitHub repo linked in <em>Sources &amp; API credits</em>.
      </p>
    </div>
  );
}

function TermsBody() {
  return (
    <div className="legalese">
      <p>
        <strong>Use at your own risk.</strong> mtz.city aggregates public-data sources for the
        Martinez, California area. It is provided <em>as-is</em>, without warranty of any kind.
      </p>
      <h3>Not an official source</h3>
      <p>
        This site is not affiliated with the City of Martinez, Contra Costa County, Contra Costa
        Health Services / Contra Costa Health Plan, the State of California, or any U.S.
        government agency. Logos and document titles are used for editorial reference only.
      </p>
      <h3>Don&rsquo;t rely on this site alone for time-critical information</h3>
      <ul>
        <li>
          <strong>Weather alerts &amp; disasters.</strong> Sign up directly for NWS / FEMA
          alerts. Cached alerts here can lag minutes behind the official source.
        </li>
        <li>
          <strong>Recalls.</strong> Check{' '}
          <a href="https://www.recalls.gov/" target="_blank" rel="noopener">recalls.gov</a> for
          the authoritative list.
        </li>
        <li>
          <strong>Health-plan documents.</strong> The CCHP PDFs in the CCH popup are bundled
          snapshots. Always confirm coverage details with{' '}
          <a href="https://cchealth.org/healthplan" target="_blank" rel="noopener">CCHP</a>{' '}
          directly before making decisions.
        </li>
        <li>
          <strong>Legislation.</strong> Bill summaries and vote tallies are pulled from
          Congress.gov / OpenStates. For authoritative records, consult those sources.
        </li>
      </ul>
      <h3>Editorial decisions</h3>
      <p>
        Which sources to surface, which scorecards to display, and the layout itself are all
        editorial choices by the maintainer. Pull requests welcome via the GitHub repo.
      </p>
    </div>
  );
}

function SourcesBody() {
  return (
    <div className="legalese">
      <p>
        mtz.city stands on the shoulders of dozens of public data feeds. Where an API requires
        explicit attribution, it&rsquo;s noted below.
      </p>

      <h3>Weather &amp; environment</h3>
      <ul>
        <li><strong>National Weather Service (NOAA)</strong> — forecasts, alerts, hourly conditions, marine, aviation, buoys. <a href="https://www.weather.gov/documentation/services-web-api" target="_blank" rel="noopener">API docs</a>.</li>
        <li><strong>WeatherAPI.com</strong> — current conditions + marine + 7-day forecast.</li>
        <li><strong>PurpleAir</strong> — neighborhood AQI sensors.</li>
        <li><strong>USGS Earthquake Hazards Program</strong> — significant California earthquake feed.</li>
        <li><strong>eBird (Cornell Lab of Ornithology)</strong> — recent bird sightings. <a href="https://documenter.getpostman.com/view/664302/S1ENwy59" target="_blank" rel="noopener">API docs</a>.</li>
        <li><strong>Wikipedia</strong> — bird species summaries via the public REST API.</li>
      </ul>

      <h3>Government &amp; civic</h3>
      <ul>
        <li><strong>Congress.gov API</strong> (Library of Congress) — federal bills + sponsor/cosponsor info.</li>
        <li><strong>OpenStates</strong> (Plural Policy) — California legislature data.</li>
        <li><strong>USAspending.gov</strong> — federal grants + contracts to Contra Costa.</li>
        <li><strong>U.S. Census Bureau ACS</strong> — Contra Costa median income + home value.</li>
        <li><strong>Bureau of Labor Statistics (BLS)</strong> — LAUS unemployment + CPI for U.S. / CA / Contra Costa / Bay Area MSA.</li>
        <li><strong>U.S. Energy Information Administration (EIA)</strong> — California weekly retail gas series.</li>
        <li><strong>FBI Crime Data Explorer</strong> — Martinez agency-level crime stats.</li>
        <li><strong>U.S. Treasury Fiscal Data</strong> — federal debt + daily yield curve.</li>
      </ul>

      <h3>Health &amp; safety</h3>
      <ul>
        <li><strong>CMS Hospital Compare</strong> (data.cms.gov) — CCRMC overall rating, HCAHPS, timely-and-effective-care.</li>
        <li><strong>FEMA</strong> — active disaster declarations.</li>
        <li><strong>NASA EONET</strong> — open natural events (wildfires, storms, volcanoes).</li>
        <li><strong>disease.sh</strong> — global / US / California COVID snapshot.</li>
        <li><strong>CDC Open Data</strong> (data.cdc.gov) — NORS foodborne outbreaks via Socrata.</li>
        <li><strong>Delphi Epidata API</strong> (Carnegie Mellon) — fluview ILI surveillance.</li>
        <li><strong>WHO Disease Outbreak News</strong> — early warnings RSS.</li>
        <li><strong>FDA &amp; CPSC</strong> — food / drug / device / consumer-product recalls.</li>
        <li><strong>Contra Costa Health Plan</strong> — bundled member-document PDFs (linked from cchealth.org).</li>
      </ul>

      <h3>Local &amp; people</h3>
      <ul>
        <li><strong>OpenStreetMap (Overpass API)</strong> — curated Martinez places. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OSM contributors</a>.</li>
        <li><strong>Leaflet</strong> — embedded map widgets, BSD-licensed.</li>
        <li><strong>OpenStreetMap tile servers</strong> — base map tiles for every pin map.</li>
        <li><strong>East Bay Regional Park District (EBRPD)</strong> — bundled park PDFs.</li>
        <li><strong>City of Martinez</strong> — Municipal Code PDF (public document).</li>
        <li><strong>Contra Costa Animal Services / 24petconnect</strong> — adoptable pets feed.</li>
        <li><strong>Ticketmaster Discovery API</strong> — regional events.</li>
        <li><strong>Local venue scrapes</strong> — Del Cielo, Five Suns, etc., for the &ldquo;Local&rdquo; events tab.</li>
      </ul>

      <h3>News</h3>
      <ul>
        <li><strong>BBC RSS</strong> — World news tab.</li>
        <li><strong>Local Martinez RSS feeds</strong> — Local news tab.</li>
        <li><strong>Mozilla Readability</strong> — in-popup article extraction.</li>
      </ul>

      <h3>Markets</h3>
      <ul>
        <li><strong>Yahoo Finance (public chart endpoint)</strong> — major US index quotes (S&amp;P 500, Dow, NASDAQ, Russell 2000, VIX).</li>
      </ul>

      <h3>Hosting &amp; software</h3>
      <ul>
        <li><strong>Next.js</strong> + <strong>React</strong> — framework.</li>
        <li><strong>PostgreSQL</strong> — cache + structured tables.</li>
        <li><strong>Railway</strong> — hosting + Postgres.</li>
        <li><strong>Source code</strong> — <a href="https://github.com/Jstring-1/mtz-the-best-tz-that-ever-tzed" target="_blank" rel="noopener">github.com/Jstring-1/mtz-the-best-tz-that-ever-tzed</a></li>
      </ul>

      <p className="muted">
        Missing an attribution? Open an issue on the GitHub repo above.
      </p>
    </div>
  );
}
