import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { toMonthly } from './frequency';
import { getUserId, requireUserId } from './auth';
import { project } from './planning';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

// The improvement coach. Where the Advice tab is a what-if sandbox driven by
// numbers the user types, the coach grades the household's *actual* position:
// it reads the stored data itself, scores five pillars of financial health,
// ranks the moves that would raise the score most, and records a daily snapshot
// so progress is visible over time.
//
// Scores are 0-100 per pillar; the overall score is their weighted average.
// A pillar we genuinely cannot measure (no transactions logged, no accounts
// added) is marked `unknown` and left out of the average rather than counted as
// a zero — an unmeasured area shouldn't look like a failing one.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Guidelines the scoring is calibrated against.
const TARGET_SAVINGS_RATE = 0.2; // save 20% of income
const EMERGENCY_MONTHS = 6; // 6 months of expenses in liquid cash
const DEBT_ZERO_AT_MONTHS = 3; // cc debt worth 3 months of income scores 0
const RETIREMENT_REPLACEMENT = 0.8; // cover 80% of today's expenses
const SAFE_WITHDRAWAL = 0.04; // 4% rule, matches planning.ts

// Liquid cash for the emergency-fund pillar. Mirrors the types in
// src/accountTypes.ts, which is client-only (it also carries UI labels) and so
// can't be imported here.
const CASH_TYPES = new Set(['checking', 'savings']);

// Discretionary categories — the ones where month-to-month choices actually move
// the needle. Same set the trends engine targets.
const DISCRETIONARY = new Set(['food', 'transport', 'entertainment', 'shopping', 'general']);

// Only discretionary categories can surface in a coach message, so the French
// names for those five are all that's needed here.
const CATEGORY_FR: Record<string, string> = {
  food: 'Alimentation',
  transport: 'Transport',
  entertainment: 'Divertissement',
  shopping: 'Achats',
  general: 'Général',
};
const categoryLabel = (key: string, fr: boolean) =>
  fr ? CATEGORY_FR[key] ?? key : key.charAt(0).toUpperCase() + key.slice(1);

// A score built on one measurable pillar isn't a verdict on anyone's finances.
// Below this much measurable weight the coach reports coverage and next steps
// instead of a grade — otherwise someone who has only entered a paycheck is
// told their finances are "Excellent".
const GRADE_MIN_WEIGHT = 60;

type Status = 'good' | 'attention' | 'urgent' | 'unknown';

type Move = {
  title: string;
  detail: string;
  points: number; // overall-score points this move can win back
  monthly: number | null; // $/mo it frees or requires, when that applies
  tab: string | null; // where in the app to act on it
};

type Pillar = {
  key: string;
  label: string;
  weight: number;
  score: number;
  status: Status;
  headline: string;
  detail: string;
  move: Move | null;
};

// Money formatted without relying on non-English ICU data in the Convex
// runtime — same approach as budget.ts.
function money(n: number, fr: boolean) {
  const en = Math.round(n).toLocaleString('en-US');
  return fr ? `${en.replace(/,/g, ' ')} $` : `$${en}`;
}

const todayUtc = () => new Date(Date.now()).toISOString().slice(0, 10);

