import { useLang } from '../prefs';
import PlanCards, { usePlanPicker } from './PlanCards';

// Shown once, immediately after someone creates their account: the trial offer
// on its own screen instead of buried in Settings. Skipping is a first-class
// option — the same cards stay available in Settings → NestWise Pro forever.
//
// App only mounts this when there is genuinely something to sell (Stripe
// configured, user not already subscribed), so it never renders an empty offer.
export default function Welcome({ onDone }: { onDone: () => void }) {
  const { t } = useLang();
  const { plans, busy, error, trialDays, trialLabel, annualSavingPct, startCheckout, locale } =
    usePlanPicker();

  // The concrete date the first payment would land, so "free trial" isn't an
  // abstraction. Stripe computes the real one; this matches it because both
  // count trialDays forward from checkout.
  const firstCharge =
    trialDays > 0
      ? new Date(Date.now() + trialDays * 86_400_000).toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

  return (
    <div className="auth-screen">
      <section className="panel welcome-card">
        <div className="brand welcome-brand">
          <img className="logo-img" src="/logo-mark.png" alt="NestWise" />
          <h1>
            <span className="wm-nest">Nest</span>
            <span className="wm-wise">Wise</span>
          </h1>
        </div>

        <h2>{t('Welcome to NestWise')}</h2>
        <p className="muted small welcome-lead">
          {trialLabel
            ? firstCharge
              ? `${t('Start with')} ${trialLabel}. ${t('No charge until')} ${firstCharge}.`
              : `${t('Start with')} ${trialLabel}.`
            : t('Unlock automatic bank sync and household retirement planning.')}
        </p>

        {error && <div className="banner error">{error}</div>}

        {plans === null ? (
          <p className="muted small">{t('Loading…')}</p>
        ) : plans.length === 0 ? (
          // Nothing purchasable (price ids not set yet) — don't strand them here.
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

        <button type="button" className="link-btn welcome-skip" onClick={onDone} disabled={busy}>
          {t('Maybe later')} →
        </button>

        <p className="muted auth-fineprint">
          {trialLabel
            ? t('You can upgrade any time from Settings. Cancel during the trial and you pay nothing.')
            : t('You can upgrade any time from Settings.')}
        </p>
      </section>
    </div>
  );
}
