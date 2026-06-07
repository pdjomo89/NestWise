import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { RetirementPlan } from '../types';
import { usd, usdCompact } from '../format';
import { niceTicks } from '../chart';
import { useLang } from '../prefs';

type Args = {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturn: number; // percent in the form (e.g. 6)
  annualInflation: number; // percent in the form (e.g. 2.5)
};

export default function RetirementPlanner({
  plan,
  currentSavings,
  suggestedContribution,
}: {
  plan: RetirementPlan | null;
  currentSavings: number;
  suggestedContribution: number;
}) {
  const { t } = useLang();
  const savePlan = useMutation(api.retirement.savePlan);

  // Everything comes from the saved plan when present. Current savings and
  // contribution fall back to live net worth / budget surplus only the first
  // time (before anything is saved).
  const initial: Args = {
    currentAge: plan?.currentAge ?? 30,
    retirementAge: plan?.retirementAge ?? 65,
    currentSavings: plan?.currentSavings ?? Math.round(currentSavings),
    monthlyContribution: plan?.monthlyContribution ?? suggestedContribution,
    annualReturn: plan ? plan.annualReturn * 100 : 6,
    annualInflation: plan ? plan.annualInflation * 100 : 2.5,
  };

  const [form, setForm] = useState<Args>(initial);
  // Show results immediately if a plan is already saved.
  const [submitted, setSubmitted] = useState<Args | null>(plan ? initial : null);

  const result = useQuery(
    api.planning.projectRetirement,
    submitted
      ? {
          ...submitted,
          annualReturn: submitted.annualReturn / 100,
          annualInflation: submitted.annualInflation / 100,
        }
      : 'skip'
  );

  function set<K extends keyof Args>(key: K, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function project(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(form);
    // Persist the full plan so every field — including current savings and
    // monthly contribution — survives reloads and drives the dashboard outlook.
    savePlan({
      currentAge: form.currentAge,
      retirementAge: form.retirementAge,
      annualReturn: form.annualReturn / 100,
      annualInflation: form.annualInflation / 100,
      currentSavings: form.currentSavings,
      monthlyContribution: form.monthlyContribution,
    });
  }

  const busy = submitted !== null && result === undefined;

  // Thin the yearly series to a readable number of bars, then build shared axes.
  const points = result
    ? result.series.filter(
        (_, i) => i % Math.ceil(result.series.length / 24 || 1) === 0
      )
    : [];
  const { axisMax, ticks } = niceTicks(Math.max(0, ...points.map((p) => p.balance)));
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  // SVG geometry (viewBox 0 0 n 100): x = bar center, y = 0 at top.
  const x = (i: number) => i + 0.5;
  const y = (v: number) => 100 - (v / axisMax) * 100;
  const linePoints = points.map((p, i) => `${x(i)},${y(p.contributed)}`).join(' ');
  // Closed area: along balance (bar tops) L→R, then back along contributed R→L.
  const areaPoints = [
    ...points.map((p, i) => `${x(i)},${y(p.balance)}`),
    ...points.map((p, i) => `${x(i)},${y(p.contributed)}`).reverse(),
  ].join(' ');

  return (
    <div className="grid">
      <section className="panel">
        <h2>{t('Retirement planner')}</h2>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
          {t(
            'Pre-filled from your net worth and budget surplus. Saving stores every field — including current savings and contribution — and the dashboard outlook uses what you save here.'
          )}
        </p>
        <form className="planner-form" onSubmit={project}>
          <Field label={t('Current age')}>
            <input
              type="number"
              value={form.currentAge}
              onChange={(e) => set('currentAge', Number(e.target.value))}
            />
          </Field>
          <Field label={t('Retirement age')}>
            <input
              type="number"
              value={form.retirementAge}
              onChange={(e) => set('retirementAge', Number(e.target.value))}
            />
          </Field>
          <Field label={t('Current savings ($)')}>
            <input
              type="number"
              value={form.currentSavings}
              onChange={(e) => set('currentSavings', Number(e.target.value))}
            />
          </Field>
          <Field label={t('Monthly contribution ($)')}>
            <input
              type="number"
              value={form.monthlyContribution}
              onChange={(e) => set('monthlyContribution', Number(e.target.value))}
            />
          </Field>
          <Field label={t('Annual return (%)')}>
            <input
              type="number"
              step="0.1"
              value={form.annualReturn}
              onChange={(e) => set('annualReturn', Number(e.target.value))}
            />
          </Field>
          <Field label={t('Inflation (%)')}>
            <input
              type="number"
              step="0.1"
              value={form.annualInflation}
              onChange={(e) => set('annualInflation', Number(e.target.value))}
            />
          </Field>
          <button type="submit" disabled={busy}>
            {busy ? t('Projecting…') : t('Save & project')}
          </button>
        </form>
      </section>

      {result && (
        <>
          <section className="cards">
            <Stat label={t('Nest egg at retirement')} value={usd(result.futureValue)} accent="gold" />
            <Stat label={t("In today's dollars")} value={usd(result.realValue)} accent="green" />
            <Stat label={t('Total contributed')} value={usd(result.totalContributed)} accent="slate" />
            <Stat label={t('Investment growth')} value={usd(result.totalGrowth)} accent="green" />
          </section>

          <section className="panel">
            <h2>{t('Sustainable retirement income')}</h2>
            <p className="lead">
              {t('Using the 4% rule, you could withdraw about')}{' '}
              <strong>
                {usd(result.sustainableAnnualIncome)}/{t('yr')}
              </strong>{' '}
              ({usd(result.sustainableMonthlyIncome)}/{t('mo')}) {t('without depleting your savings.')}
            </p>
          </section>

          <section className="panel">
            <h2>{t('Growth over time')}</h2>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="swatch bar" /> {t('Balance')}
              </span>
              <span className="legend-item">
                <span className="swatch line" /> {t('Total contributed')}
              </span>
              <span className="legend-item">
                <span className="swatch area" /> {t('Growth')}
              </span>
            </div>
            <div className="bar-chart">
              <div className="bar-chart-plot">
                {ticks.map((t) => (
                  <div className="gridline" key={t} style={{ bottom: `${(t / axisMax) * 100}%` }}>
                    <span className="ytick-label">{usdCompact(t)}</span>
                  </div>
                ))}
                <div className="bar-row tight">
                  {points.map((p) => (
                    <div
                      className="bar-col"
                      key={p.age}
                      title={`Age ${Math.round(p.age)}: balance ${usd(p.balance)}, contributed ${usd(
                        p.contributed
                      )}`}
                    >
                      <div
                        className="bar-fill grow"
                        style={{ height: `${(p.balance / axisMax) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
                {/* Growth (shaded) between contributed line and balance bars. */}
                <svg
                  className="overlay-line"
                  viewBox={`0 0 ${points.length} 100`}
                  preserveAspectRatio="none"
                >
                  <polygon className="growth-area" points={areaPoints} />
                  <polyline vectorEffect="non-scaling-stroke" points={linePoints} />
                </svg>
              </div>
              <div className="bar-xaxis tight">
                {points.map((p, i) => (
                  <span className="xtick-label" key={p.age}>
                    {i % labelEvery === 0 ? Math.round(p.age) : ''}
                  </span>
                ))}
              </div>
            </div>
            <p className="muted small">{t('Projected balance by age')}</p>
          </section>
        </>
      )}
    </div>
  );
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
