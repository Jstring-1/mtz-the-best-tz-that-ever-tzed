// Kaiser Permanente options for Contra Costa County employees, transcribed
// from the county's 2027 Employee Benefits Guide ("Blue Book", Medical Plan
// Comparison Guide, pp. 18–21). The guide is a summary — the carrier's
// Evidence of Coverage prevails. Update this file each open enrollment.

export const KAISER_PLAN_YEAR = 2027;
export const KAISER_GUIDE_FILE = '/img/cch/ccc-2027-employee-benefits-guide.pdf';

export const KAISER_PLANS = ['Kaiser HMO Plan A', 'Kaiser HMO Plan B', 'Kaiser HDHP (HSA)', 'Teamsters 856 Trust Fund KP'] as const;

export interface KaiserRow { label: string; cells: [string, string, string, string] }
export interface KaiserSection { title: string; rows: KaiserRow[] }

const same = (s: string): [string, string, string, string] => [s, s, s, s];

export const KAISER_TABLE: KaiserSection[] = [
  {
    title: 'Eligibility & cost-sharing limits',
    rows: [
      { label: 'Who can enroll', cells: same('Must live or work in a Kaiser service area at the time of enrollment') },
      { label: 'Deductible — individual', cells: ['None', '$500', '$1,750', 'None'] },
      { label: 'Deductible — family', cells: ['None', '$500/member, $1,000/family', '$3,500/member, $3,500/family', 'None'] },
      { label: 'Deductible applies to', cells: ['N/A', 'Hospital-related services (dollar copays are not subject to it)', 'All services that need a coinsurance % or copay', 'N/A'] },
      { label: 'Out-of-pocket max — individual', cells: ['$1,500', '$3,000', '$3,500', '$1,500'] },
      { label: 'Out-of-pocket max — family', cells: ['$1,500/member, $3,000/family', '$3,000/member, $6,000/family', '$3,500/member, $7,000/family', '$3,000'] },
      { label: 'Counts toward the max', cells: ['All copays/coinsurance except chiropractic', 'All copays/coinsurance except chiropractic', 'All copays/coinsurance', 'All copays/coinsurance'] },
    ],
  },
  {
    title: 'Hospital & emergency',
    rows: [
      { label: 'Inpatient hospital', cells: ['$0', '10% after deductible', '10% after deductible', '$0'] },
      { label: 'Outpatient surgery (facility)', cells: ['$10', '10% after deductible', '10% after deductible', '$15 per procedure'] },
      { label: 'Emergency department', cells: ['$10', '10% after deductible', '10% after deductible', '$35 per visit (waived if admitted)'] },
      { label: 'Ambulance', cells: ['$0', '10% up to $150 per trip', '10% after deductible', '$0'] },
    ],
  },
  {
    title: 'Doctor visits & tests',
    rows: [
      { label: 'Office visit', cells: ['$10', '$20', '10% after deductible', '$10'] },
      { label: 'Preventive exam', cells: same('$0') },
      { label: 'Urgent care', cells: ['$10', '$20', '10% after deductible', '$10'] },
      { label: 'Allergy injections', cells: ['$3', '$0', '10% after deductible', '$0'] },
      { label: 'Physical / occupational / speech therapy', cells: ['$10', '$20', '10% after deductible', '$10'] },
      { label: 'Diagnostic X-ray & lab', cells: ['$0', '$10', '10% after deductible', '$0'] },
    ],
  },
  {
    title: 'Prescriptions',
    rows: [
      { label: 'Retail pharmacy', cells: [
        '$10 generic and $20 brand (up to 100-day supply); $20 specialty (up to 30 days)',
        '$10 generic, $30 brand and $30 specialty (up to 30-day supply)',
        '$10 generic, $30 brand, $30 specialty (up to 30 days), after deductible',
        '$10 generic and $20 brand (up to 100-day supply)',
      ] },
      { label: 'Mail order (100-day supply)', cells: ['$10 generic, $20 brand', '$20 generic, $60 brand', '$20 generic, $60 brand (after deductible)', '$10 generic, $20 brand'] },
    ],
  },
  {
    title: 'Additional services',
    rows: [
      { label: 'Durable medical equipment', cells: ['$0', '20% (no deductible)', '10% after deductible', '$0'] },
      { label: 'Vision (routine exam)', cells: ['$0', '$0', '10% after deductible', '$0'] },
      { label: 'Hearing exams', cells: ['$10', '$20', '10% after deductible', '$0'] },
      { label: 'Infertility (diagnosis & treatment)', cells: ['Standard cost shares for the service*', 'Standard cost shares for the service*', 'Standard cost shares for the service*', 'Subject to applicable copays'] },
      { label: 'Home health', cells: ['$0, up to 100 visits', '$0 after deductible, up to 100 visits', '$0 after deductible, up to 100 visits', '$0'] },
      { label: 'Skilled nursing', cells: ['$0, up to 100 days', '10% (no deductible), up to 100 days', '10% after deductible, 100 days', '$0'] },
      { label: 'Hospice', cells: same('$0') },
      { label: 'Acupuncture', cells: ['No self-referral (only with referral at a Kaiser facility)', 'No self-referral (only with referral at a Kaiser facility)', 'No self-referral (only with referral at a Kaiser facility)', '$15, up to 20 visits (combined with chiropractic)'] },
      { label: 'Chiropractic', cells: ['$15, up to 20 visits', '$15, up to 20 visits', 'Not covered', '$15, up to 20 visits (combined with acupuncture)'] },
    ],
  },
];

