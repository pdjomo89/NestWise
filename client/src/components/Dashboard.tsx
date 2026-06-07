import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Account, Summary, Budget, RetirementPlan } from '../types';
import { usd, usdCompact } from '../format';
import { niceTicks } from '../chart';
import { colorFor, capitalize } from '../categories';
import { ACCOUNT_TYPE_LABEL } from '../accountTypes';
import { useLang } from '../prefs';

// Maps the budget status to a status key (translated at render) and an icon.
const STATUS_META: Record<string, { label: string; icon: string }> = {
  good: { label: 'On track', icon: '✅' },
  attention: { label: 'Needs attention', icon: '⚠️' },
  shortfall: { label: 'Shortfall', icon: '🔴' },
  setup: { label: 'Set up your budget', icon: '🪺' },
};

export default function Dashboard({
  summary,
  accounts,
}: {
  summary: Summary | null;
  accounts: Account[];
}) {
  const { t, lang } = useLang();
  const budget = useQuery(api.budget.get, { lang });
  const plan = useQuery(api.retirement.getPlan);

  if (!summary) return <p className="muted">{t('Loading…')}</p>;

  const categories = budget?.byCategory ?? [];
  const rawMax = Math.max(0, ...categories.map((c) => c.total));
  const { axisMax, ticks } = niceTicks(rawMax);

  return (
    <div className="grid">
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

      {plan === null && (
        <section className="panel">
          <h2>{t('Retirement outlook')}</h2>
          <p className="muted">
            {t('Set up your plan in the Retirement tab to see your projected nest egg here.')}
          </p>
        </section>
      )}
      {plan && budget && (
        <RetirementOutlook
          plan={plan}
          currentSavings={plan.currentSavings ?? summary.netWorth}
          monthlyContribution={plan.monthlyContribution ?? Math.max(0, budget.surplus)}
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
          <div className="bar-chart">
            <div className="bar-chart-plot">
              {ticks.map((tv) => (
                <div className="gridline" key={tv} style={{ bottom: `${(tv / axisMax) * 100}%` }}>
                  <span className="ytick-label">{usdCompact(tv)}</span>
                </div>
              ))}
              <div className="bar-row">
                {categories.map((c) => (
                  <div
                    className="bar-col"
                    key={c.category}
                    title={`${t(capitalize(c.category))}: ${usd(c.total)}`}
                  >
                    <div
                      className="bar-fill"
                      style={{
                        height: `${(c.total / axisMax) * 100}%`,
                        background: colorFor(c.category),
                      }}
                    >
                      <span className="bar-amount">{usd(c.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bar-xaxis">
              {categories.map((c) => (
                <span
                  className="xtick-label cat"
                  key={c.category}
                  style={{ color: colorFor(c.category) }}
                >
                  {t(capitalize(c.category))}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

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
  plan,
  currentSavings,
  monthlyContribution,
}: {
  plan: RetirementPlan;
  currentSavings: number;
  monthlyContribution: number;
}) {
  const { t } = useLang();
  const projection = useQuery(api.planning.projectRetirement, {
    currentAge: plan.currentAge,
    retirementAge: plan.retirementAge,
    currentSavings,
    monthlyContribution,
    annualReturn: plan.annualReturn,
    annualInflation: plan.annualInflation,
  });
  if (!projection) return null;

  return (
    <section className="panel">
      <h2>{t('Retirement outlook')}</h2>
      <div className="cards">
        <StatCard
          label={`${t('Projected nest egg at')} ${plan.retirementAge}`}
          value={usd(projection.futureValue)}
          accent="gold"
        />
        <StatCard label={t("In today's dollars")} value={usd(projection.realValue)} accent="green" />
        <StatCard label={t('Years to retirement')} value={`${projection.years}`} accent="slate" />
        <StatCard
          label={t('Sustainable income')}
          value={`${usd(projection.sustainableMonthlyIncome)}/${t('mo')}`}
          accent="green"
        />
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        {usd(currentSavings)} {t('net worth')} · {usd(monthlyContribution)}/{t('mo')} ·{' '}
        {(plan.annualReturn * 100).toFixed(1)}%
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
