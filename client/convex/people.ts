import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId, getOwned } from './auth';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const people = await ctx.db
      .query('people')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return people.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    return ctx.db.insert('people', { userId, name });
  },
});

export const rename = mutation({
  args: { id: v.id('people'), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await getOwned(ctx, id);
    await ctx.db.patch(id, { name });
  },
});

export const remove = mutation({
  args: { id: v.id('people') },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    await getOwned(ctx, id);
    // Detach this person from their income sources (within the same user), then delete.
    const sources = await ctx.db
      .query('incomeSources')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .filter((q) => q.eq(q.field('personId'), id))
      .collect();
    for (const s of sources) await ctx.db.patch(s._id, { personId: undefined });
    await ctx.db.delete(id);
  },
});
