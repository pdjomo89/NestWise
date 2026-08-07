import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId } from './auth';
import { isProUser } from './stripe';

// How many retirement plans a free account can keep. Pro lifts the cap so a
// couple can model one plan each (and run side-by-side scenarios).
const FREE_PLAN_LIMIT = 1;

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
    // Optional so callers that don't model tax stay valid.
    deferredShare: v.optional(v.number()),
    freeShare: v.optional(v.number()),
    marginalTaxRate: v.optional(v.number()),
    cppMonthly: v.optional(v.number()),
    cppStartAge: v.optional(v.number()),
    oasMonthly: v.optional(v.number()),
    oasStartAge: v.optional(v.number()),
    rrifConversionAge: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const userId = await requireUserId(ctx);
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.userId !== userId) throw new Error('Plan not found');
      await ctx.db.patch(id, fields);
      return id;
    }
    // Editing an existing plan is always allowed — only *adding* beyond the
    // free cap needs Pro, so a lapsed subscriber never loses saved plans.
    const existing = await ctx.db
      .query('retirementPlan')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    if (existing.length >= FREE_PLAN_LIMIT && !(await isProUser(ctx, userId))) {
      throw new Error(
        'Multiple retirement plans are a NestWise Pro feature. Upgrade in Settings to plan for your whole household.'
      );
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
