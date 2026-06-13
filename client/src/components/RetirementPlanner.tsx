import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { RetirementPlan, RetirementResult, HouseholdResult, Id } from '../types';
import { usd, usdCompact } from '../format';
import { niceTicks } from '../chart';
import { useLang } from '../prefs';

type Args = {
  label: string;
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturn: number; // percent in the form (e.g. 6)
  annualInflation: number; // percent in the form (e.g. 2.5)
};

// Positional default name for an unnamed plan: first is "You", second "Spouse",
// then "Plan 3", "Plan 4"… Translated at render time.
function defaultName(index: number): string {
  if (index === 0) return 'You';
  if (index === 1) return 'Spouse';
  return `Plan ${index + 1}`;
}

export default function RetirementPlanner({
  plans,
  netWorth,
  suggestedContribution,
}: {
  plans: RetirementPlan[];
  netWorth: number;
  suggestedContribution: number;
}) {
  const { t } = useLang();
  const savePlan = useMutation(api.retirement.savePlan);
  const removePlan = useMutation(api.retirement.removePlan);
  const [busy, setBusy] = useState(false);

  const hasPlans = plans.length > 0;
  // A lone plan with blank savings/contribution falls back to live net worth /
  // budget surplus (legacy behavior). Once there are several plans, each must
  // hold its own figures — otherwise the household total double-counts.
  const isOnly = plans.length === 1;
  const fallbackSavings = (i: number) => (i === 0 ? Math.round(netWorth) : 0);
  const fallbackContribution = (i: number) => (i === 0 ? suggestedContribution : 0);

  // Combined household roll-up, computed from the *saved* plans (so it matches
  // the dashboard). Reflects the last save, not unsaved edits in the columns.
  const householdInputs = plans.map((p, i) => ({
    currentAge: p.currentAge,
    retirementAge: p.retirementAge,
    currentSavings: p.currentSavings ?? (isOnly ? fallbackSavings(i) : 0),
    monthlyContribution: p.monthlyContribution ?? (isOnly ? fallbackContribution(i) : 0),
    annualReturn: p.annualReturn,
    annualInflation: p.annualInflation,
  }));
  const household = useQuery(api.planning.projectHousehold, { plans: householdInputs });

  async function addPlan() {
    setBusy(true);
    try {
      await savePlan({
        label: defaultName(plans.length),
        currentAge: 30,
        retirementAge: 65,
        annualReturn: 0.06,
        annualInflation: 0.025,
        currentSavings: 0,
        monthlyContribution: 0,
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: Id<'retirementPlan'>) {
    setBusy(true);
    try {
      await removePlan({ id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>{t('Retirement planner')}</h2>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
          {t(
            'Track a plan for each person (e.g. you and your spouse). Saving stores every field — the dashboard outlook uses the combined household total.'
          )}
        </p>
        <button type="button" onClick={addPlan} disabled={busy}>
          {t('+ Add plan')}
        </button>
      </section>

      {hasPlans && plans.length > 1 && household && <CombinedSummary household={household} />}

      <div className="planner-plans">
        {hasPlans ? (
          plans.map((p, i) => (
            <PlanColumn
              key={p._id}
              plan={p}
              defaultLabel={defaultName(i)}
              fallbackSavings={p.currentSavings ?? (isOnly ? fallbackSavings(i) : 0)}
              fallbackContribution={p.monthlyContribution ?? (isOnly ? fallbackContribution(i) : 0)}
              canRemove={plans.length > 1}
              onRemove={() => remove(p._id)}
            />
          ))
        ) : (
          // No saved plans yet — show one editable draft pre-filled from live
          // figures; saving it creates the first plan.
          <PlanColumn
            key="draft"
            plan={null}
            defaultLabel={defaultName(0)}
            fallbackSavings={Math.round(netWorth)}
            fallbackContribution={suggestedContribution}
            canRemove={false}
            onRemove={() => {}}
          />
        )}
      </div>
    </div>
  );
}

function PlanColumn({
  plan,
  defaultLabel,
  fallbackSavings,
  fallbackContribution,
  canRemove,
  onRemove,
}: {
  plan: RetirementPlan | null;
  defaultLabel: string;
  fallbackSavings: number;
  fallbackContribution: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { t } = useLang();
  const savePlan = useMutation(api.retirement.savePlan);
  const renamePlan = useMutation(api.retirement.renamePlan);

  const initial: Args = {
    label: plan?.label ?? t(defaultLabel),
    currentAge: plan?.currentAge ?? 30,
    retirementAge: plan?.retirementAge ?? 65,
    currentSavings: plan?.currentSavings ?? fallbackSavings,
    monthlyContribution: plan?.monthlyContribution ?? fallbackContribution,
    annualReturn: plan ? plan.annualReturn * 100 : 6,
    annualInflation: plan ? plan.annualInflation * 100 : 2.5,
  };

  const [form, setForm] = useState<Args>(initial);
  // Show results immediately for an already-saved plan.
  const [submitted, setSubmitted] = useState<Args | null>(plan ? initial : null);

  const result = useQuery(
    api.planning.projectRetirement,
    submitted
      ? {
          currentAge: submitted.currentAge,
          retirementAge: submitted.retirementAge,
          currentSavings: submitted.currentSavings,
          monthlyContribution: submitted.monthlyContribution,
          annualReturn: submitted.annualReturn / 100,
          annualInflation: submitted.annualInflation / 100,
        }
      : 'skip'
  );

  function set<K extends keyof Args>(key: K, value: Args[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function project(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(form);
    savePlan({
      id: plan?._id,
      label: form.label.trim() || t(defaultLabel),
      currentAge: form.currentAge,
      retirementAge: form.retirementAge,
      annualReturn: form.annualReturn / 100,
      annualInflation: form.annualInflation / 100,
      currentSavings: form.currentSavings,
      monthlyContribution: form.monthlyContribution,
    });
  }

  const busy = submitted !== null && result === undefined;

  // Persist a name change on its own as soon as the field loses focus, so the
  // user doesn't have to re-project just to rename a plan. Only for saved plans
  // (a draft's name is stored when it's first saved via Save & project).
  function commitName() {
    const label = form.label.trim() || t(defaultLabel);
    if (label !== form.label) set('label', label);
    if (plan && label !== plan.label) renamePlan({ id: plan._id, label });
  }

  return (
    <section className="panel plan-col">
      <div className="plan-col-head">
        <input
          className="plan-name"
          value={form.label}
          placeholder={t('Plan name')}
          aria-label={t('Plan name')}
          title={t('Click to rename — e.g. your spouse’s name')}
          onChange={(e) => set('label', e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {canRemove && (
          <button className="link-btn" title={t('Remove plan')} onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
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

      {result && (
        <>
          <div className="cards">
            <Stat label={t('Nest egg at retirement')} value={usd(result.futureValue)} accent="gold" />
            <Stat label={t("In today's dollars")} value={usd(result.realValue)} accent="green" />
            <Stat
              label={t('Sustainable income')}
              value={`${usd(result.sustainableMonthlyIncome)}/${t('mo')}`}
              accent="green"
            />
          </div>
          <GrowthChart result={result} />
        </>
      )}
    </section>
  );
}

function CombinedSummary({ household }: { household: HouseholdResult }) {
  const { t } = useLang();
  const years =
    household.minYears === household.maxYears
      ? `${household.minYears}`
      : `${household.minYears}–${household.maxYears}`;
  return (
    <section className="panel">
      <h2>{t('Combined household')}</h2>
      <div className="cards">
        <Stat label={t('Combined nest egg')} value={usd(household.futureValue)} accent="gold" />
        <Stat label={t("In today's dollars")} value={usd(household.realValue)} accent="green" />
        <Stat
          label={t('Combined sustainable income')}
          value={`${usd(household.sustainableMonthlyIncome)}/${t('mo')}`}
          accent="green"
        />
        <Stat label={t('Years to retirement')} value={years} accent="slate" />
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        {t('Sum across all plans. The dashboard outlook shows this combined total.')}
      </p>
    </section>
  );
}

function GrowthChart({ result }: { result: RetirementResult }) {
  const { t } = useLang();
  // Thin the yearly series to a readable number of bars, then build shared axes.
  const points = result.series.filter(
    (_, i) => i % Math.ceil(result.series.length / 24 || 1) === 0
  );
  const { axisMax, ticks } = niceTicks(Math.max(0, ...points.map((p) => p.balance)));
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  // SVG geometry (viewBox 0 0 n 100): x = bar center, y = 0 at top.
  const x = (i: number) => i + 0.5;
  const y = (val: number) => 100 - (val / axisMax) * 100;
  const linePoints = points.map((p, i) => `${x(i)},${y(p.contributed)}`).join(' ');
  // Closed area: along balance (bar tops) L→R, then back along contributed R→L.
  const areaPoints = [
    ...points.map((p, i) => `${x(i)},${y(p.balance)}`),
    ...points.map((p, i) => `${x(i)},${y(p.contributed)}`).reverse(),
  ].join(' ');

  return (
    <div style={{ marginTop: 12 }}>
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
          {ticks.map((tk) => (
            <div className="gridline" key={tk} style={{ bottom: `${(tk / axisMax) * 100}%` }}>
              <span className="ytick-label">{usdCompact(tk)}</span>
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
                <div className="bar-fill grow" style={{ height: `${(p.balance / axisMax) * 100}%` }} />
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
