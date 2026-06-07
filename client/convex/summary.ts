import { query } from './_generated/server';
import { getUserId } from './auth';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return { netWorth: 0 };
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);
    return { netWorth: round2(netWorth) };
  },
});
