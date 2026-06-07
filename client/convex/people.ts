import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const people = await ctx.db.query('people').collect();
    return people.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => ctx.db.insert('people', { name }),
});

export const rename = mutation({
  args: { id: v.id('people'), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name });
  },
});

export const remove = mutation({
  args: { id: v.id('people') },
  handler: async (ctx, { id }) => {
    // Detach this person from their income sources, then delete.
    const sources = await ctx.db
      .query('incomeSources')
      .filter((q) => q.eq(q.field('personId'), id))
      .collect();
    for (const s of sources) await ctx.db.patch(s._id, { personId: undefined });
    await ctx.db.delete(id);
  },
});
