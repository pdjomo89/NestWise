import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId, getOwned } from './auth';

const frequency = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('semimonthly'),
  v.literal('monthly'),
  v.literal('annually')
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const sources = await ctx.db
      .query('incomeSources')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return sources.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const add = mutation({
  args: {
    personId: v.optional(v.id('people')),
    label: v.string(),
    amount: v.number(),
    frequency,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return ctx.db.insert('incomeSources', { userId, ...args });
  },
});

export const update = mutation({
  args: {
    id: v.id('incomeSources'),
    personId: v.optional(v.id('people')),
    label: v.string(),
    amount: v.number(),
    frequency,
  },
  handler: async (ctx, { id, personId, label, amount, frequency }) => {
    await getOwned(ctx, id);
    await ctx.db.patch(id, { personId, label, amount, frequency });
  },
});

export const remove = mutation({
  args: { id: v.id('incomeSources') },
  handler: async (ctx, { id }) => {
    await getOwned(ctx, id);
    await ctx.db.delete(id);
  },
});
