import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Account, Summary, Budget, RetirementPlan } from '../types';
import { usd } from '../format';
import { chartColorFor, capitalize, CHART_CATEGORY_ORDER } from '../categories';
import { ACCOUNT_TYPE_LABEL } from '../accountTypes';
import { useLang, useTheme } from '../prefs';
import { timeGreeting, displayName } from '../greeting';
import SpendingTrends from './SpendingTrends';

// Maps the budget status to a status key (translated at render) and an icon.
const STATUS_META: Record<string, { label: string; icon: string }> = {
  good: { label: 'On track', icon: '✅' },
  attention: { label: 'Needs attention', icon: '⚠️' },
  shortfall: { label: 'Shortfall', icon: '🔴' },
  setup: { label: 'Set up your budget', icon: '🪺' },
};

// The signed-in counterpart to the sign-in screen's greeting: someone with a
// live session never sees that page, so they get welcomed here instead.
function Greeting() {
  const { t, lang } = useLang();
  const user = useQuery(api.users.current);
  // The name they set in Settings wins; otherwise fall back to one derived from
  // their email. Undefined while the query is in flight — render the greeting
  // anyway rather than popping the name in a frame later and shifting the page.
  const name = user === undefined ? null : user?.name?.trim() || displayName(user?.email);

  const today = new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <section className="dash-greeting">
      <h2>
        {timeGreeting(t)}
        {name ? `, ${name}` : ''} 👋
      </h2>
      <p className="muted small">
        {today} · {t('here’s where your money stands today.')}
      </p>
    </section>
  );
}

export default function Dashboard({
  summary,
  accounts,
}: {
  summary: Summary | null;
  accounts: Account[];
}) {
  const { t, lang } = useLang();
  const budget = useQuery(api.budget.get, { lang });
  const plans = useQuery(api.retirement.listPlans);

  if (!summary) return <p className="muted">{t('Loading…')}</p>;

  const categories = budget?.byCategory ?? [];

  return (
    <div className="grid">
      <Greeting />
      {budget && <SurplusPanel budget={budget} />}

      <section className="cards">
        <StatCard label={t('Net worth')} value={usd(summary.netWorth)} accent="gold" />
        <StatCard
          label={t('Monthly income')}
          value={budget ? usd(budget.monthlyIncome) : '—'}
          accent="green"
        />
        <StatCard
          label={t('Monthly expenses')}
          value={budget ? usd(budget.monthlyExpenses) : '—'}
          accent="red"
        />
        <StatCard
          label={t('Monthly net')}
          value={budget ? usd(budget.surplus) : '—'}
          accent={!budget || budget.surplus >= 0 ? 'green' : 'red'}
        />
      </section>

      {plans !== undefined && plans.length === 0 && (
        <section className="panel">
          <h2>{t('Retirement outlook')}</h2>
          <p className="muted">
            {t('Set up your plan in the Retirement tab to see your projected nest egg here.')}
          </p>
        </section>
      )}
      {plans && plans.length > 0 && budget && (
        <RetirementOutlook
          plans={plans}
          netWorth={summary.netWorth}
          surplus={Math.max(0, budget.surplus)}
        />
      )}

      <section className="panel">
        <h2>{t('Accounts')}</h2>
        <ul className="account-list">
          {accounts.map((a) => {
            const gain =
              a.contributed != null && a.contributed > 0 ? a.balance - a.contributed : null;
            return (
              <li key={a._id}>
                <span className={`pill ${a.type}`}>
                  {t(ACCOUNT_TYPE_LABEL[a.type] ?? capitalize(a.type))}
                </span>
                <span className="acct-name">{a.name}</span>
                {gain !== null && (
                  <span className={`acct-gain ${gain >= 0 ? 'pos' : 'neg'}`}>
                    {gain >= 0 ? '+' : ''}
                    {((gain / a.contributed!) * 100).toFixed(1)}%
                  </span>
                )}
                <span className="acct-balance">{usd(a.balance)}</span>
              </li>
            );
          })}
          {accounts.length === 0 && <li className="muted">{t('No accounts yet.')}</li>}
        </ul>
      </section>

      <section className="panel">
        <h2>{t('Monthly spending by category')}</h2>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
          {t('Recurring expenses plus this month’s one-off transactions.')}
        </p>
        {categories.length === 0 ? (
          <p className="muted">{t('No expenses recorded.')}</p>
        ) : (
          <CategoryPie categories={categories} />
        )}
      </section>

      <SpendingTrends />
    </div>
  );
}

