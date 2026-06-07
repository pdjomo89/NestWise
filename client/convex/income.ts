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
    const sources = await ctx.db.query('incomeSources').collect();
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
  handler: async (ctx, args) => ctx.db.insert('incomeSources', args),
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
    await ctx.db.patch(id, { personId, label, amount, frequency });
  },
});

export const remove = mutation({
  args: { id: v.id('incomeSources') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
