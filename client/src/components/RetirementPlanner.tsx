import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { RetirementPlan, RetirementResult, HouseholdResult, Account, Id } from '../types';
import { usd, usdCompact } from '../format';
import { niceTicks } from '../chart';
import { useLang, useCountry } from '../prefs';
import { taxMix } from '../accountTypes';
import ContributionRoom from './ContributionRoom';
import {
  CPP_LABEL,
  CPP_MAX_MONTHLY_AT_65,
  CPP_TYPICAL_MONTHLY_AT_65,
  OAS_MONTHLY_AT_65,
  REFERENCE_YEAR,
} from '../canada';

type Args = {
  label: string;
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturn: number; // percent in the form (e.g. 6)
  annualInflation: number; // percent in the form (e.g. 2.5)
  // Tax mix, as percentages in the form. The remainder after these two is the
  // taxable share (non-registered, brokerage, crypto, property).
  deferredShare: number; // RRSP/RRIF/LIRA/LIF/pension — taxed as income
  freeShare: number; // TFSA/FHSA — never taxed
  marginalTaxRate: number; // expected marginal rate in retirement
  // Government benefits, monthly in today's dollars at 65, plus when taken.
  cppMonthly: number;
  cppStartAge: number;
  oasMonthly: number;
  oasStartAge: number;
  rrifConversionAge: number;
};

// What a plan assumes about tax when the user has no accounts to derive it
// from: everything tax-deferred, i.e. the most tax the projection could owe.
// Planning against the pessimistic case beats being pleasantly surprised.
const FALLBACK_MIX = { deferredShare: 100, freeShare: 0 };

