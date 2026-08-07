import { query } from './_generated/server';
import { v } from 'convex/values';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type PlanInput = {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturn: number; // e.g. 0.06
  annualInflation: number; // e.g. 0.025
  // How the nest egg is split across tax treatments (see src/accountTypes.ts).
  // The remainder after these two is the taxable share. Defaults derive from
  // the user's own accounts in the UI; absent here means "don't model tax".
  deferredShare?: number; // 0..1 — RRSP/RRIF/LIRA/LIF/RPP/401k: taxed as income
  freeShare?: number; // 0..1 — TFSA/FHSA: not taxed at all
  marginalTaxRate?: number; // 0..1 — expected rate in retirement
  country?: 'CA' | 'US';
  // Government benefits, as monthly amounts in TODAY's dollars at age 65.
  // Both CPP/QPP and OAS are indexed to inflation, so today's dollars are the
  // stable way to state them; the projection carries them forward itself.
  cppMonthly?: number;
  cppStartAge?: number; // 60–70, default 65
  oasMonthly?: number;
  oasStartAge?: number; // 65–70, default 65
  // When the RRSP becomes a RRIF. 71 is the legal deadline and the default;
  // converting earlier starts the forced withdrawals sooner at a lower rate.
  rrifConversionAge?: number;
};

const planFields = {
  currentAge: v.number(),
  retirementAge: v.number(),
  currentSavings: v.number(),
  monthlyContribution: v.number(),
  annualReturn: v.number(), // e.g. 0.06
  annualInflation: v.number(), // e.g. 0.025
  deferredShare: v.optional(v.number()),
  freeShare: v.optional(v.number()),
  marginalTaxRate: v.optional(v.number()),
  country: v.optional(v.union(v.literal('CA'), v.literal('US'))),
  cppMonthly: v.optional(v.number()),
  cppStartAge: v.optional(v.number()),
  oasMonthly: v.optional(v.number()),
  oasStartAge: v.optional(v.number()),
  rrifConversionAge: v.optional(v.number()),
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Share of a realized capital gain that counts as taxable income.
//
// Canada: the statutory inclusion rate — half of a capital gain is added to
// income and taxed at your marginal rate.
// US: no inclusion rate exists; long-term gains have their own brackets
// (0/15/20%). Half the marginal rate is a rough stand-in so the taxable bucket
// isn't modelled as either tax-free or fully taxed. Canada is the case this
// projection models precisely.
const CAPITAL_GAINS_INCLUSION: Record<'CA' | 'US', number> = { CA: 0.5, US: 0.5 };

// ── Government benefit rules ────────────────────────────────────────────────
// Unlike the dollar amounts (which are indexed yearly and live in
// src/canada.ts as editable defaults), these adjustment factors are stable
// legislation — they have not moved in many years.

// CPP/QPP: take it early and it is permanently reduced 0.6%/month before 65;
// defer and it is permanently increased 0.7%/month after 65. Bounds are the
// ages the pension can actually start.
const CPP_MIN_AGE = 60;
const CPP_MAX_AGE = 70;
const CPP_EARLY_PER_MONTH = 0.006;
const CPP_LATE_PER_MONTH = 0.007;

// OAS cannot start before 65; deferring adds 0.6%/month up to age 70.
const OAS_MIN_AGE = 65;
const OAS_MAX_AGE = 70;
const OAS_LATE_PER_MONTH = 0.006;

// OAS recovery tax ("clawback"): 15 cents of every dollar of net income above
// the threshold is taken back, until the whole pension is gone. The threshold
// is indexed, so it is expressed — and compared — in today's dollars.
// 2025 reference figure; see src/canada.ts on keeping these current.
const OAS_CLAWBACK_THRESHOLD = 93454;
const OAS_CLAWBACK_RATE = 0.15;

// ── RRIF minimum withdrawals ────────────────────────────────────────────────
// An RRSP must become a RRIF (or an annuity) by the end of the year you turn
// 71. From the year *after* it's established, a percentage of the January 1
// balance has to come out, whether you need the money or not — and it is fully
// taxable, which is how a large RRSP ends up clawing back its owner's OAS.
//
// Prescribed factors from age 71 up, unchanged since the 2015 revision.
// Below 71 the formula is 1/(90 − age), which is why converting early lowers
// the required draw but starts it sooner.
const RRIF_FACTORS: Record<number, number> = {
  71: 0.0528, 72: 0.054, 73: 0.0553, 74: 0.0567, 75: 0.0582,
  76: 0.0598, 77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682,
  81: 0.0708, 82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851,
  86: 0.0899, 87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192,
  91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879,
};
const RRIF_FACTOR_95_PLUS = 0.2;
const RRIF_LATEST_CONVERSION_AGE = 71;
// How far the schedule runs. Past this the factor is flat anyway.
const RRIF_SCHEDULE_END_AGE = 95;

export function rrifMinimumFactor(age: number): number {
  if (age >= 95) return RRIF_FACTOR_95_PLUS;
  if (age >= 71) return RRIF_FACTORS[Math.floor(age)] ?? RRIF_FACTOR_95_PLUS;
  // Under 71 there is no table — the factor is derived from the age.
  return 1 / (90 - Math.floor(age));
}

const clampRange = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Permanent adjustment factor for starting a benefit off 65.
function benefitFactor(
  startAge: number,
  { min, max, early, late }: { min: number; max: number; early: number; late: number }
): number {
  const age = clampRange(startAge, min, max);
  const months = (age - 65) * 12;
  return 1 + months * (months < 0 ? early : late);
}

// What CPP/QPP and OAS are worth per month, in today's dollars, given when
// each is taken. Returns zeros when the plan doesn't model benefits.
export function governmentBenefits(args: PlanInput) {
  const cppBase = args.cppMonthly ?? 0;
  const oasBase = args.oasMonthly ?? 0;
  const cppStartAge = clampRange(args.cppStartAge ?? 65, CPP_MIN_AGE, CPP_MAX_AGE);
  const oasStartAge = clampRange(args.oasStartAge ?? 65, OAS_MIN_AGE, OAS_MAX_AGE);

  const cpp = cppBase
    ? cppBase *
      benefitFactor(cppStartAge, {
        min: CPP_MIN_AGE,
        max: CPP_MAX_AGE,
        early: CPP_EARLY_PER_MONTH,
        late: CPP_LATE_PER_MONTH,
      })
    : 0;
  const oas = oasBase
    ? oasBase *
      benefitFactor(oasStartAge, {
        min: OAS_MIN_AGE,
        max: OAS_MAX_AGE,
        early: 0,
        late: OAS_LATE_PER_MONTH,
      })
    : 0;

  return {
    cppMonthly: round2(cpp),
    oasMonthly: round2(oas),
    monthly: round2(cpp + oas),
    cppStartAge,
    oasStartAge,
    // The portfolio has to cover everything on its own until these begin. A
    // positive number here is the length of that bridge, in years.
    bridgeYears: Math.max(
      0,
      Math.max(cpp ? cppStartAge : 0, oas ? oasStartAge : 0) - args.retirementAge
    ),
  };
}

// Year-by-year path of the tax-deferred pot once it becomes a RRIF.
//
// Everything is reported in TODAY's dollars so it lines up with the income
// ledger. Each year the retiree takes the greater of what their plan calls for
// (the 4% draw, holding its purchasing power) and what the CRA requires. When
// the requirement is the larger of the two, income is being forced out.
//
// Returns null when there's nothing to schedule: no deferred savings, or a
// non-Canadian plan.
export function rrifSchedule(
  args: PlanInput,
  deferredAtRetirement: number,
  realSustainableAnnualIncome: number,
  deferredShare: number
) {
  const { country = 'CA', annualReturn, annualInflation, retirementAge } = args;
  if (country !== 'CA' || deferredAtRetirement <= 0) return null;

  const conversionAge = clampRange(
    args.rrifConversionAge ?? RRIF_LATEST_CONVERSION_AGE,
    Math.max(55, Math.floor(retirementAge)),
    RRIF_LATEST_CONVERSION_AGE
  );
  // No minimum for the year the RRIF is set up — it starts the year after.
  const firstMinimumAge = conversionAge + 1;

  // The plan's own draw on this pot, in today's dollars: its share of the 4%
  // withdrawal. Constant in real terms, which is what the 4% rule means.
  const plannedRealAnnual = realSustainableAnnualIncome * deferredShare;

  // Real growth — inflation is already stripped out of every figure here.
  const realGrowth = (1 + annualReturn) / (1 + annualInflation) - 1;

  let balance = deferredAtRetirement / Math.pow(1 + annualInflation, args.retirementAge - args.currentAge);
  const rows: {
    age: number;
    factor: number;
    balance: number;
    required: number;
    planned: number;
    withdrawn: number;
    forced: boolean;
  }[] = [];

  let firstForcedAge: number | null = null;
  let peakForcedExcess = 0;

  for (let age = Math.floor(retirementAge); age <= RRIF_SCHEDULE_END_AGE; age++) {
    if (balance <= 0) break;
    const applies = age >= firstMinimumAge;
    const factor = applies ? rrifMinimumFactor(age) : 0;
    const required = applies ? balance * factor : 0;
    const planned = Math.min(plannedRealAnnual, balance);
    const withdrawn = Math.min(balance, Math.max(planned, required));
    const forced = required > planned + 0.5; // half a dollar of slack for rounding

    if (forced && firstForcedAge === null) firstForcedAge = age;
    if (forced) peakForcedExcess = Math.max(peakForcedExcess, required - planned);

    rows.push({
      age,
      factor: Math.round(factor * 10000) / 10000,
      balance: round2(balance),
      required: round2(required),
      planned: round2(planned),
      withdrawn: round2(withdrawn),
      forced,
    });

    balance = (balance - withdrawn) * (1 + realGrowth);
  }

  const peakRow = rows.reduce<(typeof rows)[number] | null>(
    (best, r) => (best === null || r.withdrawn > best.withdrawn ? r : best),
    null
  );

  return {
    conversionAge,
    firstMinimumAge,
    firstForcedAge,
    // Biggest single year of forced income above the plan's own draw.
    peakForcedExcessAnnual: round2(peakForcedExcess),
    peakWithdrawalAnnual: peakRow ? peakRow.withdrawn : 0,
    peakWithdrawalAge: peakRow ? peakRow.age : null,
    // Nothing is left to the estate here — the schedule ends when the pot does
    // or at 95, whichever comes first.
    balanceAtEnd: round2(Math.max(0, balance)),
    rows,
  };
}

// Core monthly-compounding projection for a single plan. Shared by the
// single-plan query, the household roll-up and the coach's retirement pillar so
// the math stays in one place.
export function project(args: PlanInput) {
  const {
    currentAge,
    retirementAge,
    currentSavings,
    monthlyContribution,
    annualReturn,
    annualInflation,
  } = args;

  const years = Math.max(0, retirementAge - currentAge);
  const months = Math.round(years * 12);
  const monthlyRate = annualReturn / 12;

  const series: { age: number; balance: number; contributed: number }[] = [];
  let balance = currentSavings;
  let contributed = currentSavings;

  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    contributed += monthlyContribution;
    if (m % 12 === 0) {
      series.push({
        age: currentAge + m / 12,
        balance: round2(balance),
        contributed: round2(contributed),
      });
    }
  }

  const futureValue = round2(balance);
  const realValue = round2(balance / Math.pow(1 + annualInflation, years));
  const totalContributed = round2(contributed);
  const totalGrowth = round2(futureValue - totalContributed);
  const sustainableAnnualIncome = round2(futureValue * 0.04); // 4% rule
  // The same 4% withdrawal expressed in today's money. Tax thresholds are
  // absolute amounts, so the tax work below has to happen in these units.
  const realSustainableAnnualIncome = round2(realValue * 0.04);

  const gov = governmentBenefits(args);

  // The RRIF path depends on how much of the pot is tax-deferred, which is the
  // same share the tax model uses.
  const deferredShare = clamp01(args.deferredShare ?? 0);
  const rrif = rrifSchedule(
    args,
    futureValue * deferredShare,
    realSustainableAnnualIncome,
    deferredShare
  );

  return {
    years,
    futureValue,
    realValue,
    totalContributed,
    totalGrowth,
    sustainableAnnualIncome,
    sustainableMonthlyIncome: round2(sustainableAnnualIncome / 12),
    // Government benefits, in today's dollars (they are indexed, so this is
    // what they are worth for the whole of retirement).
    government: gov.monthly > 0 ? gov : null,
    // The 4% withdrawal in today's money. Exposed so the UI can show benefits
    // and portfolio in the same units — mixing nominal and real in one row
    // makes adding a pension look like it shrinks your income.
    realSustainableMonthlyIncome: round2(realSustainableAnnualIncome / 12),
    // Portfolio + benefits, the number that actually answers "what will I live
    // on?". Real, because the benefit amounts are stated in today's dollars.
    totalMonthlyIncomeReal: round2(realSustainableAnnualIncome / 12 + gov.monthly),
    rrif,
    series,
    ...afterTax(args, {
      futureValue,
      totalGrowth,
      sustainableAnnualIncome,
      realSustainableAnnualIncome,
      governmentMonthly: gov.monthly,
      oasMonthly: gov.oasMonthly,
      // The worst year the RRIF forces on them. The headline clawback is
      // assessed at the steady 4% draw; this shows what the mandatory
      // withdrawal does on top of it.
      peakForcedExcessAnnual: rrif?.peakForcedExcessAnnual ?? 0,
    }),
  };
}

