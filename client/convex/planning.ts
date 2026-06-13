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
};

const planFields = {
  currentAge: v.number(),
  retirementAge: v.number(),
  currentSavings: v.number(),
  monthlyContribution: v.number(),
  annualReturn: v.number(), // e.g. 0.06
  annualInflation: v.number(), // e.g. 0.025
};

// Core monthly-compounding projection for a single plan. Shared by the
// single-plan query and the household roll-up so the math stays in one place.
function project(args: PlanInput) {
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
  const sustainableAnnualIncome = round2(futureValue * 0.04); // 4% rule

  return {
    years,
    futureValue,
    realValue,
    totalContributed,
    totalGrowth: round2(futureValue - totalContributed),
    sustainableAnnualIncome,
    sustainableMonthlyIncome: round2(sustainableAnnualIncome / 12),
    series,
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
    return {
      count: results.length,
      futureValue: sum((r) => r.futureValue),
      realValue: sum((r) => r.realValue),
      totalContributed: sum((r) => r.totalContributed),
      totalGrowth: sum((r) => r.totalGrowth),
      sustainableAnnualIncome: sum((r) => r.sustainableAnnualIncome),
      sustainableMonthlyIncome: sum((r) => r.sustainableMonthlyIncome),
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
    }
  ) => {
    const fr = lang === 'fr';
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
              ? 'Un taux d’épargne de 20 %+ vous met sur une bonne voie. Pensez à maximiser les comptes avantageux.'
              : 'A 20%+ savings rate puts you on a strong path. Consider maxing tax-advantaged accounts.'
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
        detail: fr
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
