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
    const items = await ctx.db
      .query('recurringExpenses')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return items.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const add = mutation({
  args: {
    label: v.string(),
    category: v.optional(v.string()),
    amount: v.number(),
    frequency,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return ctx.db.insert('recurringExpenses', {
      userId,
      label: args.label,
      category: args.category ?? 'general',
      amount: args.amount,
      frequency: args.frequency,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('recurringExpenses'),
    label: v.string(),
    category: v.string(),
    amount: v.number(),
    frequency,
  },
  handler: async (ctx, { id, label, category, amount, frequency }) => {
    await getOwned(ctx, id);
    await ctx.db.patch(id, { label, category, amount, frequency });
  },
});

export const remove = mutation({
  args: { id: v.id('recurringExpenses') },
  handler: async (ctx, { id }) => {
    await getOwned(ctx, id);
    await ctx.db.delete(id);
  },
});
