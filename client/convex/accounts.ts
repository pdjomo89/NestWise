import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query('accounts').collect();
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
    return await ctx.db.insert('accounts', {
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
    await ctx.db.patch(id, { name, type, balance, contributed });
  },
});

export const remove = mutation({
  args: { id: v.id('accounts') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
