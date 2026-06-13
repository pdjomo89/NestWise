import { useState } from 'react';
import { useQuery, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../convex/_generated/api';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import RetirementPlanner from './components/RetirementPlanner';
import Advice from './components/Advice';
import Budget from './components/Budget';
import Accounts from './components/Accounts';
import Settings from './components/Settings';
import SignIn from './components/SignIn';
import { useLang } from './prefs';

type Tab =
  | 'dashboard'
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
        <AppContent />
      </Authenticated>
    </>
  );
}

function AppContent() {
  // When Plaid redirects back from an OAuth bank login, the app reloads at the
  // root with an `oauth_state_id` query param. Start on the Accounts tab so
  // ConnectBank mounts and resumes the Link flow.
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.search).has('oauth_state_id')
      ? 'accounts'
      : 'dashboard'
  );
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
          ['dashboard', 'transactions', 'accounts', 'budget', 'retirement', 'advice'] as Tab[]
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
        {tab === 'accounts' && <Accounts accounts={accounts ?? []} />}
        {tab === 'settings' && <Settings />}
        {tab === 'budget' && <Budget />}
        {tab === 'retirement' &&
          (summary && budget && retirementPlans !== undefined ? (
            <RetirementPlanner
              plans={retirementPlans}
              netWorth={summary.netWorth}
              suggestedContribution={Math.max(0, Math.round(budget.surplus))}
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
