import { query } from './_generated/server';
import { v } from 'convex/values';
import { toMonthly } from './frequency';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Combined household budget: recurring income vs. recurring expenses plus
// this month's one-off expense transactions, all normalized to per-month.
export const get = query({
  args: { lang: v.optional(v.union(v.literal('en'), v.literal('fr'))) },
  handler: async (ctx, { lang = 'en' }) => {
    const people = await ctx.db.query('people').collect();
    const sources = await ctx.db.query('incomeSources').collect();
    const recurring = await ctx.db.query('recurringExpenses').collect();
    const txns = await ctx.db.query('transactions').collect();

    const month = new Date(Date.now()).toISOString().slice(0, 7); // YYYY-MM

    // Income, total and per person.
    const perPersonMonthly = new Map<string, number>();
    let monthlyIncome = 0;
    for (const s of sources) {
      const m = toMonthly(s.amount, s.frequency);
      monthlyIncome += m;
      const key = s.personId ?? 'unassigned';
      perPersonMonthly.set(key, (perPersonMonthly.get(key) ?? 0) + m);
    }
    const perPerson = people.map((p) => ({
      personId: p._id as string | null,
      name: p.name,
      monthly: round2(perPersonMonthly.get(p._id) ?? 0),
    }));
    const unassigned = perPersonMonthly.get('unassigned');
    if (unassigned) {
      perPerson.push({ personId: null, name: 'Unassigned', monthly: round2(unassigned) });
    }

    // Expenses: recurring (normalized) + this month's one-off transactions.
    const byCategory = new Map<string, number>();
    let recurringMonthly = 0;
    for (const r of recurring) {
      const m = toMonthly(r.amount, r.frequency);
      recurringMonthly += m;
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + m);
    }
    let oneOffThisMonth = 0;
    for (const t of txns) {
      if (t.amount < 0 && t.date.startsWith(month)) {
        const a = Math.abs(t.amount);
        oneOffThisMonth += a;
        byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + a);
      }
    }

    const monthlyExpenses = recurringMonthly + oneOffThisMonth;
    const surplus = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? surplus / monthlyIncome : 0;
    const sortedCategories = [...byCategory.entries()]
      .map(([category, total]) => ({ category, total: round2(total) }))
      .sort((a, b) => b.total - a.total);

    // Health status drives the dashboard color: green/yellow/red (+ setup).
    const status =
      monthlyIncome <= 0 && monthlyExpenses <= 0
        ? 'setup'
        : surplus < 0
        ? 'shortfall'
        : savingsRate < 0.2
        ? 'attention'
        : 'good';

    return {
      month,
      monthlyIncome: round2(monthlyIncome),
      perPerson,
      recurringMonthly: round2(recurringMonthly),
      oneOffThisMonth: round2(oneOffThisMonth),
      monthlyExpenses: round2(monthlyExpenses),
      surplus: round2(surplus),
      savingsRate: round2(savingsRate),
      byCategory: sortedCategories,
      status,
      tips: buildTips(
        status,
        {
          surplus,
          savingsRate,
          monthlyIncome,
          monthlyExpenses,
          topCategory: sortedCategories[0],
        },
        lang
      ),
    };
  },
});

function buildTips(
  status: string,
  ctx: {
    surplus: number;
    savingsRate: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    topCategory?: { category: string; total: number };
  },
  lang: 'en' | 'fr'
) {
  const { surplus, savingsRate, monthlyIncome, monthlyExpenses, topCategory } = ctx;
  const fr = lang === 'fr';
  const fmt = (n: number) => fmtMoney(n, lang);
  const mo = fr ? '/mois' : '/mo';
  const pct = `${(savingsRate * 100).toFixed(0)}${fr ? ' %' : '%'}`;
  const top = topCategory
    ? `${topCategory.category} (${fmt(topCategory.total)}${mo})`
    : fr
    ? 'votre plus grande catégorie'
    : 'your largest category';

  if (status === 'setup') {
    return fr
      ? [
          'Ajoutez le revenu et la fréquence de paie de chaque partenaire dans l’onglet Budget pour voir votre excédent mensuel.',
          'Puis enregistrez les factures récurrentes pour suivre les dépenses par rapport aux revenus.',
        ]
      : [
          'Add each partner’s income and pay frequency in the Budget tab to see your monthly surplus.',
          'Then log recurring bills so expenses are tracked against income.',
        ];
  }
  if (status === 'shortfall') {
    return fr
      ? [
          `Vous dépensez ${fmt(-surplus)} de plus que vos revenus chaque mois — la priorité est d’atteindre l’équilibre.`,
          `Commencez par ${top} ; le réduire a le plus grand impact.`,
          'Examinez les charges récurrentes (abonnements, forfaits, assurances) que vous pouvez suspendre, réduire ou renégocier.',
          `Ou augmentez vos revenus : ${fmt(-surplus)}${mo} de plus comblent l’écart.`,
        ]
      : [
          `You’re spending ${fmt(-surplus)} more than you earn each month — the priority is to break even.`,
          `Start with ${top}; trimming it has the biggest impact.`,
          'Review recurring charges (subscriptions, plans, insurance) you can pause, downgrade, or renegotiate.',
          `Or grow income: an extra ${fmt(-surplus)}${mo} closes the gap.`,
        ];
  }
  if (status === 'attention') {
    const need = Math.max(0, 0.2 * monthlyIncome - surplus);
    return fr
      ? [
          `Vous épargnez ${pct} — positif, mais sous le seuil de 20 %.`,
          `Libérer environ ${fmt(need)}${mo} (p. ex. de ${top}) vous amènerait à un taux d’épargne de 20 %.`,
          'Automatisez un virement le jour de paie pour épargner l’excédent avant de le dépenser.',
        ]
      : [
          `You’re saving ${pct} — positive, but below the 20% guideline.`,
          `Freeing about ${fmt(need)}${mo} (e.g. from ${top}) would lift you to a 20% savings rate.`,
          'Automate a transfer on payday so the surplus is saved before it can be spent.',
        ];
  }
  // good
  return fr
    ? [
        `Taux d’épargne solide de ${pct} — confortablement au-dessus de la cible de 20 %.`,
        `Faites fructifier votre excédent de ${fmt(surplus)}${mo} : maximisez les comptes de retraite avantageux, puis investissez le reste.`,
        `Gardez environ ${fmt(monthlyExpenses * 6)} (6 mois de dépenses) comme fonds d’urgence.`,
      ]
    : [
        `Strong ${pct} savings rate — comfortably above the 20% target.`,
        `Put your ${fmt(surplus)}${mo} surplus to work: max tax-advantaged retirement accounts, then invest the rest.`,
        `Keep about ${fmt(monthlyExpenses * 6)} (6 months of expenses) as an emergency fund.`,
      ];
}

// Format money without relying on non-English ICU data in the Convex runtime:
// build from the en-US string, then swap separators for French.
function fmtMoney(n: number, lang: 'en' | 'fr') {
  const en = round2(n).toLocaleString('en-US');
  if (lang === 'fr') return `${en.replace(/,/g, ' ').replace('.', ',')} $`;
  return `$${en}`;
}
