import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId } from './auth';

// Plans are one row per scenario (e.g. one per spouse) holding the assumptions
// plus the (optional) current savings and monthly contribution. When those two
// are saved they're used as-is; when absent the app falls back to live net
// worth + budget surplus. Oldest first so the list order is stable.
export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query('retirementPlan')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
  },
});

// Create a plan (no id) or update one in place (id of an owned plan). Label is
// optional so legacy callers stay valid; the UI supplies one for new plans.
export const savePlan = mutation({
  args: {
    id: v.optional(v.id('retirementPlan')),
    label: v.optional(v.string()),
    currentAge: v.number(),
    retirementAge: v.number(),
    annualReturn: v.number(), // decimal, e.g. 0.06
    annualInflation: v.number(), // decimal, e.g. 0.025
    currentSavings: v.number(),
    monthlyContribution: v.number(),
  },
  handler: async (ctx, { id, ...fields }) => {
    const userId = await requireUserId(ctx);
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.userId !== userId) throw new Error('Plan not found');
      await ctx.db.patch(id, fields);
      return id;
    }
    return ctx.db.insert('retirementPlan', { userId, ...fields });
  },
});

// Rename a plan on its own (e.g. typing a spouse's real name), without
// touching the financial fields or re-running the projection.
export const renamePlan = mutation({
  args: { id: v.id('retirementPlan'), label: v.string() },
  handler: async (ctx, { id, label }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error('Plan not found');
    await ctx.db.patch(id, { label });
  },
});

export const removePlan = mutation({
  args: { id: v.id('retirementPlan') },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error('Plan not found');
    await ctx.db.delete(id);
  },
});
