import { useEffect, useState } from 'react';
import { useQuery, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../convex/_generated/api';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import RetirementPlanner from './components/RetirementPlanner';
import Advice from './components/Advice';
import Coach from './components/Coach';
import Budget from './components/Budget';
import Accounts from './components/Accounts';
import Settings from './components/Settings';
import SignIn from './components/SignIn';
import Welcome from './components/Welcome';
import { useLang } from './prefs';
import { clearPendingPlan, clearWelcome, isNewSignUp } from './onboarding';

type Tab =
  | 'dashboard'
  | 'coach'
  | 'transactions'
  | 'accounts'
  | 'budget'
  | 'retirement'
  | 'advice'
  | 'settings';

// Auth gate: show a splash while resolving, the sign-in page when signed out,
// and the full app only when authenticated.
export default function App() {
  return (
    <>
      <AuthLoading>
        <div className="auth-screen">
          <p className="muted">Loading…</p>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <AuthedRoot />
      </Authenticated>
    </>
  );
}

// Sits between the auth gate and the app proper. A brand-new account gets the
// welcome/trial step first; everyone else goes straight to the dashboard.
function AuthedRoot() {
  const { t } = useLang();
  const billing = useQuery(api.stripe.status);
  const [welcome, setWelcome] = useState(isNewSignUp);

  function dismiss() {
    clearWelcome();
    clearPendingPlan();
    setWelcome(false);
  }

  // Nothing to offer — billing is dormant, or they subscribed on another
  // device before this render. Drop the flag instead of showing a dead screen.
  useEffect(() => {
    if (welcome && billing !== undefined && (!billing.configured || billing.pro)) dismiss();
  }, [welcome, billing]);

  // Back from Stripe having gone through with it. `pro` may not be true yet —
  // the webhook can lag, and in local dev it never arrives — so don't wait for
  // it: retire the welcome step and let Settings → Billing run `refresh`.
  // `cancelled` is deliberately absent: that returns to the offer above.
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('checkout');
    if (welcome && (outcome === 'success' || outcome === 'managed')) dismiss();
  }, [welcome]);

  if (welcome) {
    // Hold the splash rather than flashing the dashboard for the one frame
    // before we know whether there's a trial to offer.
    if (billing === undefined) {
      return (
        <div className="auth-screen">
          <p className="muted">{t('Loading…')}</p>
        </div>
      );
    }
    if (billing.configured && !billing.pro) return <Welcome onDone={dismiss} />;
  }

  return <AppContent />;
}

function AppContent() {
  // Two third-party redirects land back on the root URL and need a specific
  // tab mounted to pick the flow up:
  //   ?oauth_state_id=…  Plaid returning from an OAuth bank login → Accounts,
  //                      so ConnectBank resumes Link.
  //   ?checkout=…        Stripe returning from Checkout or the billing portal →
  //                      Settings, so Billing confirms the subscription.
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('oauth_state_id')) return 'accounts';
    if (params.has('checkout')) return 'settings';
    return 'dashboard';
  });
  const { t, lang } = useLang();

  // Reactive queries — these update automatically whenever a mutation runs.
  const summary = useQuery(api.summary.get);
  const accounts = useQuery(api.accounts.list);
  const transactions = useQuery(api.transactions.list);
  const budget = useQuery(api.budget.get, { lang });
  const retirementPlans = useQuery(api.retirement.listPlans);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo-img" src="/logo-mark.png" alt="NestWise" />
          <div>
            <h1>
              <span className="wm-nest">Nest</span>
              <span className="wm-wise">Wise</span>
            </h1>
            <p>{t('Track finances · plan retirement · save smarter')}</p>
          </div>
        </div>
        <div className="controls">
          <button
            className={tab === 'settings' ? 'toggle-btn active' : 'toggle-btn'}
            onClick={() => setTab('settings')}
            title={t('Settings')}
          >
            ⚙️ {t('Settings')}
          </button>
        </div>
      </header>

      <nav className="tabs">
        {(
          ['dashboard', 'coach', 'transactions', 'accounts', 'budget', 'retirement', 'advice'] as Tab[]
        ).map((tk) => (
          <button
            key={tk}
            className={tab === tk ? 'tab active' : 'tab'}
            onClick={() => setTab(tk)}
          >
            {t(tk[0].toUpperCase() + tk.slice(1))}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'dashboard' && (
          <Dashboard summary={summary ?? null} accounts={accounts ?? []} />
        )}
        {tab === 'transactions' && (
          <Transactions transactions={transactions ?? []} accounts={accounts ?? []} />
        )}
        {tab === 'coach' && <Coach onNavigate={(next) => setTab(next as Tab)} />}
        {tab === 'accounts' && <Accounts accounts={accounts ?? []} />}
        {tab === 'settings' && <Settings />}
        {tab === 'budget' && <Budget />}
        {tab === 'retirement' &&
          (summary && budget && retirementPlans !== undefined ? (
            <RetirementPlanner
              plans={retirementPlans}
              netWorth={summary.netWorth}
              suggestedContribution={Math.max(0, Math.round(budget.surplus))}
              accounts={accounts ?? []}
            />
          ) : (
            <p className="muted">{t('Loading…')}</p>
          ))}
        {tab === 'advice' &&
          (summary && budget ? (
            <Advice summary={summary} budget={budget} accounts={accounts ?? []} />
          ) : (
            <p className="muted">{t('Loading…')}</p>
          ))}
      </main>

      <footer className="footer">
        {t('NestWise · educational projections only, not financial advice')}
      </footer>
    </div>
  );
}
