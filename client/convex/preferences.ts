import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId } from './auth';

const theme = v.union(v.literal('dark'), v.literal('light'));
const lang = v.union(v.literal('en'), v.literal('fr'));

// Preferences are one row per user. Returns null until first saved (or when the
// caller isn't signed in — the app then falls back to localStorage defaults).
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(1);
    return rows[0] ?? null;
  },
});

export const set = mutation({
  args: { theme, lang, currency: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query('preferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(1);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, args);
      return existing[0]._id;
    }
    return ctx.db.insert('preferences', { userId, ...args });
  },
});
