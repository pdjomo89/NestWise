import { query } from './_generated/server';
import { v } from 'convex/values';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Retirement projection — monthly-compounding math, computed server-side.
export const projectRetirement = query({
  args: {
    currentAge: v.number(),
    retirementAge: v.number(),
    currentSavings: v.number(),
    monthlyContribution: v.number(),
    annualReturn: v.number(), // e.g. 0.06
    annualInflation: v.number(), // e.g. 0.025
  },
  handler: async (_ctx, args) => {
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
  },
});

// Rule-of-thumb savings advice from a monthly cash-flow.
export const savingsAdvice = query({
  args: {
    monthlyIncome: v.number(),
    monthlyExpenses: v.number(),
    currentSavings: v.number(),
    creditCardDebt: v.optional(v.number()), // total owed across credit cards (positive)
    lang: v.optional(v.union(v.literal('en'), v.literal('fr'))),
  },
  handler: async (
    _ctx,
    { monthlyIncome, monthlyExpenses, currentSavings, creditCardDebt = 0, lang = 'en' }
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
