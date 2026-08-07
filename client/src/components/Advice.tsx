import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Account, Summary, Budget } from '../types';
import { usd } from '../format';
import { isInvestmentType, isRetirementType } from '../accountTypes';
import { capitalize, colorFor } from '../categories';
import { useCountry, useLang } from '../prefs';

// Monthly income/expenses are pre-filled from the household budget (Budget tab),
// current savings from net worth. Tweaking any field re-computes advice live.
export default function Advice({
  summary,
  budget,
  accounts,
}: {
  summary: Summary;
  budget: Budget;
  accounts: Account[];
}) {
  const { t, lang } = useLang();
  const { country } = useCountry();
  const [monthlyIncome, setMonthlyIncome] = useState(Math.round(budget.monthlyIncome));
  const [monthlyExpenses, setMonthlyExpenses] = useState(Math.round(budget.monthlyExpenses));
  const [currentSavings, setCurrentSavings] = useState(Math.round(summary.netWorth));

  // Credit cards store a negative balance; sum their magnitude as money owed.
  const creditCardDebt = accounts
    .filter((a) => a.type === 'credit' && a.balance < 0)
    .reduce((s, a) => s - a.balance, 0);
  const cashReserves = accounts
    .filter((a) => a.type === 'checking' || a.type === 'savings')
    .reduce((s, a) => s + a.balance, 0);
  const investmentValue = accounts
    .filter((a) => isInvestmentType(a.type))
    .reduce((s, a) => s + a.balance, 0);
  // Every account type flagged as retirement savings, not just the US one —
  // otherwise a Canadian holding an RRSP and a TFSA is told they have no
  // retirement account at all.
  const retirementValue = accounts
    .filter((a) => isRetirementType(a.type))
    .reduce((s, a) => s + a.balance, 0);

  // Biggest expense category (excluding income), with a translated label.
  const topCat = budget.byCategory
    .filter((c) => c.category !== 'income')
    .reduce<{ category: string; total: number } | null>(
      (m, c) => (c.total > (m?.total ?? -Infinity) ? c : m),
      null
    );
  const topCategory = topCat
    ? { label: t(capitalize(topCat.category)), total: topCat.total }
    : undefined;

  // Live combined retirement projection across all plans (same roll-up as the
  // dashboard outlook) so advice can tell whether the household is on track.
  const plans = useQuery(api.retirement.listPlans);
  const isOnly = (plans?.length ?? 0) === 1;
  const projection = useQuery(
    api.planning.projectHousehold,
    plans
      ? {
          plans: plans.map((p, i) => ({
            currentAge: p.currentAge,
            retirementAge: p.retirementAge,
            currentSavings: p.currentSavings ?? (isOnly && i === 0 ? summary.netWorth : 0),
            monthlyContribution:
              p.monthlyContribution ?? (isOnly && i === 0 ? Math.max(0, budget.surplus) : 0),
            annualReturn: p.annualReturn,
            annualInflation: p.annualInflation,
          })),
        }
      : 'skip'
  );

  // The auto savings plan from the spending-trends engine — surfaced here so
  // the Advice tab shows how much overspend the user could realistically trim.
  const trends = useQuery(api.trends.get, { lang });
  const plan = trends?.plan;

  const advice = useQuery(api.planning.savingsAdvice, {
    monthlyIncome,
    monthlyExpenses,
    currentSavings,
    creditCardDebt,
    cashReserves,
    investmentValue,
    retirementValue,
    // Undefined when there are no plans yet, so advice falls back to the
    // "start saving for retirement" tip instead of "you're behind".
    retirementSustainableIncome:
      plans && plans.length > 0 ? projection?.sustainableMonthlyIncome : undefined,
    topCategory,
    lang,
    country,
  });

  return (
    <div className="grid">
      <section className="panel">
        <h2>{t('Your monthly money')}</h2>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
          {t('Pre-filled from your household budget — adjust any figure to explore.')}
        </p>
        <form className="planner-form" onSubmit={(e) => e.preventDefault()}>
          <Field label={t('Monthly income ($)')}>
            <input
              type="number"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(Number(e.target.value))}
            />
          </Field>
          <Field label={t('Monthly expenses ($)')}>
            <input
              type="number"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
            />
          </Field>
          <Field label={t('Current savings ($)')}>
            <input
              type="number"
              value={currentSavings}
              onChange={(e) => setCurrentSavings(Number(e.target.value))}
            />
          </Field>
        </form>
      </section>

      {advice && (
        <>
          <section className="cards">
            <Stat
              label={t('Monthly surplus')}
              value={usd(advice.surplus)}
              accent={advice.surplus >= 0 ? 'green' : 'red'}
            />
            <Stat
              label={t('Savings rate')}
              value={`${(advice.savingsRate * 100).toFixed(0)}%`}
              accent={advice.savingsRate >= 0.2 ? 'green' : 'slate'}
            />
            <Stat
              label={t('6-month emergency target')}
              value={usd(advice.emergencyTarget)}
              accent="gold"
            />
            {creditCardDebt > 0 && (
              <Stat label={t('Credit card debt')} value={usd(creditCardDebt)} accent="red" />
            )}
            {plan && plan.totalMonthly > 0 && (
              <Stat
                label={t('Potential monthly savings')}
                value={usd(plan.totalMonthly)}
                accent="green"
              />
            )}
          </section>

          {plan && plan.totalMonthly > 0 && (
            <section className="panel">
              <h2>{t('Trim your spending')}</h2>
              <p className="save-headline">
                {t('Trim')} <strong>{usd(plan.totalMonthly)}</strong>/{t('mo')}
                {plan.incomeShare > 0 && (
                  <span className="muted small">
                    {' '}
                    · {t('about')} {Math.round(plan.incomeShare * 100)}% {t('of income')}
                  </span>
                )}
              </p>
              <ul className="save-list">
                {plan.items.map((it) => (
                  <li key={it.category}>
                    <span className="save-cat" style={{ color: colorFor(it.category) }}>
                      {t(capitalize(it.category))}
                    </span>
                    <span className="muted small">
                      {usd(it.from)} → {usd(it.to)}
                    </span>
                    <span className="save-amt">
                      −{usd(it.save)}/{t('mo')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                {t('These categories are running above their recent average — see Spending trends on the Dashboard for the month-by-month view.')}
              </p>
            </section>
          )}

          <section className="panel">
            <h2>{t('Advice')}</h2>
            <ul className="tips">
              {advice.tips.map((tip, i) => (
                <li key={i} className={`tip ${tip.level}`}>
                  <span className="tip-icon">{iconFor(tip.level)}</span>
                  <div>
                    <strong>{tip.title}</strong>
                    <p>{tip.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function iconFor(level: string) {
  if (level === 'good') return '✅';
  if (level === 'urgent') return '⚠️';
  return '💡';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`stat-card ${accent}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
