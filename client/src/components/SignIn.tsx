import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useLang } from '../prefs';

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

  const isSignUp = flow === 'signUp';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || password.length < 8) {
      setError(t('Enter an email and a password of at least 8 characters.'));
      return;
    }
    setBusy(true);
    try {
      await signIn('password', { email, password, flow });
      // On success ConvexAuthProvider flips to authenticated and App swaps in.
    } catch (err) {
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

        <h2>{isSignUp ? t('Create your account') : t('Welcome back')}</h2>

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

          {error && <p className="auth-error small">{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy
              ? t('Working…')
              : isSignUp
              ? t('Sign up')
              : t('Log in')}
          </button>
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
