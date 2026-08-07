import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getUserId, requireUserId } from './auth';

// Contribution room for Canada's registered plans, tracked per calendar year.
//
// The app deliberately does not try to *derive* anyone's room. Real RRSP and
// TFSA room is the sum of every year's entitlement since eligibility, minus
// contributions, plus TFSA withdrawals added back, minus pension adjustments —
// figures only the CRA holds. So the user supplies the room (from their Notice
// of Assessment or CRA My Account) and this table remembers it and tracks what
// they've put in against it.

const KINDS = ['rrsp', 'tfsa', 'fhsa', 'resp', 'rdsp'];

function assertKind(kind: string) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown registered plan: ${kind}`);
}

// Every room row for a year, newest-set first. The client fills in the plans
// that have no row yet from the statutory defaults in src/canada.ts.
export const list = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query('contributionRoom')
      .withIndex('by_user_year', (q) => q.eq('userId', userId).eq('year', year))
      .collect();
  },
});

// Create or update the row for one plan and year. Negative values are rejected
// rather than clamped: a negative limit or contribution is a typo, and silently
// turning it into zero would hide the mistake.
export const set = mutation({
  args: {
    kind: v.string(),
    year: v.number(),
    limit: v.number(),
    used: v.number(),
  },
  handler: async (ctx, { kind, year, limit, used }) => {
    const userId = await requireUserId(ctx);
    assertKind(kind);
    if (!Number.isFinite(limit) || limit < 0) throw new Error('Room must be zero or more.');
    if (!Number.isFinite(used) || used < 0) throw new Error('Contributions must be zero or more.');

    const existing = await ctx.db
      .query('contributionRoom')
      .withIndex('by_user_year', (q) => q.eq('userId', userId).eq('year', year))
      .collect();
    const row = existing.find((r) => r.kind === kind);
    if (row) {
      await ctx.db.patch(row._id, { limit, used });
      return row._id;
    }
    return ctx.db.insert('contributionRoom', { userId, kind, year, limit, used });
  },
});

// Carry a plan's unused room into the next year, the way the CRA does for
// RRSP, TFSA and (within a cap) FHSA. Adds the new year's statutory
// entitlement — supplied by the caller, since that figure is indexed — to
// whatever went unused. Never overwrites a year the user has already set up.
export const carryForward = mutation({
  args: {
    kind: v.string(),
    fromYear: v.number(),
    newEntitlement: v.number(),
  },
  handler: async (ctx, { kind, fromYear, newEntitlement }) => {
    const userId = await requireUserId(ctx);
    assertKind(kind);
    if (!Number.isFinite(newEntitlement) || newEntitlement < 0) {
      throw new Error('New room must be zero or more.');
    }

    const toYear = fromYear + 1;
    const target = await ctx.db
      .query('contributionRoom')
      .withIndex('by_user_year', (q) => q.eq('userId', userId).eq('year', toYear))
      .collect();
    if (target.some((r) => r.kind === kind)) {
      throw new Error(`${toYear} is already set up for this plan.`);
    }

    const prior = await ctx.db
      .query('contributionRoom')
      .withIndex('by_user_year', (q) => q.eq('userId', userId).eq('year', fromYear))
      .collect();
    const from = prior.find((r) => r.kind === kind);
    const unused = from ? Math.max(0, from.limit - from.used) : 0;

    return ctx.db.insert('contributionRoom', {
      userId,
      kind,
      year: toYear,
      limit: unused + newEntitlement,
      used: 0,
    });
  },
});

export const remove = mutation({
  args: { id: v.id('contributionRoom') },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error('Not found');
    await ctx.db.delete(id);
  },
});