// Split the projected nest egg by tax treatment and net the withdrawal down to
// what actually lands in the retiree's pocket.
//
// Assumes the contribution mix matches the mix already saved — the shares are
// applied to the whole projection, not just today's balance. Growth compounds
// identically in every bucket, so projecting the total and splitting it is the
// same arithmetic as projecting each bucket separately.
//
// Returns nulls unless a marginal rate was supplied, so callers that don't
// model tax (the coach, legacy plans) see exactly what they saw before.
function afterTax(
  args: PlanInput,
  amounts: {
    futureValue: number;
    totalGrowth: number;
    sustainableAnnualIncome: number;
    realSustainableAnnualIncome: number;
    governmentMonthly: number;
    oasMonthly: number;
    peakForcedExcessAnnual: number;
  }
) {
  const { marginalTaxRate, country = 'CA' } = args;
  const {
    futureValue,
    totalGrowth,
    sustainableAnnualIncome,
    realSustainableAnnualIncome,
    governmentMonthly,
    oasMonthly,
    peakForcedExcessAnnual,
  } = amounts;

  if (marginalTaxRate === undefined || marginalTaxRate <= 0) {
    return {
      buckets: null,
      afterTaxAnnualIncome: null,
      afterTaxMonthlyIncome: null,
      afterTaxTotalMonthlyIncomeReal: null,
      effectiveTaxRate: null,
      oasClawbackAnnual: null,
      oasClawbackAtPeakAnnual: null,
    };
  }

  const rate = clamp01(marginalTaxRate);
  const deferredShare = clamp01(args.deferredShare ?? 0);
  const freeShare = clamp01(args.freeShare ?? 0);
  // Never let rounding or a bad input push the shares past 100%.
  const taxableShare = Math.max(0, 1 - deferredShare - freeShare);

  // Only the gain in a taxable account is taxed, and only part of that gain
  // counts as income. A pot that is mostly contributions is barely taxed.
  const growthFraction = futureValue > 0 ? clamp01(totalGrowth / futureValue) : 0;
  const taxableDrag = rate * CAPITAL_GAINS_INCLUSION[country] * growthFraction;

  // Fraction of a portfolio withdrawal that survives tax. Being a ratio, it
  // holds in both nominal and today's dollars.
  const portfolioKeepRatio =
    deferredShare * (1 - rate) + freeShare + taxableShare * (1 - taxableDrag);

  const afterTaxAnnualIncome = round2(sustainableAnnualIncome * portfolioKeepRatio);

  // ── OAS recovery tax ──────────────────────────────────────────────────────
  // Assessed on net income against an absolute threshold, so it has to be
  // computed in today's dollars. What counts: fully-taxable registered
  // withdrawals, the included half of taxable-account gains, and the benefits
  // themselves. What doesn't: TFSA withdrawals — which is exactly why a large
  // TFSA protects OAS.
  const govAnnual = governmentMonthly * 12;
  const oasAnnual = oasMonthly * 12;
  const taxableIncomeReal =
    realSustainableAnnualIncome * deferredShare +
    realSustainableAnnualIncome * taxableShare * CAPITAL_GAINS_INCLUSION[country] * growthFraction +
    govAnnual;

  const clawbackOn = (income: number) =>
    country === 'CA' && oasAnnual > 0
      ? round2(
          Math.min(
            oasAnnual,
            Math.max(0, (income - OAS_CLAWBACK_THRESHOLD) * OAS_CLAWBACK_RATE)
          )
        )
      : 0;

  const oasClawbackAnnual = clawbackOn(taxableIncomeReal);
  // A RRIF minimum above the planned draw is extra fully-taxable income in that
  // year, so it can push someone over the threshold who was clear of it at the
  // steady 4% rate.
  const oasClawbackAtPeakAnnual = clawbackOn(taxableIncomeReal + peakForcedExcessAnnual);

  // CPP and OAS are ordinary taxable income, then OAS is clawed back on top.
  const afterTaxGovAnnual = Math.max(0, govAnnual * (1 - rate) - oasClawbackAnnual);

  const afterTaxTotalAnnualReal =
    realSustainableAnnualIncome * portfolioKeepRatio + afterTaxGovAnnual;
  const grossTotalAnnualReal = realSustainableAnnualIncome + govAnnual;

  return {
    buckets: {
      deferred: round2(futureValue * deferredShare),
      free: round2(futureValue * freeShare),
      taxable: round2(futureValue * taxableShare),
    },
    afterTaxAnnualIncome,
    afterTaxMonthlyIncome: round2(afterTaxAnnualIncome / 12),
    // Portfolio + benefits, net of tax, in today's dollars — the bottom line.
    afterTaxTotalMonthlyIncomeReal: round2(afterTaxTotalAnnualReal / 12),
    effectiveTaxRate:
      grossTotalAnnualReal > 0
        ? round2(1 - afterTaxTotalAnnualReal / grossTotalAnnualReal)
        : 0,
    oasClawbackAnnual,
    oasClawbackAtPeakAnnual,
  };
}

