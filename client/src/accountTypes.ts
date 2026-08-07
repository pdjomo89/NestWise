// Account types.
//
// `investment: true` means the add/edit form encourages a "contributed" (cost
// basis) so gains can be shown. `liability: true` means the balance is money
// owed (e.g. a credit card): the form takes a positive amount and stores it
// negative so it subtracts from net worth.
//
// `regions` scopes a type to the countries where it exists — an RRSP is
// meaningless in the US, a 401(k) in Canada. Omitted means "everywhere".
// Filtering is only ever applied to the *picker*: lookups by value always
// search the whole list, so an account keeps its label if the user later
// switches country (or moves).
//
// `tax` is how the money is treated on the way out, and drives the after-tax
// figures in the retirement projection (see convex/planning.ts):
//   deferred — no tax going in, fully taxable as income on withdrawal
//              (RRSP, RRIF, LIRA, LIF, RPP, DPSP, PRPP, 401(k), IRA)
//   free     — no tax on growth or withdrawal (TFSA, FHSA when used for a home)
//   taxable  — held with after-tax money; only the *gain* is taxed, and in
//              Canada only half of a capital gain is included in income
//              (non-registered, brokerage, crypto, real estate)

export type Region = 'CA' | 'US';
export type TaxTreatment = 'deferred' | 'free' | 'taxable';

export type AccountType = {
  value: string;
  label: string;
  investment: boolean;
  liability: boolean;
  regions?: Region[];
  tax?: TaxTreatment;
  // Counts toward the retirement nest egg, as opposed to a general investment
  // or an earmarked pot like an RESP (education) or FHSA (first home).
  retirement?: boolean;
  // Which optgroup the picker files it under.
  group: 'cash' | 'registered' | 'investment' | 'property' | 'debt' | 'other';
  // One-line plain-English hint shown under the picker.
  note?: string;
};

export const ACCOUNT_TYPES: AccountType[] = [
  // — Everyday money, everywhere —
  { value: 'checking', label: 'Checking', investment: false, liability: false, group: 'cash' },
  { value: 'savings', label: 'Savings', investment: false, liability: false, group: 'cash' },
  { value: 'credit', label: 'Credit card', investment: false, liability: true, group: 'debt' },

  // — Canada: registered accounts —
  {
    value: 'rrsp',
    label: 'RRSP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Registered Retirement Savings Plan — deductible going in, taxed as income on withdrawal.',
  },
  {
    value: 'rrsp-spousal',
    label: 'Spousal RRSP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'You contribute and deduct; your spouse owns it and is taxed on withdrawal.',
  },
  {
    value: 'rrsp-group',
    label: 'Group RRSP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Employer-run RRSP, often with a matching contribution.',
  },
  {
    value: 'tfsa',
    label: 'TFSA',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'free',
    retirement: true,
    group: 'registered',
    note: 'Tax-Free Savings Account — no deduction going in, nothing taxed coming out.',
  },
  {
    value: 'fhsa',
    label: 'FHSA',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'free',
    group: 'registered',
    note: 'First Home Savings Account — deductible going in and tax-free out for a first home.',
  },
  {
    value: 'rrif',
    label: 'RRIF',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'What an RRSP becomes by the end of the year you turn 71. A minimum must be withdrawn each year.',
  },
  {
    value: 'lira',
    label: 'LIRA / Locked-in RRSP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Pension money from a former employer. Locked in until a minimum age set by the pension’s jurisdiction.',
  },
  {
    value: 'lif',
    label: 'LIF / LRIF / PRIF',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'The income stage of a LIRA, with both a yearly minimum and a maximum withdrawal.',
  },
  {
    value: 'rpp-db',
    label: 'Pension — defined benefit (RPP)',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Employer pension promising a set income. Enter its commuted value if you know it.',
  },
  {
    value: 'rpp-dc',
    label: 'Pension — defined contribution (RPP)',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Employer pension where the balance, not the income, is what’s promised.',
  },
  {
    value: 'dpsp',
    label: 'DPSP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Deferred Profit Sharing Plan — employer-funded, taxed as income on withdrawal.',
  },
  {
    value: 'prpp',
    label: 'PRPP / VRSP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Pooled plan for small employers and the self-employed (VRSP in Quebec).',
  },
  {
    value: 'resp',
    label: 'RESP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    group: 'registered',
    note: 'Registered Education Savings Plan — for a child’s schooling, so it sits outside the retirement projection.',
  },
  {
    value: 'rdsp',
    label: 'RDSP',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'deferred',
    group: 'registered',
    note: 'Registered Disability Savings Plan, with government grants and bonds.',
  },
  {
    value: 'non-registered',
    label: 'Non-registered investment',
    investment: true,
    liability: false,
    regions: ['CA'],
    tax: 'taxable',
    group: 'investment',
    note: 'Ordinary investment account. Only the gain is taxed, and only half of a capital gain counts as income.',
  },

  // — United States —
  {
    value: 'retirement',
    label: 'Retirement (401k/IRA)',
    investment: true,
    liability: false,
    regions: ['US'],
    tax: 'deferred',
    retirement: true,
    group: 'registered',
    note: 'Tax-deferred workplace or individual retirement account.',
  },

  // — Investments and property, everywhere —
  {
    value: 'brokerage',
    label: 'Brokerage / Stocks',
    investment: true,
    liability: false,
    tax: 'taxable',
    group: 'investment',
  },
  { value: 'iul', label: 'IUL', investment: true, liability: false, tax: 'free', group: 'investment' },
  {
    value: 'crypto',
    label: 'Crypto',
    investment: true,
    liability: false,
    tax: 'taxable',
    group: 'investment',
  },
  {
    value: 'real-estate',
    label: 'Real estate',
    investment: true,
    liability: false,
    tax: 'taxable',
    group: 'property',
  },
  { value: 'other', label: 'Other', investment: false, liability: false, group: 'other' },
];

