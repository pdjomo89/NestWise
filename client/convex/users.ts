import { query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

// The signed-in user's basic profile (email), or null when signed out.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { email: user.email ?? null };
  },
});