// Retirement projection — monthly-compounding math, computed server-side.
export const projectRetirement = query({
  args: planFields,
  handler: async (_ctx, args) => project(args),
});

// Household roll-up: project every plan and sum the headline figures. Used by
// the dashboard outlook and advice so a couple sees their combined nest egg.
// `years` is reported as a min–max range since plans can retire in different
// years. The per-plan chart series isn't summed here (ages don't align) — the
// Retirement tab draws each plan's own chart.
export const projectHousehold = query({
  args: { plans: v.array(v.object(planFields)) },
  handler: async (_ctx, { plans }) => {
    const results = plans.map(project);
    const sum = (pick: (r: ReturnType<typeof project>) => number) =>
      round2(results.reduce((acc, r) => acc + pick(r), 0));
    // After-tax only rolls up when every plan models tax; mixing a taxed plan
    // with an untaxed one would quietly understate the household's tax bill.
    const taxed = results.every((r) => r.afterTaxAnnualIncome !== null);
    return {
      count: results.length,
      futureValue: sum((r) => r.futureValue),
      realValue: sum((r) => r.realValue),
      totalContributed: sum((r) => r.totalContributed),
      totalGrowth: sum((r) => r.totalGrowth),
      sustainableAnnualIncome: sum((r) => r.sustainableAnnualIncome),
      sustainableMonthlyIncome: sum((r) => r.sustainableMonthlyIncome),
      afterTaxAnnualIncome: taxed ? sum((r) => r.afterTaxAnnualIncome ?? 0) : null,
      afterTaxMonthlyIncome: taxed ? sum((r) => r.afterTaxMonthlyIncome ?? 0) : null,
      // Benefits are per person, so the household figure is simply the sum —
      // each spouse draws their own CPP and OAS.
      governmentMonthly: sum((r) => r.government?.monthly ?? 0),
      totalMonthlyIncomeReal: sum((r) => r.totalMonthlyIncomeReal),
      afterTaxTotalMonthlyIncomeReal: taxed
        ? sum((r) => r.afterTaxTotalMonthlyIncomeReal ?? 0)
        : null,
      oasClawbackAnnual: taxed ? sum((r) => r.oasClawbackAnnual ?? 0) : null,
      buckets: taxed
        ? {
            deferred: sum((r) => r.buckets?.deferred ?? 0),
            free: sum((r) => r.buckets?.free ?? 0),
            taxable: sum((r) => r.buckets?.taxable ?? 0),
          }
        : null,
      minYears: results.length ? Math.min(...results.map((r) => r.years)) : 0,
      maxYears: results.length ? Math.max(...results.map((r) => r.years)) : 0,
    };
  },
});