// Everything the scoring needs, read once.
async function loadFacts(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const [accounts, sources, recurring, txns, plans] = await Promise.all([
    ctx.db.query('accounts').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
    ctx.db.query('incomeSources').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
    ctx.db.query('recurringExpenses').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
    ctx.db.query('transactions').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
    ctx.db.query('retirementPlan').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
  ]);

  const month = todayUtc().slice(0, 7);

  let monthlyIncome = 0;
  for (const s of sources) monthlyIncome += toMonthly(s.amount, s.frequency);

  let recurringMonthly = 0;
  for (const r of recurring) recurringMonthly += toMonthly(r.amount, r.frequency);

  let oneOffThisMonth = 0;
  for (const t of txns) {
    if (t.amount < 0 && t.date.startsWith(month)) oneOffThisMonth += Math.abs(t.amount);
  }

  const monthlyExpenses = recurringMonthly + oneOffThisMonth;
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);
  const cash = accounts
    .filter((a) => CASH_TYPES.has(a.type))
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
  // Credit cards store what's owed as a negative balance.
  const creditCardDebt = accounts
    .filter((a) => a.type === 'credit' && a.balance < 0)
    .reduce((s, a) => s - a.balance, 0);

  return {
    accounts,
    plans,
    txns,
    monthlyIncome,
    monthlyExpenses,
    surplus: monthlyIncome - monthlyExpenses,
    netWorth,
    cash,
    creditCardDebt,
    hasExpenseTxns: txns.some((t) => t.amount < 0),
  };
}

// Per-category overspend vs. its own trailing baseline, over the last 6 months.
// Condensed from trends.ts: the coach only needs the total overspend and the
// worst category, not the full per-month series.
function overspend(txns: { amount: number; date: string; category: string }[]) {
  const months: string[] = [];
  const now = new Date(Date.now());
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  for (let i = 0; i < 6; i++) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  months.reverse();

  const idx = new Map(months.map((mo, i) => [mo, i]));
  const byCat = new Map<string, number[]>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const i = idx.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    let arr = byCat.get(t.category);
    if (!arr) {
      arr = new Array(months.length).fill(0);
      byCat.set(t.category, arr);
    }
    arr[i] += Math.abs(t.amount);
  }

  let total = 0;
  let worst: { category: string; over: number } | null = null;
  for (const [category, series] of byCat) {
    if (!DISCRETIONARY.has(category)) continue;
    const latest = series[series.length - 1];
    const prior = series.slice(0, -1).filter((n) => n > 0);
    if (!prior.length) continue;
    const baseline = prior.reduce((a, b) => a + b, 0) / prior.length;
    const over = latest - baseline;
    if (over > baseline * 0.05) {
      total += over;
      if (!worst || over > worst.over) worst = { category, over: round2(over) };
    }
  }
  return { total: round2(total), worst };
}

// The extra monthly contribution that would close a retirement gap, solved from
// the future-value-of-an-annuity factor using the plan's own assumptions.
function contributionToClose(gapMonthly: number, annualReturn: number, years: number) {
  const neededFv = (gapMonthly * 12) / SAFE_WITHDRAWAL;
  const r = annualReturn / 12;
  const n = Math.round(years * 12);
  if (n <= 0) return null;
  const factor = r === 0 ? n : (Math.pow(1 + r, n) - 1) / r;
  if (factor <= 0) return null;
  return round2(neededFv / factor);
}

