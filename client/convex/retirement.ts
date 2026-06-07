import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId } from './auth';

// The plan is one row per user holding the assumptions plus the (optional)
// current savings and monthly contribution. When those two are saved they are
// used as-is; when absent the app falls back to live net worth + budget surplus.
export const getPlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const plans = await ctx.db
      .query('retirementPlan')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(1);
    return plans[0] ?? null;
  },
});

export const savePlan = mutation({
  args: {
    currentAge: v.number(),
    retirementAge: v.number(),
    annualReturn: v.number(), // decimal, e.g. 0.06
    annualInflation: v.number(), // decimal, e.g. 0.025
    currentSavings: v.number(),
    monthlyContribution: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query('retirementPlan')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(1);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, args);
      return existing[0]._id;
    }
    return ctx.db.insert('retirementPlan', { userId, ...args });
  },
});