// Spending by category is a part-to-whole reading, so it's drawn as a donut: the
// ring carries each category's share, the hole carries the total. Slices follow
// CHART_CATEGORY_ORDER rather than descending value — the same reason the grouped
// bars do. Sorting by amount would let two near-identical hues land side by side
// as the month's numbers move; the fixed ring keeps every neighbouring pair (and
// the last→first wrap) clear of each other in both themes.
function CategoryPie({ categories }: { categories: { category: string; total: number }[] }) {
  const { t } = useLang();
  const { theme } = useTheme();
  const [active, setActive] = useState<string | null>(null);

  const slices = [...categories].sort(
    (a, b) => ringIndex(a.category) - ringIndex(b.category)
  );
  const sum = slices.reduce((acc, c) => acc + c.total, 0);
  if (sum <= 0) return <p className="muted">{t('No expenses recorded.')}</p>;

  const R = 76;
  const CIRC = 2 * Math.PI * R;
  // A 3-unit gap of bare surface between neighbouring arcs so two slices never
  // touch. A lone category is a full ring — a gap there reads as a stray notch.
  const gap = slices.length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = slices.map((c) => {
    const share = c.total / sum;
    const len = share * CIRC;
    const arc = { ...c, share, len: Math.max(len - gap, 1), offset };
    offset += len;
    return arc;
  });

  const shown = active ? arcs.find((a) => a.category === active) : undefined;

  return (
    <div className="pie-chart">
      <div className="pie-plot">
        <svg viewBox="0 0 200 200" className="pie-svg" role="img" aria-label={
          `${t('Monthly spending by category')}: ` +
          arcs
            .map((a) => `${t(capitalize(a.category))} ${usd(a.total)}`)
            .join(', ')
        }>
          <g transform="rotate(-90 100 100)">
            {arcs.map((a) => (
              <circle
                key={a.category}
                className={`pie-slice${active && active !== a.category ? ' dim' : ''}`}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={chartColorFor(a.category, theme)}
                strokeWidth={active === a.category ? 32 : 26}
                strokeDasharray={`${a.len} ${CIRC - a.len}`}
                strokeDashoffset={-a.offset}
                onMouseEnter={() => setActive(a.category)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${t(capitalize(a.category))}: ${usd(a.total)} · ${pct(a.share)}`}</title>
              </circle>
            ))}
          </g>
        </svg>
        {/* The hole is the readout: the total at rest, the hovered slice on hover,
            so a share never has to be judged from the angle alone. */}
        <div className="pie-center">
          <span className="pie-center-value">{usd(shown ? shown.total : sum)}</span>
          <span className="pie-center-label">
            {shown ? `${t(capitalize(shown.category))} · ${pct(shown.share)}` : t('Total spending')}
          </span>
        </div>
      </div>

      {/* Legend doubles as the table view: identity is never colour alone, and it
          carries the amounts the bar labels used to show. */}
      <ul className="grouped-legend pie-legend">
        {arcs.map((a) => (
          <li
            key={a.category}
            className={active === a.category ? 'active' : ''}
            onMouseEnter={() => setActive(a.category)}
            onMouseLeave={() => setActive(null)}
          >
            <span
              className="legend-swatch"
              style={{ background: chartColorFor(a.category, theme) }}
            />
            <span className="legend-name">{t(capitalize(a.category))}</span>
            <span className="legend-latest">{usd(a.total)}</span>
            <span className="legend-share muted">{pct(a.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const pct = (share: number) => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;

// Unmapped categories keep their relative order after the known ones.
const ringIndex = (category: string) => {
  const i = CHART_CATEGORY_ORDER.indexOf(category.toLowerCase());
  return i === -1 ? CHART_CATEGORY_ORDER.length : i;
};

function SurplusPanel({ budget }: { budget: Budget }) {
  const { t } = useLang();
  const meta = STATUS_META[budget.status] ?? STATUS_META.setup;
  const isShortfall = budget.surplus < 0;
  const headline =
    budget.status === 'setup'
      ? t('No household income yet')
      : `${t(isShortfall ? 'Shortfall' : 'Surplus')} ${usd(Math.abs(budget.surplus))}/${t('mo')}`;

  return (
    <section className={`surplus-panel ${budget.status}`}>
      <div className="surplus-head">
        <div className="surplus-headline">
          <span className="surplus-icon">{meta.icon}</span>
          <div>
            <span className="surplus-title">{headline}</span>
            {budget.status !== 'setup' && (
              <span className="surplus-sub">
                {usd(budget.monthlyIncome)} {t('income')} − {usd(budget.monthlyExpenses)}{' '}
                {t('expenses')} · {(budget.savingsRate * 100).toFixed(0)}% {t('saved')}
              </span>
            )}
          </div>
        </div>
        <span className="surplus-badge">{t(meta.label)}</span>
      </div>
      <ul className="surplus-tips">
        {budget.tips.map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ul>
      <span className="surplus-hint">{t('Manage income & expenses in the Budget tab →')}</span>
    </section>
  );
}

function RetirementOutlook({
  plans,
  netWorth,
  surplus,
}: {
  plans: RetirementPlan[];
  netWorth: number;
  surplus: number;
}) {
  const { t } = useLang();
  // Mirror the Retirement tab: a lone plan with blank figures falls back to live
  // net worth / surplus; with several plans each holds its own numbers.
  const isOnly = plans.length === 1;
  const inputs = plans.map((p, i) => ({
    currentAge: p.currentAge,
    retirementAge: p.retirementAge,
    currentSavings: p.currentSavings ?? (isOnly && i === 0 ? netWorth : 0),
    monthlyContribution: p.monthlyContribution ?? (isOnly && i === 0 ? surplus : 0),
    annualReturn: p.annualReturn,
    annualInflation: p.annualInflation,
  }));
  const household = useQuery(api.planning.projectHousehold, { plans: inputs });
  if (!household) return null;

  const years =
    household.minYears === household.maxYears
      ? `${household.minYears}`
      : `${household.minYears}–${household.maxYears}`;
  const monthlyContribution = inputs.reduce((acc, p) => acc + p.monthlyContribution, 0);
  const nestEggLabel =
    plans.length > 1 ? t('Combined nest egg') : t('Projected nest egg');

  return (
    <section className="panel">
      <h2>{t('Retirement outlook')}</h2>
      <div className="cards">
        <StatCard label={nestEggLabel} value={usd(household.futureValue)} accent="gold" />
        <StatCard label={t("In today's dollars")} value={usd(household.realValue)} accent="green" />
        <StatCard label={t('Years to retirement')} value={years} accent="slate" />
        <StatCard
          label={t('Sustainable income')}
          value={`${usd(household.sustainableMonthlyIncome)}/${t('mo')}`}
          accent="green"
        />
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        {plans.length > 1
          ? `${plans.length} ${t('plans')} · ${usd(monthlyContribution)}/${t('mo')} ${t('contributed')}`
          : `${usd(monthlyContribution)}/${t('mo')} ${t('contributed')}`}
        <br />
        {t('Live from your current figures — adjust assumptions in the Retirement tab.')}
      </p>
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className={`stat-card ${accent}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