// Starting guess for the marginal rate in retirement. Canadian combined
// federal+provincial rates on a middle retirement income land near 30%; the US
// figure is a federal-bracket stand-in. Both are editable per plan.
const DEFAULT_MARGINAL_RATE: Record<'CA' | 'US', number> = { CA: 30, US: 22 };

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
  accounts,
}: {
  plans: RetirementPlan[];
  netWorth: number;
  suggestedContribution: number;
  accounts: Account[];
}) {
  const { t } = useLang();
  const { country } = useCountry();
  const savePlan = useMutation(api.retirement.savePlan);
  const removePlan = useMutation(api.retirement.removePlan);
  const [busy, setBusy] = useState(false);

  // The user's real split across tax treatments, used as each plan's default.
  // Rounded to a tenth so the form shows "66.7", not "66.66666666666666" — the
  // pair still sums to 100 because both round from the same total.
  const mix = taxMix(accounts);
  const round1 = (n: number) => Math.round(n * 1000) / 10;
  const defaultMix = mix
    ? { deferredShare: round1(mix.deferredShare), freeShare: round1(mix.freeShare) }
    : FALLBACK_MIX;

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
    deferredShare: p.deferredShare ?? defaultMix.deferredShare / 100,
    freeShare: p.freeShare ?? defaultMix.freeShare / 100,
    marginalTaxRate: p.marginalTaxRate ?? DEFAULT_MARGINAL_RATE[country] / 100,
    country,
    cppMonthly: p.cppMonthly ?? 0,
    cppStartAge: p.cppStartAge ?? 65,
    oasMonthly: p.oasMonthly ?? 0,
    oasStartAge: p.oasStartAge ?? 65,
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
        deferredShare: defaultMix.deferredShare / 100,
        freeShare: defaultMix.freeShare / 100,
        marginalTaxRate: DEFAULT_MARGINAL_RATE[country] / 100,
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

      {country === 'CA' && <ContributionRoom />}

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
              defaultMix={defaultMix}
              mixFromAccounts={mix !== null}
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
            defaultMix={defaultMix}
            mixFromAccounts={mix !== null}
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
  defaultMix,
  mixFromAccounts,
  canRemove,
  onRemove,
}: {
  plan: RetirementPlan | null;
  defaultLabel: string;
  fallbackSavings: number;
  fallbackContribution: number;
  defaultMix: { deferredShare: number; freeShare: number };
  mixFromAccounts: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { t } = useLang();
  const { country } = useCountry();
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
    deferredShare:
      plan?.deferredShare != null ? plan.deferredShare * 100 : defaultMix.deferredShare,
    freeShare: plan?.freeShare != null ? plan.freeShare * 100 : defaultMix.freeShare,
    marginalTaxRate:
      plan?.marginalTaxRate != null
        ? plan.marginalTaxRate * 100
        : DEFAULT_MARGINAL_RATE[country],
    // Default to the typical new CPP pension rather than the maximum: the
    // maximum assumes near-maximum contributions in almost every working year,
    // which most people don't reach, and over-stating it inflates the whole plan.
    cppMonthly: plan?.cppMonthly ?? (country === 'CA' ? CPP_TYPICAL_MONTHLY_AT_65 : 0),
    cppStartAge: plan?.cppStartAge ?? 65,
    oasMonthly: plan?.oasMonthly ?? (country === 'CA' ? OAS_MONTHLY_AT_65 : 0),
    oasStartAge: plan?.oasStartAge ?? 65,
    rrifConversionAge: plan?.rrifConversionAge ?? 71,
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
          deferredShare: submitted.deferredShare / 100,
          freeShare: submitted.freeShare / 100,
          marginalTaxRate: submitted.marginalTaxRate / 100,
          country,
          cppMonthly: submitted.cppMonthly,
          cppStartAge: submitted.cppStartAge,
          oasMonthly: submitted.oasMonthly,
          oasStartAge: submitted.oasStartAge,
          rrifConversionAge: submitted.rrifConversionAge,
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
      deferredShare: form.deferredShare / 100,
      freeShare: form.freeShare / 100,
      marginalTaxRate: form.marginalTaxRate / 100,
      cppMonthly: form.cppMonthly,
      cppStartAge: form.cppStartAge,
      oasMonthly: form.oasMonthly,
      oasStartAge: form.oasStartAge,
      rrifConversionAge: form.rrifConversionAge,
    });
  }

  // Whatever isn't tax-deferred or tax-free is held in a taxable account.
  const taxableShare = Math.max(0, 100 - form.deferredShare - form.freeShare);
  const sharesOverflow = form.deferredShare + form.freeShare > 100;

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

        <p className="plan-section-label">{t('How it’s taxed')}</p>
        <Field
          label={
            country === 'CA'
              ? t('Tax-deferred — RRSP, RRIF, LIRA, pension (%)')
              : t('Tax-deferred — 401(k), IRA (%)')
          }
        >
          {/* step must admit tenths: the default is derived from real account
              balances (e.g. 46.2), and a step mismatch silently blocks submit. */}
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.deferredShare}
            onChange={(e) => set('deferredShare', Number(e.target.value))}
          />
        </Field>
        <Field label={country === 'CA' ? t('Tax-free — TFSA, FHSA (%)') : t('Tax-free — Roth (%)')}>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.freeShare}
            onChange={(e) => set('freeShare', Number(e.target.value))}
          />
        </Field>
        <Field label={t('Marginal tax rate in retirement (%)')}>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.marginalTaxRate}
            onChange={(e) => set('marginalTaxRate', Number(e.target.value))}
          />
        </Field>
        <p className={`muted small${sharesOverflow ? ' plan-warn' : ''}`}>
          {sharesOverflow
            ? t('Tax-deferred and tax-free add up to more than 100%.')
            : `${t('The remaining')} ${Math.round(taxableShare)}% ${t(
                country === 'CA'
                  ? 'is treated as non-registered — only the gain is taxed, and only half of a capital gain counts as income.'
                  : 'is treated as a taxable account — only the gain is taxed.'
              )}${
                mixFromAccounts && !plan ? ` ${t('Starting split taken from your accounts.')}` : ''
              }`}
        </p>

        {country === 'CA' && (
          <>
            <p className="plan-section-label">{t('Government benefits')}</p>
            <Field label={`${t(CPP_LABEL)} ${t('at 65 ($/mo, today’s dollars)')}`}>
              <input
                type="number"
                step="1"
                min="0"
                max={CPP_MAX_MONTHLY_AT_65}
                value={form.cppMonthly}
                onChange={(e) => set('cppMonthly', Number(e.target.value))}
              />
            </Field>
            <Field label={`${t('Start')} ${t(CPP_LABEL)} ${t('at age')}`}>
              <input
                type="number"
                step="1"
                min="60"
                max="70"
                value={form.cppStartAge}
                onChange={(e) => set('cppStartAge', Number(e.target.value))}
              />
            </Field>
            <Field label={t('OAS at 65 ($/mo, today’s dollars)')}>
              <input
                type="number"
                step="1"
                min="0"
                value={form.oasMonthly}
                onChange={(e) => set('oasMonthly', Number(e.target.value))}
              />
            </Field>
            <Field label={t('Start OAS at age')}>
              <input
                type="number"
                step="1"
                min="65"
                max="70"
                value={form.oasStartAge}
                onChange={(e) => set('oasStartAge', Number(e.target.value))}
              />
            </Field>
            <Field label={t('Convert RRSP to a RRIF at age')}>
              <input
                type="number"
                step="1"
                min="55"
                max="71"
                value={form.rrifConversionAge}
                onChange={(e) => set('rrifConversionAge', Number(e.target.value))}
              />
            </Field>
            <p className="muted small">
              {`${t(
                'Taking it early permanently reduces it; deferring permanently increases it. Get your own estimate from your My Service Canada account — the amounts here are'
              )} ${REFERENCE_YEAR} ${t('averages, not your entitlement.')}`}
            </p>
          </>
        )}

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
            {result.afterTaxMonthlyIncome !== null && (
              <Stat
                label={t('After tax')}
                value={`${usd(result.afterTaxMonthlyIncome)}/${t('mo')}`}
                accent="slate"
              />
            )}
            {result.afterTaxTotalMonthlyIncomeReal !== null && result.government && (
              <Stat
                label={t('Total after tax (today’s $)')}
                value={`${usd(result.afterTaxTotalMonthlyIncomeReal)}/${t('mo')}`}
                accent="gold"
              />
            )}
          </div>
          {result.government && <BenefitsBreakdown result={result} />}
          {result.rrif && <RrifSchedule result={result} />}
          {result.buckets && <TaxBreakdown result={result} />}
          <GrowthChart result={result} />
        </>
      )}
    </section>
  );
}

