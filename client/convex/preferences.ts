import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

const theme = v.union(v.literal('dark'), v.literal('light'));
const lang = v.union(v.literal('en'), v.literal('fr'));

// Preferences are a singleton row. Returns null until first saved.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('preferences').take(1);
    return rows[0] ?? null;
  },
});

export const set = mutation({
  args: { theme, lang, currency: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('preferences').take(1);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, args);
      return existing[0]._id;
    }
    return ctx.db.insert('preferences', args);
  },
});
