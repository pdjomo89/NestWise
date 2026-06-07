import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

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
    const items = await ctx.db.query('recurringExpenses').collect();
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
  handler: async (ctx, args) =>
    ctx.db.insert('recurringExpenses', { ...args, category: args.category ?? 'general' }),
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
    await ctx.db.patch(id, { label, category, amount, frequency });
  },
});

export const remove = mutation({
  args: { id: v.id('recurringExpenses') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
