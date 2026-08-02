import { query } from './_generated/server';
import { v } from 'convex/values';
import { toMonthly } from './frequency';
import { getUserId } from './auth';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// How many months of history the trend view compares (including the current one).
const MONTHS = 6;

// Categories worth targeting for cuts. Housing/bills are largely fixed, and
// savings/income aren't spending to trim — so the plan focuses on discretionary
// spend where month-to-month choices actually move the needle.
const DISCRETIONARY = new Set(['food', 'transport', 'entertainment', 'shopping', 'general']);

// The last N month keys (YYYY-MM), oldest → newest, based on the current UTC
// month (matches budget.ts, which also derives the month from UTC).
function recentMonths(n: number): string[] {
  const now = new Date(Date.now());
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-11
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out.reverse();
}

// Per-category monthly spend over the recent window, plus an auto savings plan
// derived from categories whose latest month is running above their own
// trailing baseline. Built from actual expense transactions only (recurring
// config is a current snapshot, not history, so it can't show a real trend).
export const get = query({
  args: { lang: v.optional(v.union(v.literal('en'), v.literal('fr'))) },
  handler: async (ctx, _args) => {
    const months = recentMonths(MONTHS);
    const empty = {
      months,
      categories: [] as CategoryTrend[],
      plan: { items: [] as PlanItem[], totalMonthly: 0, incomeShare: 0 },
      monthlyIncome: 0,
    };

    const userId = await getUserId(ctx);
    if (!userId) return empty;

    // Only pull transactions on/after the window start; dates are YYYY-MM-DD
    // strings so a lexicographic >= on the (userId, date) index is exact.
    const txns = await ctx.db
      .query('transactions')
      .withIndex('by_user_date', (q) => q.eq('userId', userId).gte('date', `${months[0]}-01`))
      .collect();

    const monthIndex = new Map(months.map((m, i) => [m, i]));
    const byCat = new Map<string, number[]>();
    for (const t of txns) {
      if (t.amount >= 0) continue; // expenses only
      const idx = monthIndex.get(t.date.slice(0, 7));
      if (idx === undefined) continue;
      let arr = byCat.get(t.category);
      if (!arr) {
        arr = new Array(months.length).fill(0);
        byCat.set(t.category, arr);
      }
      arr[idx] += Math.abs(t.amount);
    }

    const categories: CategoryTrend[] = [...byCat.entries()]
      .map(([category, raw]) => {
        const byMonth = raw.map(round2);
        const latest = byMonth[byMonth.length - 1];
        // Baseline = average of prior months that actually had spend, so a single
        // quiet month doesn't drag the comparison toward zero.
        const priorNonZero = byMonth.slice(0, -1).filter((v) => v > 0);
        const baseline = priorNonZero.length
          ? priorNonZero.reduce((a, b) => a + b, 0) / priorNonZero.length
          : 0;
        const delta = latest - baseline;
        const direction =
          baseline === 0
            ? latest > 0
              ? 'new'
              : 'flat'
            : delta > baseline * 0.05
            ? 'up'
            : delta < -baseline * 0.05
            ? 'down'
            : 'flat';
        return {
          category,
          byMonth,
          latest,
          baseline: round2(baseline),
          delta: round2(delta),
          direction,
          total: round2(byMonth.reduce((a, b) => a + b, 0)),
        };
      })
      .sort((a, b) => b.total - a.total);

    // Monthly income, used only to frame the plan's savings as a % of income.
    const sources = await ctx.db
      .query('incomeSources')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    let monthlyIncome = 0;
    for (const s of sources) monthlyIncome += toMonthly(s.amount, s.frequency);

    // Plan: discretionary categories running above their baseline → trim back to
    // baseline. If nothing is rising, fall back to a 10% trim on the largest
    // discretionary category so there's always an actionable suggestion.
    // Only categories the trend actually flags as rising (direction 'up' applies
    // a 5% band), so trivial fluctuations don't clutter the plan.
    const items: PlanItem[] = categories
      .filter((c) => DISCRETIONARY.has(c.category) && c.direction === 'up')
      .map((c) => ({ category: c.category, from: c.latest, to: c.baseline, save: round2(c.delta) }))
      .sort((a, b) => b.save - a.save);
    if (items.length === 0) {
      const top = categories.find((c) => DISCRETIONARY.has(c.category) && c.latest > 0);
      if (top) {
        items.push({
          category: top.category,
          from: top.latest,
          to: round2(top.latest * 0.9),
          save: round2(top.latest * 0.1),
        });
      }
    }

    const totalMonthly = round2(items.reduce((a, b) => a + b.save, 0));
    const incomeShare = monthlyIncome > 0 ? round2(totalMonthly / monthlyIncome) : 0;

    return {
      months,
      categories,
      plan: { items, totalMonthly, incomeShare },
      monthlyIncome: round2(monthlyIncome),
    };
  },
});

type CategoryTrend = {
  category: string;
  byMonth: number[];
  latest: number;
  baseline: number;
  delta: number;
  direction: string;
  total: number;
};

type PlanItem = { category: string; from: number; to: number; save: number };
