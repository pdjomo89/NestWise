import { useEffect, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useLang } from '../prefs';
import { errorMessage } from '../errors';
import PlanCards, { usePlanPicker } from './PlanCards';

// What Pro unlocks. Kept next to the price so the pitch and the server-side
// gates (convex/plaid.ts, convex/retirement.ts) stay in sync by eye.
const PRO_FEATURES = [
  'Link your banks and import transactions automatically',
  'Keep a retirement plan for every person in your household',
  'Everything else in NestWise, forever',
];

// Subscription panel shown in Settings. Renders nothing at all until Stripe is
// configured, so a deployment without billing looks exactly as it did before.
export default function Billing() {
  const { t } = useLang();
  const createPortal = useAction(api.stripe.createPortalSession);
  const refresh = useAction(api.stripe.refresh);

  const [notice, setNotice] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const picker = usePlanPicker();
  const { billing, plans, error, setError, trialLabel, annualSavingPct, startCheckout, locale } =
    picker;

  const configured = billing?.configured ?? false;
  const pro = billing?.pro ?? false;
  const busy = picker.busy || portalBusy;

  // Handle the return trip from Stripe (?checkout=success|cancelled|managed).
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('checkout');
    if (!outcome) return;
    // Drop the param so a refresh doesn't replay this.
    window.history.replaceState({}, '', window.location.pathname);
    if (outcome === 'cancelled') {
      setNotice(t('Checkout cancelled — you have not been charged.'));
      return;
    }
    // The webhook is the normal path, but the browser can beat it back here —
    // and in local development Stripe can't reach the deployment at all — so
    // pull the subscription straight from Stripe. Retry briefly for the race.
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const r = await refresh();
          if (r.pro) {
            if (outcome === 'success') setNotice(t('You’re on NestWise Pro — thank you!'));
            break;
          }
        } catch (e) {
          setError(errorMessage(e));
          break;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount: the URL is read directly, not from state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openPortal() {
    setError(null);
    setPortalBusy(true);
    try {
      const { url } = await createPortal({ origin: window.location.origin });
      window.location.href = url;
    } catch (e) {
      setError(errorMessage(e));
      setPortalBusy(false);
    }
  }

  // Still loading, or billing isn't switched on for this deployment.
  if (billing === undefined || !configured) return null;

  const asDate = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const renewal = billing.currentPeriodEnd ? asDate(billing.currentPeriodEnd) : null;
  const trialEnds = billing.trialEnd ? asDate(billing.trialEnd) : renewal;

  return (
    <section className="panel settings">
      <h2>{t('NestWise Pro')}</h2>

      {error && <div className="banner error">{error}</div>}
      {notice && !error && <p className="muted small">{notice}</p>}

      {pro ? (
        <>
          <div className="settings-row">
            <span className="settings-label">
              <span className="pill savings">{billing.trialing ? t('Trial') : t('Pro')}</span>{' '}
              {billing.trialing
                ? t('Free trial')
                : billing.interval === 'year'
                ? t('Annual plan')
                : t('Monthly plan')}
            </span>
            <button className="toggle-btn" onClick={openPortal} disabled={busy}>
              {busy ? t('Working…') : t('Manage billing')}
            </button>
          </div>
          <p className="muted small">
            {billing.status === 'past_due'
              ? t('Your last payment failed. Update your card to keep Pro.')
              : billing.trialing
              ? billing.cancelAtPeriodEnd
                ? trialEnds
                  ? `${t('Your trial ends on')} ${trialEnds}. ${t('You won’t be charged.')}`
                  : t('Your trial is ending and you won’t be charged.')
                : trialEnds
                ? `${t('Free until')} ${trialEnds} — ${t('your first payment is taken then.')}`
                : t('You’re on a free trial.')
              : billing.cancelAtPeriodEnd
              ? renewal
                ? `${t('Pro ends on')} ${renewal}.`
                : t('Pro ends at the end of this billing period.')
              : renewal
              ? `${t('Renews on')} ${renewal}.`
              : t('Your subscription is active.')}
          </p>
          <p className="muted small">
            {t('Change your card, switch plans, download invoices or cancel in the billing portal.')}
          </p>
        </>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: -8 }}>
            {t('Upgrade to unlock the parts of NestWise that do the work for you.')}
          </p>
          <ul className="pro-features">
            {PRO_FEATURES.map((f) => (
              <li key={f}>{t(f)}</li>
            ))}
          </ul>

          {plans === null ? (
            <p className="muted small">{t('Loading…')}</p>
          ) : plans.length === 0 ? (
            <p className="muted small">
              {t('No plans are configured yet — add your Stripe price ids to finish setup.')}
            </p>
          ) : (
            <PlanCards
              plans={plans}
              busy={busy}
              trialLabel={trialLabel}
              annualSavingPct={annualSavingPct}
              locale={locale}
              onSelect={startCheckout}
            />
          )}

          <p className="muted small">
            {trialLabel
              ? t(
                  'Payments are handled by Stripe. You won’t be charged until the trial ends, and cancelling before then costs nothing. Prices are shown in your local currency, with the payment methods common in your country.'
                )
              : t(
                  'Payments are handled by Stripe. You’ll see the price in your local currency and the payment methods common in your country. Cancel anytime.'
                )}
          </p>
        </>
      )}
    </section>
  );
}
