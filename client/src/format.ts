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

// `code` overrides the global display currency for this one amount — used to
// render a linked account/transaction in its own native currency (no FX).
const money = (n: number, opts: Intl.NumberFormatOptions, code?: string) =>
  n.toLocaleString(locale, {
    style: 'currency',
    currency: code ?? currency,
    currencyDisplay: 'narrowSymbol',
    ...opts,
  });

export const usd = (n: number, code?: string) => money(n, { maximumFractionDigits: 0 }, code);

export const usdCents = (n: number, code?: string) => money(n, {}, code);

// The active global display currency (e.g. USD). Used to decide whether a
// native-currency amount needs an explicit code badge to avoid ambiguity.
export const displayCurrency = () => currency;

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