// Score every pillar and rank the moves. Shared by the query and the snapshot
// mutation so a recorded score is always the one the engine computed, never a
// number handed in by the client.
async function assess(ctx: QueryCtx | MutationCtx, userId: Id<'users'>, lang: 'en' | 'fr') {
  const fr = lang === 'fr';
  const f = await loadFacts(ctx, userId);
  const fmt = (n: number) => money(n, fr);
  const mo = fr ? '/mois' : '/mo';

  // Nothing to grade yet — the UI shows a setup prompt instead of a score.
  if (f.monthlyIncome === 0 && f.monthlyExpenses === 0 && f.accounts.length === 0) {
    return {
      ready: false as const,
      graded: false,
      score: 0,
      grade: '—',
      band: fr ? 'À configurer' : 'Not set up',
      tracked: 0,
      trackedTotal: 5,
      pillars: [] as Pillar[],
      moves: [] as Move[],
      surplus: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      netWorth: 0,
    };
  }

  const pillars: Pillar[] = [];

  // 1. Cash flow — the engine of everything else, so it carries the most weight.
  {
    const rate = f.monthlyIncome > 0 ? f.surplus / f.monthlyIncome : 0;
    const known = f.monthlyIncome > 0;
    const score = known ? clamp01(rate / TARGET_SAVINGS_RATE) * 100 : 0;
    const gap = round2(TARGET_SAVINGS_RATE * f.monthlyIncome - f.surplus);
    const pctLabel = `${Math.round(rate * 100)}${fr ? ' %' : '%'}`;
    pillars.push({
      key: 'cashflow',
      label: fr ? 'Flux de trésorerie' : 'Cash flow',
      weight: 25,
      score: round2(score),
      status: !known ? 'unknown' : rate <= 0 ? 'urgent' : rate >= TARGET_SAVINGS_RATE ? 'good' : 'attention',
      headline: known
        ? fr
          ? `Vous épargnez ${pctLabel} de vos revenus`
          : `You keep ${pctLabel} of what you earn`
        : fr
        ? 'Aucun revenu enregistré'
        : 'No income recorded yet',
      detail: known
        ? fr
          ? `${fmt(f.monthlyIncome)}${mo} de revenus, ${fmt(f.monthlyExpenses)}${mo} de dépenses — un excédent de ${fmt(f.surplus)}${mo}. La cible est de 20 %.`
          : `${fmt(f.monthlyIncome)}${mo} in, ${fmt(f.monthlyExpenses)}${mo} out — a ${fmt(f.surplus)}${mo} surplus. The target is 20%.`
        : fr
        ? 'Ajoutez vos sources de revenu pour que le coach puisse évaluer votre trésorerie.'
        : 'Add your income sources so the coach can grade your cash flow.',
      move: !known
        ? {
            title: fr ? 'Ajoutez vos sources de revenu' : 'Add your income sources',
            detail: fr
              ? 'Le coach ne peut rien évaluer sans revenus. Ajoutez chaque salaire et sa fréquence dans l’onglet Budget.'
              : 'The coach can grade nothing without income. Add each paycheck and its frequency in the Budget tab.',
            points: 25,
            monthly: null,
            tab: 'budget',
          }
        : gap > 0
        ? {
            title:
              f.surplus <= 0
                ? fr
                  ? `Comblez votre déficit de ${fmt(-f.surplus)}${mo}`
                  : `Close your ${fmt(-f.surplus)}${mo} shortfall`
                : fr
                ? `Libérez ${fmt(gap)}${mo} de plus`
                : `Free up ${fmt(gap)}${mo} more each month`,
            detail:
              f.surplus <= 0
                ? fr
                  ? 'Vous dépensez plus que vous ne gagnez. Rien d’autre ne progressera tant que ce n’est pas corrigé — commencez par les charges récurrentes.'
                  : 'You spend more than you earn. Nothing else improves until that flips — start with your recurring bills.'
                : fr
                ? `Cela porterait votre taux d’épargne à 20 %. Automatisez un virement le jour de paie pour épargner avant de dépenser.`
                : `That lifts your savings rate to 20%. Automate a payday transfer so it's saved before it can be spent.`,
            points: round2(((100 - score) / 100) * 25),
            monthly: round2(Math.max(gap, -f.surplus)),
            tab: 'budget',
          }
        : null,
    });
  }

  // 2. Emergency fund — liquid cash measured in months of expenses.
  {
    const known = f.accounts.length > 0 || f.cash > 0;
    const monthsCovered =
      f.monthlyExpenses > 0 ? f.cash / f.monthlyExpenses : f.cash > 0 ? EMERGENCY_MONTHS : 0;
    const target = round2(f.monthlyExpenses * EMERGENCY_MONTHS);
    const score = known ? clamp01(monthsCovered / EMERGENCY_MONTHS) * 100 : 0;
    const short = round2(Math.max(0, target - f.cash));
    pillars.push({
      key: 'emergency',
      label: fr ? 'Fonds d’urgence' : 'Emergency fund',
      weight: 20,
      score: round2(score),
      status: !known
        ? 'unknown'
        : monthsCovered >= EMERGENCY_MONTHS
        ? 'good'
        : monthsCovered >= 3
        ? 'attention'
        : 'urgent',
      headline: known
        ? fr
          ? `${monthsCovered.toFixed(1)} mois de dépenses couverts`
          : `${monthsCovered.toFixed(1)} months of expenses covered`
        : fr
        ? 'Aucun compte ajouté'
        : 'No accounts added yet',
      detail: known
        ? fr
          ? `${fmt(f.cash)} en liquide face à ${fmt(f.monthlyExpenses)}${mo} de dépenses. Une réserve de 6 mois représente ${fmt(target)}.`
          : `${fmt(f.cash)} in cash against ${fmt(f.monthlyExpenses)}${mo} of expenses. A 6-month buffer is ${fmt(target)}.`
        : fr
        ? 'Ajoutez vos comptes courants et d’épargne pour mesurer votre réserve.'
        : 'Add your checking and savings accounts to measure your buffer.',
      move:
        short > 0 || !known
          ? {
              title: !known
                ? fr
                  ? 'Ajoutez vos comptes'
                  : 'Add your accounts'
                : fr
                ? `Constituez ${fmt(short)} de réserve`
                : `Build ${fmt(short)} more of buffer`,
              detail: !known
                ? fr
                  ? 'Le coach a besoin de vos soldes pour juger votre réserve et votre dette.'
                  : 'The coach needs your balances to judge your buffer and your debt.'
                : f.surplus > 0
                ? fr
                  ? `À ${fmt(f.surplus)}${mo} d’excédent, vous y seriez en environ ${Math.ceil(short / f.surplus)} mois. Gardez-la dans un compte à haut rendement, séparé du compte courant.`
                  : `At ${fmt(f.surplus)}${mo} of surplus you'd get there in about ${Math.ceil(short / f.surplus)} months. Keep it in a high-yield account, separate from checking.`
                : fr
                ? 'Dégagez d’abord un excédent mensuel — sans lui, la réserve ne peut pas se constituer.'
                : 'Free up a monthly surplus first — without one the buffer cannot grow.',
              points: round2(((100 - score) / 100) * 20),
              monthly: null,
              tab: 'accounts',
            }
          : null,
    });
  }

  // 3. Debt — credit card balances, measured against monthly income.
  {
    const known = f.accounts.length > 0;
    const monthsOfIncome =
      f.monthlyIncome > 0 ? f.creditCardDebt / f.monthlyIncome : f.creditCardDebt > 0 ? DEBT_ZERO_AT_MONTHS : 0;
    const score = known ? clamp01(1 - monthsOfIncome / DEBT_ZERO_AT_MONTHS) * 100 : 0;
    const payoffMonths = f.surplus > 0 ? Math.ceil(f.creditCardDebt / f.surplus) : null;
    pillars.push({
      key: 'debt',
      label: fr ? 'Dette de carte' : 'Credit card debt',
      weight: 20,
      score: round2(score),
      status: !known ? 'unknown' : f.creditCardDebt === 0 ? 'good' : monthsOfIncome > 1 ? 'urgent' : 'attention',
      headline: !known
        ? fr
          ? 'Aucun compte ajouté'
          : 'No accounts added yet'
        : f.creditCardDebt === 0
        ? fr
          ? 'Aucune dette de carte'
          : 'No credit card debt'
        : fr
        ? `${fmt(f.creditCardDebt)} dus sur vos cartes`
        : `${fmt(f.creditCardDebt)} owed on cards`,
      detail: !known
        ? fr
          ? 'Ajoutez vos cartes de crédit pour que le coach puisse mesurer ce que la dette vous coûte.'
          : 'Add your credit cards so the coach can measure what debt is costing you.'
        : f.creditCardDebt === 0
          ? fr
            ? 'Rien ne grignote vos progrès à 20 % d’intérêt. Réglez le solde complet chaque mois pour que cela reste vrai.'
            : 'Nothing is eating your progress at 20% interest. Pay the full statement each month to keep it that way.'
          : fr
          ? `Soit environ ${monthsOfIncome.toFixed(1)} mois de revenus. À 20–25 % d’intérêt, rembourser bat tout placement.`
          : `That's about ${monthsOfIncome.toFixed(1)} months of income. At 20–25% interest, paying it off beats any investment.`,
      move:
        f.creditCardDebt > 0
          ? {
              title: fr ? `Remboursez ${fmt(f.creditCardDebt)}` : `Clear ${fmt(f.creditCardDebt)} of card debt`,
              detail: payoffMonths
                ? fr
                  ? `À ${fmt(f.surplus)}${mo}, vous seriez libéré en environ ${payoffMonths} mois. Attaquez la carte au taux le plus élevé d’abord.`
                  : `At ${fmt(f.surplus)}${mo} you'd be free in about ${payoffMonths} months. Attack the highest-rate card first.`
                : fr
                ? 'Dégagez d’abord un excédent mensuel, puis dirigez-le entièrement vers la carte au taux le plus élevé.'
                : 'Free up a monthly surplus first, then point all of it at the highest-rate card.',
              points: round2(((100 - score) / 100) * 20),
              monthly: null,
              tab: 'accounts',
            }
          : null,
    });
  }

  // 4. Retirement — projected 4%-rule income vs. 80% of today's expenses.
  {
    const target = round2(f.monthlyExpenses * RETIREMENT_REPLACEMENT);
    const isOnly = f.plans.length === 1;
    const projections = f.plans.map((p, i) =>
      project({
        currentAge: p.currentAge,
        retirementAge: p.retirementAge,
        // Mirrors the Retirement tab: a lone plan defaults to the household's
        // whole net worth and surplus rather than zero.
        currentSavings: p.currentSavings ?? (isOnly && i === 0 ? f.netWorth : 0),
        monthlyContribution: p.monthlyContribution ?? (isOnly && i === 0 ? Math.max(0, f.surplus) : 0),
        annualReturn: p.annualReturn,
        annualInflation: p.annualInflation,
      })
    );
    const sustainable = round2(projections.reduce((s, p) => s + p.sustainableMonthlyIncome, 0));
    const hasPlan = f.plans.length > 0;
    const known = f.monthlyExpenses > 0 || hasPlan;
    const score = !known ? 0 : !hasPlan ? 0 : target > 0 ? clamp01(sustainable / target) * 100 : 100;
    const gapMonthly = round2(Math.max(0, target - sustainable));
    const extra =
      hasPlan && gapMonthly > 0
        ? contributionToClose(gapMonthly, f.plans[0].annualReturn, projections[0]?.years ?? 0)
        : null;
    pillars.push({
      key: 'retirement',
      label: fr ? 'Retraite' : 'Retirement',
      weight: 20,
      score: round2(score),
      status: !known ? 'unknown' : !hasPlan ? 'urgent' : score >= 100 ? 'good' : score >= 60 ? 'attention' : 'urgent',
      headline: !hasPlan
        ? fr
          ? 'Aucun plan de retraite'
          : 'No retirement plan yet'
        : fr
        ? `${fmt(sustainable)}${mo} projetés à la retraite`
        : `${fmt(sustainable)}${mo} projected in retirement`,
      detail: !hasPlan
        ? fr
          ? 'Sans plan, impossible de savoir si vous êtes en avance ou en retard. Il suffit de votre âge et de l’âge de départ visé.'
          : "Without a plan there's no way to know if you're ahead or behind. All it takes is your age and a target retirement age."
        : fr
        ? `Il vous faut environ ${fmt(target)}${mo} pour maintenir 80 % de votre niveau de vie actuel.`
        : `You need about ${fmt(target)}${mo} to hold 80% of your current lifestyle.`,
      move: !hasPlan
        ? {
            title: fr ? 'Créez votre plan de retraite' : 'Create your retirement plan',
            detail: fr
              ? 'Deux champs suffisent pour obtenir une projection. Captez ensuite tout match employeur — c’est un rendement immédiat de 100 %.'
              : 'Two fields is all it takes to get a projection. Then capture any employer match — an instant 100% return.',
            points: 20,
            monthly: null,
            tab: 'retirement',
          }
        : gapMonthly > 0
        ? {
            title: extra
              ? fr
                ? `Cotisez ${fmt(extra)}${mo} de plus`
                : `Contribute ${fmt(extra)}${mo} more`
              : fr
              ? 'Augmentez vos cotisations retraite'
              : 'Raise your retirement contributions',
            detail: extra
              ? fr
                ? `Cela comblerait l’écart de ${fmt(gapMonthly)}${mo} à la retraite, aux hypothèses de votre plan. Visez 15 % du revenu au total.`
                : `That closes the ${fmt(gapMonthly)}${mo} retirement gap on your plan's own assumptions. Aim for 15% of income all in.`
              : fr
              ? `Vous projetez ${fmt(gapMonthly)}${mo} de moins que nécessaire.`
              : `You're projecting ${fmt(gapMonthly)}${mo} short of what you need.`,
            points: round2(((100 - score) / 100) * 20),
            monthly: extra,
            tab: 'retirement',
          }
        : null,
    });
  }

  // 5. Spending discipline — is spending drifting above its own baseline?
  {
    const over = overspend(f.txns);
    const known = f.hasExpenseTxns;
    const share = f.monthlyIncome > 0 ? over.total / f.monthlyIncome : 0;
    // Overspending a tenth of income wipes the pillar out.
    const score = known ? clamp01(1 - share / 0.1) * 100 : 0;
    pillars.push({
      key: 'discipline',
      label: fr ? 'Discipline de dépenses' : 'Spending discipline',
      weight: 15,
      score: round2(score),
      status: !known ? 'unknown' : over.total <= 0 ? 'good' : share > 0.05 ? 'urgent' : 'attention',
      headline: !known
        ? fr
          ? 'Aucune transaction enregistrée'
          : 'No transactions logged yet'
        : over.total <= 0
        ? fr
          ? 'Vos dépenses sont stables'
          : 'Your spending is holding steady'
        : fr
        ? `${fmt(over.total)}${mo} au-dessus de votre habitude`
        : `${fmt(over.total)}${mo} above your own average`,
      detail: !known
        ? fr
          ? 'Enregistrez vos dépenses ponctuelles pour que le coach puisse repérer les dérives.'
          : 'Log your one-off spending so the coach can spot drift as it happens.'
        : over.total <= 0
        ? fr
          ? 'Aucune catégorie discrétionnaire ne dépasse sa moyenne récente. C’est exactement ce qu’on veut voir.'
          : 'No discretionary category is running above its recent average. That is exactly what you want to see.'
        : fr
        ? `Vos catégories discrétionnaires dérivent au-dessus de leur moyenne des 6 derniers mois.`
        : `Your discretionary categories are drifting above their 6-month average.`,
      move:
        !known
          ? {
              title: fr ? 'Enregistrez vos dépenses' : 'Log your spending',
              detail: fr
                ? 'Reliez une banque ou saisissez quelques transactions — le coach a besoin d’un historique pour repérer les dérives.'
                : 'Link a bank or enter a few transactions — the coach needs history to spot drift.',
              points: 15,
              monthly: null,
              tab: 'transactions',
            }
          : over.worst
          ? {
              title: fr
                ? `Ramenez ${categoryLabel(over.worst.category, fr)} à sa moyenne`
                : `Bring ${categoryLabel(over.worst.category, fr)} back to its average`,
              detail: fr
                ? `${categoryLabel(over.worst.category, fr)} dépasse sa moyenne de ${fmt(over.worst.over)}${mo}. Y revenir libère cette somme sans rien changer d’autre.`
                : `${categoryLabel(over.worst.category, fr)} is ${fmt(over.worst.over)}${mo} above its own average. Going back frees that up without changing anything else.`,
              points: round2(((100 - score) / 100) * 15),
              monthly: over.worst.over,
              tab: 'budget',
            }
          : null,
    });
  }

  // Weighted average over the pillars we could actually measure.
  const counted = pillars.filter((p) => p.status !== 'unknown');
  const totalWeight = counted.reduce((s, p) => s + p.weight, 0);
  const score = totalWeight
    ? Math.round(counted.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight)
    : 0;

  // Too little of the picture measured to call it a grade — say so plainly
  // rather than grading whatever happens to be known.
  const graded = totalWeight >= GRADE_MIN_WEIGHT;

  const grade = !graded
    ? '—'
    : score >= 85
    ? 'A'
    : score >= 70
    ? 'B'
    : score >= 55
    ? 'C'
    : score >= 40
    ? 'D'
    : 'E';
  const band = !graded
    ? fr
      ? 'Pas encore assez de données'
      : 'Not enough to grade yet'
    : score >= 85
    ? fr ? 'Excellent' : 'Excellent'
    : score >= 70
    ? fr ? 'Solide' : 'Strong'
    : score >= 55
    ? fr ? 'Correct' : 'Fair'
    : score >= 40
    ? fr ? 'À améliorer' : 'Needs work'
    : fr ? 'Fragile' : 'At risk';

  // Rank by the points each move wins back, so the top of the list is always the
  // highest-leverage thing available.
  const moves = pillars
    .map((p) => p.move)
    .filter((m): m is Move => m !== null && m.points > 0.5)
    .sort((a, b) => b.points - a.points)
    .slice(0, 4);

  return {
    ready: true as const,
    graded,
    score,
    grade,
    band,
    tracked: counted.length,
    trackedTotal: pillars.length,
    pillars,
    moves,
    surplus: round2(f.surplus),
    monthlyIncome: round2(f.monthlyIncome),
    monthlyExpenses: round2(f.monthlyExpenses),
    netWorth: round2(f.netWorth),
  };
}

