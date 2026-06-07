import { query } from './_generated/server';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query('accounts').collect();
    const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);
    return { netWorth: round2(netWorth) };
  },
});
