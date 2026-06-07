import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Summary, Budget } from '../types';
import { usd } from '../format';
import { useLang } from '../prefs';

// Monthly income/expenses are pre-filled from the household budget (Budget tab),
// current savings from net worth. Tweaking any field re-computes advice live.
export default function Advice({ summary, budget }: { summary: Summary; budget: Budget }) {
  const { t, lang } = useLang();
  const [monthlyIncome, setMonthlyIncome] = useState(Math.round(budget.monthlyIncome));
  const [monthlyExpenses, setMonthlyExpenses] = useState(Math.round(budget.monthlyExpenses));
  const [currentSavings, setCurrentSavings] = useState(Math.round(summary.netWorth));

  const advice = useQuery(api.planning.savingsAdvice, {
    monthlyIncome,
    monthlyExpenses,
    currentSavings,
    lang,
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
          </section>

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
