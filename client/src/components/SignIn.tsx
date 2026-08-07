import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useLang } from '../prefs';
import { clearPendingPlan, clearWelcome, markNewSignUp, setPendingPlan } from '../onboarding';
import { timeGreeting } from '../greeting';
import PlanCards, { usePlanPicker, type PlanKey } from './PlanCards';

// Turn Convex Auth's raw errors into something friendly. The server returns
// "InvalidSecret" / "InvalidAccountId" style messages for bad credentials.
function friendlyError(e: unknown, flow: 'signUp' | 'signIn', t: (s: string) => string): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes('invalidsecret') || msg.includes('invalidaccountid')) {
    return flow === 'signIn'
      ? t('Wrong email or password.')
      : t('Could not create the account. The email may already be in use.');
  }
  if (msg.includes('already')) return t('That email is already registered. Try signing in.');
  return t('Something went wrong. Please try again.');
}

export default function SignIn() {
  const { t } = useLang();
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signUp' | 'signIn'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = "decide later". Undefined would mean "no choice made yet", which
  // this form doesn't need: starting on the trial is the intended default.
  const [plan, setPlan] = useState<PlanKey | null>('monthly');

  const isSignUp = flow === 'signUp';

  // Prices are public, so the picker works while signed out. `billing.pro` is
  // false for an anonymous caller, so plans load whenever Stripe is configured.
  const { plans, trialLabel, annualSavingPct, locale, billing } = usePlanPicker();
  const offering = isSignUp && Boolean(billing?.configured) && (plans?.length ?? 0) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || password.length < 8) {
      setError(t('Enter an email and a password of at least 8 characters.'));
      return;
    }
    setBusy(true);
    try {
      // Flag it before signing in: the provider flips to authenticated straight
      // away, and App reads this on its first authenticated render.
      if (isSignUp) {
        markNewSignUp();
        // Park the choice — this component unmounts the moment auth flips, so
        // it can't run checkout itself. Welcome picks it up and redirects.
        if (offering && plan) setPendingPlan(plan);
        else clearPendingPlan();
      }
      await signIn('password', { email, password, flow });
      // On success ConvexAuthProvider flips to authenticated and App swaps in.
    } catch (err) {
      // The account wasn't created, so don't leave the welcome step armed for
      // whoever signs in on this browser next.
      clearWelcome();
      clearPendingPlan();
      setError(friendlyError(err, flow, t));
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="panel auth-card">
        <div className="auth-brand">
          <img className="logo-img" src="/logo-mark.png" alt="NestWise" />
          <h1>
            <span className="wm-nest">Nest</span>
            <span className="wm-wise">Wise</span>
          </h1>
        </div>
        <p className="muted small auth-tagline">
          {t('Track finances · plan retirement · save smarter')}
        </p>

        <div className="auth-heading">
          <p className="auth-greeting">{timeGreeting(t)} 👋</p>
          <h2>{isSignUp ? t('Create your account') : t('Welcome back')}</h2>
          <p className="muted small auth-welcome">
            {isSignUp
              ? t('Welcome to NestWise — a few details and your money gets a lot clearer.')
              : t('Good to see you again. Everything is right where you left it.')}
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label">
            {t('Email')}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label className="auth-label">
            {t('Password')}
            <input
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('At least 8 characters')}
              required
            />
          </label>

          {offering && plans && (
            <div className="auth-plans">
              <p className="auth-plans-label">
                {trialLabel ? `${t('Choose your plan')} — ${trialLabel}` : t('Choose your plan')}
              </p>
              <PlanCards
                plans={plans}
                busy={busy}
                trialLabel={trialLabel}
                annualSavingPct={annualSavingPct}
                locale={locale}
                selected={plan}
                onSelect={setPlan}
              />
              <button
                type="button"
                className={`plan-free${plan === null ? ' selected' : ''}`}
                aria-pressed={plan === null}
                onClick={() => setPlan(null)}
                disabled={busy}
              >
                {t('Start free — decide later')}
              </button>
            </div>
          )}

          {error && <p className="auth-error small">{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy
              ? t('Working…')
              : !isSignUp
              ? t('Log in')
              : offering && plan
              ? trialLabel
                ? t('Create account & start free trial')
                : t('Create account & subscribe')
              : t('Sign up')}
          </button>

          {offering && plan && (
            <p className="muted auth-fineprint auth-plan-note">
              {trialLabel
                ? t('Next: Stripe takes your card. Nothing is charged until the trial ends.')
                : t('Next: secure payment with Stripe.')}
            </p>
          )}
        </form>

        <p className="muted small auth-switch">
          {isSignUp ? t('Already have an account?') : t('New to NestWise?')}{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setError(null);
              setFlow(isSignUp ? 'signIn' : 'signUp');
            }}
          >
            {isSignUp ? t('Log in') : t('Create one')}
          </button>
        </p>

        <p className="muted auth-fineprint">
          {t('Your data is private to your account. Educational projections only — not financial advice.')}
        </p>
      </section>
    </div>
  );
}