// Whole-picture financial advice from a monthly cash-flow plus optional balance
// and retirement signals. Every applicable area produces a detailed, prioritized
// tip with concrete numbers. Extra signals are optional so the query stays
// callable with just the core cash-flow fields.
export const savingsAdvice = query({
  args: {
    monthlyIncome: v.number(),
    monthlyExpenses: v.number(),
    currentSavings: v.number(),
    creditCardDebt: v.optional(v.number()), // total owed across credit cards (positive)
    cashReserves: v.optional(v.number()), // liquid cash (checking + savings)
    investmentValue: v.optional(v.number()), // current value of investment accounts
    retirementValue: v.optional(v.number()), // balance in retirement accounts
    retirementSustainableIncome: v.optional(v.number()), // projected 4%-rule monthly income
    topCategory: v.optional(v.object({ label: v.string(), total: v.number() })), // biggest expense
    lang: v.optional(v.union(v.literal('en'), v.literal('fr'))),
    country: v.optional(v.union(v.literal('CA'), v.literal('US'))),
  },
  handler: async (
    _ctx,
    {
      monthlyIncome,
      monthlyExpenses,
      currentSavings,
      creditCardDebt = 0,
      cashReserves,
      investmentValue,
      retirementValue,
      retirementSustainableIncome,
      topCategory,
      lang = 'en',
      country = 'US',
    }
  ) => {
    const fr = lang === 'fr';
    const ca = country === 'CA';
    const tips: { level: string; title: string; detail: string }[] = [];
    const surplus = round2(monthlyIncome - monthlyExpenses);
    const savingsRate = monthlyIncome > 0 ? surplus / monthlyIncome : 0;
    const fmt = (n: number) => {
      const en = round2(n).toLocaleString('en-US');
      return fr ? `${en.replace(/,/g, ' ').replace('.', ',')} $` : `$${en}`;
    };
    const pct = `${(savingsRate * 100).toFixed(0)}${fr ? ' %' : '%'}`;

    // Highest-priority guidance: paying off high-interest credit card debt
    // beats almost any investment return, so it leads the list.
    if (creditCardDebt > 0) {
      const monthsToPayoff = surplus > 0 ? Math.ceil(creditCardDebt / surplus) : null;
      const timeline = monthsToPayoff
        ? fr
          ? ` À ${fmt(surplus)}/mois d’excédent, vous seriez libéré en environ ${monthsToPayoff} mois.`
          : ` At ${fmt(surplus)}/mo surplus, you'd be debt-free in about ${monthsToPayoff} months.`
        : fr
        ? ' Dégagez d’abord un excédent mensuel pour commencer à le rembourser.'
        : ' Free up a monthly surplus first so you can start paying it down.';
      tips.push({
        level: 'urgent',
        title: fr
          ? `Remboursez ${fmt(creditCardDebt)} de dette de carte de crédit`
          : `Pay off ${fmt(creditCardDebt)} in credit card debt`,
        detail:
          (fr
            ? 'Les cartes de crédit facturent souvent 20–25 % d’intérêt — bien plus que ce que rapportent les placements. Remboursez d’abord la carte au taux le plus élevé (méthode avalanche).'
            : 'Credit cards often charge 20–25% interest — far more than investments earn. Pay the highest-rate card first (the avalanche method).') +
          timeline,
      });
    }

    if (surplus <= 0) {
      tips.push({
        level: 'urgent',
        title: fr ? 'Vous dépensez plus que vos revenus' : 'You are spending more than you earn',
        detail: fr
          ? 'Ramenez les dépenses sous les revenus avant d’investir.'
          : 'Bring expenses below income before investing.',
      });
    } else {
      tips.push({
        level: savingsRate >= 0.2 ? 'good' : 'info',
        title: fr ? `Vous épargnez ${pct} de vos revenus` : `You save ${pct} of your income`,
        detail:
          savingsRate >= 0.2
            ? fr
              ? `Un taux d’épargne de 20 %+ vous met sur une bonne voie. Pensez à maximiser vos ${
                  ca ? 'REER et CELI' : 'comptes avantageux'
                }.`
              : `A 20%+ savings rate puts you on a strong path. Consider maxing your ${
                  ca ? 'RRSP and TFSA' : 'tax-advantaged accounts'
                }.`
            : fr
            ? 'Visez à épargner au moins 20 % de vos revenus. Trouvez une dépense à réduire ce mois-ci.'
            : 'Aim to save at least 20% of income. Find one expense to trim this month.',
      });
    }

    const emergencyTarget = round2(monthlyExpenses * 6);
    tips.push(
      currentSavings < emergencyTarget
        ? {
            level: 'info',
            title: fr ? 'Constituez un fonds d’urgence de 6 mois' : 'Build a 6-month emergency fund',
            detail: fr
              ? `Visez environ ${fmt(emergencyTarget)}. Vous avez ${fmt(currentSavings)}.`
              : `Aim for about ${fmt(emergencyTarget)}. You have ${fmt(currentSavings)}.`,
          }
        : {
            level: 'good',
            title: fr ? 'Votre fonds d’urgence semble sain' : 'Emergency fund looks healthy',
            detail: fr
              ? 'Dirigez l’excédent supplémentaire vers la retraite et les placements.'
              : 'Direct extra surplus toward retirement and investments.',
          }
    );

    // Retirement trajectory — uses the live projection passed from the client.
    const retirementTarget = round2(monthlyExpenses * 0.8); // ~80% income replacement
    if (retirementSustainableIncome != null && monthlyExpenses > 0) {
      if (retirementSustainableIncome < retirementTarget) {
        tips.push({
          level: 'info',
          title: fr ? 'Vous êtes en retard sur la retraite' : "You're behind on retirement",
          detail: fr
            ? `Votre épargne actuelle projette environ ${fmt(retirementSustainableIncome)}/mois à la retraite, sous les ~${fmt(retirementTarget)}/mois nécessaires pour maintenir votre niveau de vie. Augmentez vos cotisations (visez 15 % du revenu) et captez d’abord tout match employeur. Ajustez le plan dans l’onglet Retraite.`
            : `Your current savings project to about ${fmt(retirementSustainableIncome)}/mo in retirement — below the ~${fmt(retirementTarget)}/mo needed to keep your lifestyle. Raise your monthly contributions (aim for 15% of income) and capture any employer match first. Tune the plan in the Retirement tab.`,
        });
      } else {
        tips.push({
          level: 'good',
          title: fr ? 'Votre retraite est sur la bonne voie' : 'Your retirement is on track',
          detail: fr
            ? `Vos placements projettent environ ${fmt(retirementSustainableIncome)}/mois, de quoi couvrir vos ~${fmt(monthlyExpenses)}/mois de dépenses. Continuez à cotiser et révisez le plan chaque année.`
            : `Your investments project to about ${fmt(retirementSustainableIncome)}/mo — enough to cover your ~${fmt(monthlyExpenses)}/mo of expenses. Keep contributing and review the plan each year.`,
        });
      }
    } else if ((retirementValue ?? 0) === 0) {
      tips.push({
        level: 'info',
        title: fr ? 'Commencez à épargner pour la retraite' : 'Start saving for retirement',
        detail: ca
          ? fr
            ? 'Vous n’avez pas encore de compte de retraite. Ouvrez un REER ou un CELI — et si votre employeur offre un RPA ou un REER collectif avec cotisation équivalente, commencez par là : c’est un rendement immédiat de 100 %. Le REER réduit votre revenu imposable aujourd’hui; le CELI ne sera jamais imposé au retrait. Configurez votre plan dans l’onglet Retraite.'
            : "You have no retirement account yet. Open an RRSP or a TFSA — and if your employer offers a pension or group RRSP with matching, start there: that's an instant 100% return. An RRSP cuts your taxable income today; a TFSA is never taxed on the way out. Set up your plan in the Retirement tab."
          : fr
          ? 'Vous n’avez pas encore de compte retraite. Ouvrez un 401(k) ou un IRA et captez d’abord tout match employeur — c’est un rendement immédiat de 100 %. Configurez votre plan dans l’onglet Retraite.'
          : "You have no retirement account yet. Open a 401(k) or IRA and capture any employer match first — that's an instant 100% return. Set up your plan in the Retirement tab.",
      });
    }

    // Idle cash sitting well above a healthy emergency buffer.
    if (cashReserves != null && monthlyExpenses > 0) {
      const excess = round2(cashReserves - emergencyTarget);
      if (excess > monthlyExpenses) {
        const annualYield = round2(excess * 0.04);
        tips.push({
          level: 'info',
          title: fr ? 'Faites travailler votre encaisse' : 'Put your idle cash to work',
          detail: fr
            ? `Vous détenez ${fmt(cashReserves)} en liquide, soit environ ${fmt(excess)} de plus qu’un fonds d’urgence de 6 mois. Placez l’excédent dans un compte d’épargne à haut rendement (~4 %) ou des placements : cela rapporterait environ ${fmt(annualYield)}/an au lieu de dormir.`
            : `You hold ${fmt(cashReserves)} in cash — about ${fmt(excess)} more than a 6-month emergency fund. Move the excess into a high-yield savings account (~4%) or investments to earn roughly ${fmt(annualYield)}/yr instead of letting it sit idle.`,
        });
      }
    }

    // Surplus with an emergency fund in place but nothing invested yet.
    if (
      surplus > 0 &&
      currentSavings >= emergencyTarget * 0.8 &&
      (investmentValue ?? 0) === 0 &&
      creditCardDebt === 0
    ) {
      const fv = round2(surplus * 520); // ~$/mo for 20 yrs at 7% (monthly compounding)
      tips.push({
        level: 'info',
        title: fr ? 'Investissez votre excédent mensuel' : 'Invest your monthly surplus',
        detail: fr
          ? `Vous dégagez ${fmt(surplus)}/mois mais n’avez aucun placement. Une fois le fonds d’urgence constitué, investissez l’excédent dans des fonds indiciels à faibles frais : à ce rythme sur 20 ans (~7 %/an), cela pourrait dépasser ${fmt(fv)}.`
          : `You're freeing up ${fmt(surplus)}/mo but hold no investments. With your emergency fund in place, invest the surplus in low-cost index funds — at this rate for 20 years (~7%/yr) it could grow to over ${fmt(fv)}.`,
      });
    }

    // Largest expense category dominating the budget.
    if (topCategory && monthlyExpenses > 0 && topCategory.total > monthlyExpenses * 0.3) {
      const share = Math.round((topCategory.total / monthlyExpenses) * 100);
      const trim = round2(topCategory.total * 0.1);
      tips.push({
        level: 'info',
        title: fr
          ? `${topCategory.label} pèse lourd dans votre budget`
          : `${topCategory.label} is a big share of your budget`,
        detail: fr
          ? `${topCategory.label} représente ${fmt(topCategory.total)}/mois, soit ${share} % de vos dépenses. La réduire de 10 % libérerait environ ${fmt(trim)}/mois pour la dette ou l’épargne.`
          : `${topCategory.label} is ${fmt(topCategory.total)}/mo — ${share}% of your spending. Trimming it 10% would free about ${fmt(trim)}/mo toward debt or savings.`,
      });
    }

    if (creditCardDebt > 0) {
      tips.push({
        level: 'info',
        title: fr ? 'Gardez l’utilisation sous 30 %' : 'Keep card utilization under 30%',
        detail: fr
          ? 'Évitez de nouveaux achats à crédit et réglez le solde complet chaque mois pour protéger votre cote de crédit et éviter les intérêts.'
          : 'Avoid new charges and pay the full statement balance each month to protect your credit score and avoid interest.',
      });
    }

    return { surplus, savingsRate: round2(savingsRate), emergencyTarget, creditCardDebt, tips };
  },
});