// CPP/QPP and OAS: what they add, when they start, and what OAS loses to the
// recovery tax. All in today's dollars — both benefits are indexed, so that is
// what they are worth for the whole of retirement.
function BenefitsBreakdown({ result }: { result: RetirementResult }) {
  const { t } = useLang();
  const g = result.government;
  if (!g) return null;
  const clawback = result.oasClawbackAnnual ?? 0;
  const portfolio = result.realSustainableMonthlyIncome;
  const total = result.afterTaxTotalMonthlyIncomeReal;
  // Everything on this ledger is in today's dollars, so the rows genuinely add
  // up on screen. Tax is the balancing figure rather than a separate model.
  const tax = total !== null ? portfolio + g.monthly - total : null;
  return (
    <div className="tax-breakdown">
      <p className="ledger-caption">{t('Monthly retirement income, in today’s dollars')}</p>
      <ul className="tax-rows">
        <li>
          <span className="swatch-dot slate" />
          <span className="tax-row-label">{t('From your savings (4% rule)')}</span>
          <span className="tax-row-value">
            {usd(portfolio)}/{t('mo')}
          </span>
        </li>
        {g.cppMonthly > 0 && (
          <li>
            <span className="swatch-dot green" />
            <span className="tax-row-label">
              {t(CPP_LABEL)}
              {g.cppStartAge !== 65 && ` · ${t('from age')} ${g.cppStartAge}`}
            </span>
            <span className="tax-row-value">
              {usd(g.cppMonthly)}/{t('mo')}
            </span>
          </li>
        )}
        {g.oasMonthly > 0 && (
          <li>
            <span className="swatch-dot gold" />
            <span className="tax-row-label">
              {t('OAS')}
              {g.oasStartAge !== 65 && ` · ${t('from age')} ${g.oasStartAge}`}
            </span>
            <span className="tax-row-value">
              {usd(g.oasMonthly)}/{t('mo')}
            </span>
          </li>
        )}
        {tax !== null && tax > 0 && (
          <li>
            <span className="swatch-dot" />
            <span className="tax-row-label">{t('Tax and OAS clawback')}</span>
            <span className="tax-row-value negative">
              −{usd(tax)}/{t('mo')}
            </span>
          </li>
        )}
        {total !== null && (
          <li className="ledger-total">
            <span className="swatch-dot" style={{ visibility: 'hidden' }} />
            <span className="tax-row-label">{t('Left to spend')}</span>
            <span className="tax-row-value">
              {usd(total)}/{t('mo')}
            </span>
          </li>
        )}
      </ul>
      {g.bridgeYears > 0 && (
        <p className="muted small">
          {`${t('Your savings carry you alone for')} ${g.bridgeYears} ${t(
            'years before benefits begin.'
          )}`}
        </p>
      )}
      {clawback > 0 && (
        <p className="muted small plan-warn">
          {`${t('At this income, OAS loses about')} ${usd(clawback)}/${t(
            'yr'
          )} ${t('to the recovery tax. TFSA withdrawals don’t count toward it.')}`}
        </p>
      )}
    </div>
  );
}

