// Currency/number formatting. The active locale and display currency are set by
// the preferences provider, so call sites stay locale-agnostic. Changing the
// currency only changes formatting — amounts are not converted (no FX rates).
let locale: 'en-US' | 'fr-FR' = 'en-US';
let currency = 'USD';

export const setLocale = (l: 'en-US' | 'fr-FR') => {
  locale = l;
};
export const setCurrency = (c: string) => {
  currency = c;
};
const isFr = () => locale === 'fr-FR';

const money = (n: number, opts: Intl.NumberFormatOptions) =>
  n.toLocaleString(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    ...opts,
  });

export const usd = (n: number) => money(n, { maximumFractionDigits: 0 });

export const usdCents = (n: number) => money(n, {});

const currencySymbol = () => {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? '$';
};

// Compact currency for axis ticks: en "$1.5k"/"$2M", fr "1,5 k$"/"2 M$".
export const usdCompact = (n: number) => {
  const num = (v: number, d: number) => v.toLocaleString(locale, { maximumFractionDigits: d });
  const s = currencySymbol();
  if (n >= 1_000_000) return isFr() ? `${num(n / 1_000_000, 1)} M${s}` : `${s}${num(n / 1_000_000, 1)}M`;
  if (n >= 1000) return isFr() ? `${num(n / 1000, 1)} k${s}` : `${s}${num(n / 1000, 1)}k`;
  return usd(n);
};
