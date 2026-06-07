import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId, getOwned } from './auth';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return accounts.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    type: v.optional(v.string()),
    balance: v.optional(v.number()),
    contributed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert('accounts', {
      userId,
      name: args.name,
      type: args.type ?? 'checking',
      balance: args.balance ?? 0,
      contributed: args.contributed,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('accounts'),
    name: v.string(),
    type: v.string(),
    balance: v.number(),
    contributed: v.optional(v.number()),
  },
  handler: async (ctx, { id, name, type, balance, contributed }) => {
    await getOwned(ctx, id);
    await ctx.db.patch(id, { name, type, balance, contributed });
  },
});

export const remove = mutation({
  args: { id: v.id('accounts') },
  handler: async (ctx, { id }) => {
    await getOwned(ctx, id);
    await ctx.db.delete(id);
  },
});