// What the CRA forces out of the RRIF each year, against what the plan would
// have withdrawn anyway. The rows that matter are the ones where the minimum
// wins — that's income arriving whether it's wanted or not, fully taxable.
function RrifSchedule({ result }: { result: RetirementResult }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const r = result.rrif;
  if (!r) return null;

  const forcedRows = r.rows.filter((row) => row.forced);
  const clawbackAtPeak = result.oasClawbackAtPeakAnnual ?? 0;
  const clawbackSteady = result.oasClawbackAnnual ?? 0;
  // Only worth calling out when the forced withdrawal is what tips them over.
  const extraClawback = clawbackAtPeak - clawbackSteady;

  // Show every year once expanded; collapsed, show where it starts to bind.
  const shown = open ? r.rows : forcedRows.slice(0, 4);

  return (
    <div className="tax-breakdown">
      <p className="ledger-caption">{t('RRIF minimum withdrawals')}</p>

      {r.firstForcedAge === null ? (
        <p className="muted small">
          {`${t('Your plan already withdraws more than the RRIF minimum every year, so the minimum never binds. It begins at age')} ${r.firstMinimumAge}.`}
        </p>
      ) : (
        <p className="muted small">
          {`${t('From age')} ${r.firstForcedAge} ${t(
            'the minimum withdrawal exceeds what your plan would take — up to'
          )} ${usd(r.peakForcedExcessAnnual)}/${t('yr')} ${t(
            'of extra taxable income you cannot defer.'
          )}`}
        </p>
      )}

      {extraClawback > 0 && (
        <p className="muted small plan-warn">
          {`${t('In that year the forced income costs a further')} ${usd(extraClawback)} ${t(
            'of OAS. Drawing the RRIF down earlier, or splitting pension income with a spouse, reduces it.'
          )}`}
        </p>
      )}

      {shown.length > 0 && (
        <div className="rrif-table-wrap">
          <table className="rrif-table">
            <thead>
              <tr>
                <th>{t('Age')}</th>
                <th>{t('Factor')}</th>
                <th>{t('RRIF balance')}</th>
                <th>{t('Minimum')}</th>
                <th>{t('Withdrawn')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.age} className={row.forced ? 'forced' : undefined}>
                  <td>{row.age}</td>
                  <td>{row.factor > 0 ? `${(row.factor * 100).toFixed(2)}%` : '—'}</td>
                  {/* Balance stays compact to keep the table scannable; the
                      withdrawal figures are the actionable ones, so they show
                      in full. */}
                  <td>{usdCompact(row.balance)}</td>
                  <td>{row.required > 0 ? usd(row.required) : '—'}</td>
                  <td>{usd(row.withdrawn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
        {open ? t('Show less') : `${t('Show the full schedule to age')} 95`}
      </button>
      <p className="muted small">
        {`${t('Amounts are in today’s dollars. Converted at')} ${r.conversionAge}${t(
          ', so the first mandatory withdrawal is the year you turn'
        )} ${r.firstMinimumAge}.`}
      </p>
    </div>
  );
}

// Where the nest egg sits, and what the taxman takes on the way out.
function TaxBreakdown({ result }: { result: RetirementResult }) {
  const { t } = useLang();
  const { country } = useCountry();
  const b = result.buckets;
  if (!b) return null;
  const rows: { label: string; value: number; tone: string }[] = [
    {
      label: country === 'CA' ? t('Tax-deferred (RRSP/RRIF)') : t('Tax-deferred (401k/IRA)'),
      value: b.deferred,
      tone: 'gold',
    },
    {
      label: country === 'CA' ? t('Tax-free (TFSA/FHSA)') : t('Tax-free (Roth)'),
      value: b.free,
      tone: 'green',
    },
    { label: t('Taxable'), value: b.taxable, tone: 'slate' },
  ].filter((r) => r.value > 0);

  const effective = result.effectiveTaxRate ?? 0;
  return (
    <div className="tax-breakdown">
      <ul className="tax-rows">
        {rows.map((r) => (
          <li key={r.label}>
            <span className={`swatch-dot ${r.tone}`} />
            <span className="tax-row-label">{r.label}</span>
            <span className="tax-row-value">{usd(r.value)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        {`${t('Withdrawals lose about')} ${(effective * 100).toFixed(0)}% ${t(
          'to tax overall, leaving'
        )} ${usd(result.afterTaxMonthlyIncome ?? 0)}/${t('mo')} ${t('to spend.')}`}
      </p>
    </div>
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
        {household.afterTaxMonthlyIncome !== null && (
          <Stat
            label={t('Combined after tax')}
            value={`${usd(household.afterTaxMonthlyIncome)}/${t('mo')}`}
            accent="gold"
          />
        )}
        {household.governmentMonthly > 0 && (
          <Stat
            label={t('Household CPP + OAS')}
            value={`${usd(household.governmentMonthly)}/${t('mo')}`}
            accent="green"
          />
        )}
        {household.afterTaxTotalMonthlyIncomeReal !== null &&
          household.governmentMonthly > 0 && (
            <Stat
              label={t('Total with benefits, after tax')}
              value={`${usd(household.afterTaxTotalMonthlyIncomeReal)}/${t('mo')}`}
              accent="gold"
            />
          )}
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
