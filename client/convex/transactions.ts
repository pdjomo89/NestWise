import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId, getOwned } from './auth';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const txns = await ctx.db
      .query('transactions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    // Newest first: by date desc, then by creation time desc.
    return txns.sort(
      (a, b) => b.date.localeCompare(a.date) || b._creationTime - a._creationTime
    );
  },
});

export const add = mutation({
  args: {
    accountId: v.optional(v.id('accounts')),
    description: v.string(),
    category: v.optional(v.string()),
    amount: v.number(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Convex makes Date.now() deterministic within a mutation.
    const today = new Date(Date.now()).toISOString().slice(0, 10);
    return await ctx.db.insert('transactions', {
      userId,
      accountId: args.accountId,
      description: args.description,
      category: args.category ?? 'general',
      amount: args.amount,
      date: args.date && args.date.length > 0 ? args.date : today,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('transactions'),
    accountId: v.optional(v.id('accounts')),
    description: v.string(),
    category: v.string(),
    amount: v.number(),
    date: v.string(),
  },
  handler: async (ctx, { id, accountId, description, category, amount, date }) => {
    await getOwned(ctx, id);
    await ctx.db.patch(id, { accountId, description, category, amount, date });
  },
});

export const remove = mutation({
  args: { id: v.id('transactions') },
  handler: async (ctx, { id }) => {
    await getOwned(ctx, id);
    await ctx.db.delete(id);
  },
});