export const KAISER_TABLE_NOTE =
  '* For outpatient, lab, pharmacy and hospital services; the Evidence of Coverage has the details.';

export const KAISER_CHANGES_2027: string[] = [
  'Kaiser HMO Plan A, the Teamsters 856 Trust Fund plan and the High-Deductible Health Plan (HDHP): the monthly rate is $0 to employees for all three tiers (employee-only, +1, family) for plan year 2027.',
  'Kaiser HDHP only: calendar-year deductible rises to $1,750 (employee-only) and $3,500 (family). Out-of-pocket max rises to $3,500 (employee-only), $3,500 per member in a family, and $7,000 per family.',
  'If you have a Health Savings Account (HSA, offered only with the Kaiser HDHP), adjust your annual pledge for 2027.',
  'Health Net is leaving the California group market. Health Net plans can still be chosen for 2027; the County is working on options for 2028.',
];

export const KAISER_ENROLLMENT = {
  opens: 'Monday, October 12, 2026 at 8:00 AM',
  closes: 'Friday, October 30, 2026 at 5:00 PM',
  where: 'PeopleSoft Employee Self Service (eBenefits)',
  whereUrl: 'https://selfservice2.cccounty.us',
  pageUrl: 'https://www.contracosta.ca.gov/6268/2027-NonPERS-Active-Open-Enrollment',
};

export const KAISER_CONTACTS: { label: string; value: string; href?: string }[] = [
  { label: 'Kaiser Permanente member services', value: '1-800-464-4000', href: 'tel:18004644000' },
  { label: 'Kaiser site for County employees', value: 'choose.kp.org/ccc', href: 'https://choose.kp.org/ccc' },
  { label: 'Teamsters plan administrator (Northwest Administrators)', value: '1-800-297-4595', href: 'tel:18002974595' },
  { label: 'County Employee Benefits', value: '(925) 655-2100 · benefits@hrd.cccounty.us', href: 'mailto:benefits@hrd.cccounty.us' },
  { label: 'County plan summaries (SBC) & EOCs', value: 'contracosta.ca.gov — Plan Highlights', href: 'https://www.contracosta.ca.gov/10701/2027-Plan-Highlights-and-Summary-of-Bene' },
  { label: 'Covered California (marketplace)', value: '1-877-752-4737', href: 'tel:18777524737' },
];

export interface KaiserDoc { slug: string; group: string; label: string; file: string; note: string }

