import { useEffect, useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useLang } from '../prefs';
import { errorMessage } from '../errors';
import { clearWelcome } from '../onboarding';

export type PlanKey = 'monthly' | 'annual';
export type PlanInfo = {
  key: PlanKey;
  priceId: string;
  amount: number | null;
  currency: string | null;
  interval: string | null;
};

// Stripe amounts are in the currency's minor unit — cents for USD, whole yen
// for JPY. Derive the divisor from the currency itself so zero-decimal
// currencies aren't rendered 100× too small.
//
// Unlike the rest of the app (see format.ts) this uses `symbol`, not
// `narrowSymbol`: the narrow form renders CAD as "$10.00", identical to USD, and
// on the screens that take someone's money the currency can't be a guess. The
// full form gives "CA$10.00" while leaving the viewer's own currency plain.
export function formatMinor(amount: number, currency: string, locale: string): string {
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(amount / 10 ** digits);
}

// Everything both purchase surfaces need: live prices, the trial wording, and
// the redirect to Stripe. Shared by the Settings panel and the post-signup
// welcome step so the two can never advertise different terms.
export function usePlanPicker() {
  const { t, lang } = useLang();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  const billing = useQuery(api.stripe.status);
  const listPlans = useAction(api.stripe.listPlans);
  const createCheckout = useAction(api.stripe.createCheckoutSession);

  const [plans, setPlans] = useState<PlanInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only worth a round trip when there is actually something to sell.
  const sellable = Boolean(billing?.configured && !billing.pro);

  useEffect(() => {
    if (!sellable || plans) return;
    let cancelled = false;
    listPlans()
      .then((p) => !cancelled && setPlans(p as PlanInfo[]))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [sellable, plans, listPlans]);

  // A trial on offer, described in whole months where it divides evenly
  // ("2 months free" reads better than "60 days free"). Zero once this user has
  // already had one, so we never advertise a trial checkout won't grant.
  //
  // The unit is translated as a whole phrase, not word by word: French needs
  // "2 mois offerts" but "1 mois offert", and gluing t('months') to t('free')
  // can't produce that agreement.
  const trialDays = billing?.trialDays ?? 0;
  const trialMonths = trialDays % 30 === 0 ? trialDays / 30 : 0;
  const trialLabel =
    trialDays <= 0
      ? null
      : trialMonths > 0
      ? `${trialMonths} ${trialMonths === 1 ? t('month free') : t('months free')}`
      : `${trialDays} ${t('days free')}`;

  // What the yearly membership saves against paying monthly, so the annual card
  // has a reason to exist. Only when both are priced in the same currency.
  const monthlyPlan = plans?.find((p) => p.key === 'monthly');
  const annualPlan = plans?.find((p) => p.key === 'annual');
  const annualSavingPct =
    monthlyPlan?.amount && annualPlan?.amount && monthlyPlan.currency === annualPlan.currency
      ? Math.round((1 - annualPlan.amount / (monthlyPlan.amount * 12)) * 100)
      : 0;

  async function startCheckout(plan: PlanKey) {
    setError(null);
    setBusy(true);
    // We're leaving the app; the welcome step has served its purpose either way.
    clearWelcome();
    try {
      const { url } = await createCheckout({ plan, origin: window.location.origin });
      window.location.href = url;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return {
    billing,
    plans,
    busy,
    error,
    setError,
    trialDays,
    trialLabel,
    annualSavingPct,
    startCheckout,
    locale,
  };
}

// The monthly/annual cards themselves.
export default function PlanCards({
  plans,
  busy,
  trialLabel,
  annualSavingPct,
  locale,
  onSelect,
}: {
  plans: PlanInfo[];
  busy: boolean;
  trialLabel: string | null;
  annualSavingPct: number;
  locale: string;
  onSelect: (plan: PlanKey) => void;
}) {
  const { t } = useLang();
  return (
    <div className="plan-picker">
      {plans.map((p) => (
        <button
          key={p.key}
          className="plan-option"
          onClick={() => onSelect(p.key)}
          disabled={busy}
        >
          <span className="plan-option-name">
            {p.key === 'annual' ? t('Annual') : t('Monthly')}
            {p.key === 'annual' && annualSavingPct > 0 && (
              <span className="plan-option-badge">
                {annualSavingPct}% {t('off')}
              </span>
            )}
          </span>
          {trialLabel && <span className="plan-option-trial">{trialLabel}</span>}
          <span className="plan-option-price">
            {trialLabel && <span className="plan-option-then">{t('then')} </span>}
            {p.amount !== null && p.currency ? formatMinor(p.amount, p.currency, locale) : '—'}
            <span className="plan-option-interval">
              {' / '}
              {p.interval === 'year' ? t('year') : t('month')}
            </span>
          </span>
          <span className="plan-option-note">
            {busy ? t('Working…') : trialLabel ? t('Start free trial') : t('Subscribe')}
          </span>
        </button>
      ))}
    </div>
  );
}