export const get = query({
  args: { lang: v.optional(v.union(v.literal('en'), v.literal('fr'))) },
  handler: async (ctx, { lang = 'en' }) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return {
        ready: false as const,
        graded: false,
        score: 0,
        grade: '—',
        band: '',
        tracked: 0,
        trackedTotal: 5,
        pillars: [] as Pillar[],
        moves: [] as Move[],
        surplus: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        netWorth: 0,
      };
    }
    return assess(ctx, userId, lang);
  },
});

// Score history, oldest → newest, for the progress chart.
export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query('coachSnapshots')
      .withIndex('by_user_date', (q) => q.eq('userId', userId))
      .collect();
    return rows
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-30)
      .map((r) => ({ date: r.date, score: r.score }));
  },
});

// Record today's score. Recomputed here rather than accepted from the client, so
// the history can't be spoofed. Re-running on the same day overwrites the row,
// which keeps one point per day however often the tab is opened.
export const recordToday = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const result = await assess(ctx, userId, 'en');
    // Don't record a score the app itself won't show — a history of provisional
    // numbers would make the progress chart lie.
    if (!result.ready || !result.graded) return null;

    const date = todayUtc();
    const pillars = result.pillars.map((p) => ({ key: p.key, score: p.score }));
    const existing = await ctx.db
      .query('coachSnapshots')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', date))
      .take(1);

    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, { score: result.score, pillars });
      return existing[0]._id;
    }
    return ctx.db.insert('coachSnapshots', { userId, date, score: result.score, pillars });
  },
});