// Documents bundled under /public so they open in-page (with Ctrl+F). Kaiser's
// plan documents are the County's own copies; the County had not yet posted
// 2027 versions when these were added (Oct 2026), so they are 2026 plan-year files
// (Teamsters: Mar 2025 – Feb 2027). Swap in the 2027 files when the County posts them.
export const KAISER_DOCS: KaiserDoc[] = [
  { slug: 'guide-2027', group: 'County guide', label: '2027 Employee Benefits Guide (Blue Book)',
    file: KAISER_GUIDE_FILE,
    note: 'County-wide 2027 open-enrollment guide: eligibility, dental, vision, FSA, plan comparison charts.' },

  { slug: 'a-highlights', group: 'Plan A — Traditional HMO', label: 'Plan Highlights (2026)',
    file: '/img/kaiser/kaiser-plan-a-highlights-2026.pdf', note: 'Two-page benefit summary for Contra Costa County Kaiser Plan A.' },
  { slug: 'a-sbc', group: 'Plan A — Traditional HMO', label: 'Summary of Benefits & Coverage (2026)',
    file: '/img/kaiser/kaiser-plan-a-sbc-2026.pdf', note: 'Standard SBC: what the plan covers and what you pay, with cost examples.' },
  { slug: 'a-eoc', group: 'Plan A — Traditional HMO', label: 'Evidence of Coverage (2026)',
    file: '/img/kaiser/kaiser-plan-a-eoc-2026.pdf', note: 'Full plan contract (EOC #3): covered services, exclusions, appeals. 107 pages.' },

  { slug: 'b-highlights', group: 'Plan B — Deductible HMO', label: 'Plan Highlights (2026)',
    file: '/img/kaiser/kaiser-plan-b-highlights-2026.pdf', note: 'Two-page benefit summary for Contra Costa County Kaiser Plan B.' },
  { slug: 'b-sbc', group: 'Plan B — Deductible HMO', label: 'Summary of Benefits & Coverage (2026)',
    file: '/img/kaiser/kaiser-plan-b-sbc-2026.pdf', note: 'Standard SBC: what the plan covers and what you pay, with cost examples.' },
  { slug: 'b-eoc', group: 'Plan B — Deductible HMO', label: 'Evidence of Coverage (2026)',
    file: '/img/kaiser/kaiser-plan-b-eoc-2026.pdf', note: 'Full plan contract (EOC #20): covered services, exclusions, appeals. 107 pages.' },

  { slug: 'hdhp-highlights', group: 'HDHP — HSA-qualified', label: 'Plan Highlights (2026)',
    file: '/img/kaiser/kaiser-hdhp-highlights-2026.pdf', note: 'Two-page benefit summary for the Kaiser High-Deductible Health Plan.' },
  { slug: 'hdhp-sbc', group: 'HDHP — HSA-qualified', label: 'Summary of Benefits & Coverage (2026)',
    file: '/img/kaiser/kaiser-hdhp-sbc-2026.pdf', note: 'Standard SBC: what the plan covers and what you pay, with cost examples.' },
  { slug: 'hdhp-eoc', group: 'HDHP — HSA-qualified', label: 'Evidence of Coverage (2026)',
    file: '/img/kaiser/kaiser-hdhp-eoc-2026.pdf', note: 'Full plan contract (EOC #33, HSA-qualified): covered services, exclusions, appeals. 108 pages.' },

  { slug: 'tm-highlights', group: 'Teamsters 856 Trust Fund plan', label: 'Plan Highlights (Mar 2025 – Feb 2026)',
    file: '/img/kaiser/teamsters-kaiser-highlights-2025.pdf', note: 'Two-page benefit summary for the Teamsters Local 856 Kaiser plan.' },
  { slug: 'tm-sbc', group: 'Teamsters 856 Trust Fund plan', label: 'Summary of Benefits & Coverage (Mar 2026 – Feb 2027)',
    file: '/img/kaiser/teamsters-kaiser-sbc-2026.pdf', note: 'Standard SBC for the plan year that runs March 1, 2026 to February 28, 2027.' },
  { slug: 'tm-eoc', group: 'Teamsters 856 Trust Fund plan', label: 'Evidence of Coverage (2026)',
    file: '/img/kaiser/teamsters-kaiser-eoc-2026.pdf', note: 'Full plan contract (EOC #29): covered services, exclusions, appeals. 118 pages.' },

  { slug: 'fee-list', group: 'Costs', label: 'Kaiser 2026 Sample Fee List (Northern California)',
    file: '/img/kaiser/kaiser-sample-fee-list-2026.pdf', note: 'Sample prices for common services, useful for estimating costs before the deductible is met (HDHP, Plan B).' },
];
