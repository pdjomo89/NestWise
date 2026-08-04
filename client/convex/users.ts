import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireUserId } from './auth';

// How long a display name may be. Long enough for a full name, short enough to
// keep the dashboard greeting on one line.
const MAX_NAME = 40;

// The signed-in user's basic profile, or null when signed out. `name` is what
// they chose in Settings; absent until they set one.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { email: user.email ?? null, name: user.name ?? null };
  },
});

// Set (or clear) the display name. Blank removes it, so the app falls back to
// deriving one from the email.
export const setName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    const trimmed = name.trim().slice(0, MAX_NAME);
    await ctx.db.patch(userId, { name: trimmed || undefined });
  },
});