const byValue = new Map(ACCOUNT_TYPES.map((t) => [t.value, t]));

export const accountType = (type: string): AccountType | undefined => byValue.get(type);

export const ACCOUNT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label])
);

export const isInvestmentType = (type: string) => accountType(type)?.investment ?? false;

export const isLiabilityType = (type: string) => accountType(type)?.liability ?? false;

export const taxTreatment = (type: string): TaxTreatment | undefined => accountType(type)?.tax;

export const isRetirementType = (type: string) => accountType(type)?.retirement ?? false;

// Types offered in the picker for a region, plus anything already in use that
// the region wouldn't normally show — someone who moved keeps their RRSP in the
// list rather than watching it vanish from the dropdown.
export function typesForRegion(region: Region, alsoInclude: string[] = []): AccountType[] {
  const keep = new Set(alsoInclude);
  return ACCOUNT_TYPES.filter((t) => !t.regions || t.regions.includes(region) || keep.has(t.value));
}

export const GROUP_LABEL: Record<AccountType['group'], string> = {
  cash: 'Cash',
  registered: 'Registered & retirement',
  investment: 'Investments',
  property: 'Property',
  debt: 'Debt',
  other: 'Other',
};

export const GROUP_ORDER: AccountType['group'][] = [
  'cash',
  'registered',
  'investment',
  'property',
  'debt',
  'other',
];

// Split balances into the three tax buckets the retirement projection needs.
// Only positive investment balances count — a credit card isn't a nest egg, and
// a negative balance would distort the shares.
export function taxMix(accounts: { type: string; balance: number }[]) {
  const bucket = { deferred: 0, free: 0, taxable: 0 };
  for (const a of accounts) {
    const t = accountType(a.type);
    if (!t?.tax || t.liability || a.balance <= 0) continue;
    bucket[t.tax] += a.balance;
  }
  const total = bucket.deferred + bucket.free + bucket.taxable;
  if (total <= 0) return null;
  return {
    total,
    deferredShare: bucket.deferred / total,
    freeShare: bucket.free / total,
    taxableShare: bucket.taxable / total,
  };
}
