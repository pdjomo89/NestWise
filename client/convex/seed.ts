import { mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireUserId } from './auth';

// --- Seeding helpers (plain functions, reused by the mutations below) -------
// Each stamps the owning userId so seeded data is private to that user.

async function seedAccountsAndTransactions(ctx: MutationCtx, userId: Id<'users'>) {
  const checking = await ctx.db.insert('accounts', {
    userId,
    name: 'Everyday Checking',
    type: 'checking',
    balance: 4200,
  });
  const savings = await ctx.db.insert('accounts', {
    userId,
    name: 'Emergency Savings',
    type: 'savings',
    balance: 12000,
  });
  await ctx.db.insert('accounts', {
    userId,
    name: 'Retirement 401(k)',
    type: 'retirement',
    balance: 68000,
  });

  const txns = [
    [checking, 'Monthly salary', 'income', 5200, '2026-06-01'],
    [checking, 'Rent', 'housing', -1800, '2026-06-02'],
    [checking, 'Groceries', 'food', -420, '2026-06-03'],
    [savings, 'Transfer to savings', 'savings', 600, '2026-06-04'],
    [checking, 'Utilities', 'bills', -210, '2026-06-05'],
  ] as const;
  for (const [accountId, description, category, amount, date] of txns) {
    await ctx.db.insert('transactions', {
      userId,
      accountId,
      description,
      category,
      amount,
      date,
    });
  }
}

async function seedHouseholdData(ctx: MutationCtx, userId: Id<'users'>) {
  const alex = await ctx.db.insert('people', { userId, name: 'Alex' });
  const sam = await ctx.db.insert('people', { userId, name: 'Sam' });

  await ctx.db.insert('incomeSources', { userId, personId: alex, label: 'Salary', amount: 2500, frequency: 'biweekly' });
  await ctx.db.insert('incomeSources', { userId, personId: sam, label: 'Salary', amount: 4800, frequency: 'monthly' });
  await ctx.db.insert('incomeSources', { userId, personId: sam, label: 'Freelance', amount: 600, frequency: 'monthly' });

  const recurring = [
    ['Internet', 'bills', 60, 'monthly'],
    ['Phone plan', 'bills', 80, 'monthly'],
    ['Car insurance', 'transport', 1200, 'annually'],
    ['Gym', 'general', 40, 'monthly'],
  ] as const;
  for (const [label, category, amount, frequency] of recurring) {
    await ctx.db.insert('recurringExpenses', { userId, label, category, amount, frequency });
  }
}

async function seedRetirementPlan(ctx: MutationCtx, userId: Id<'users'>) {
  await ctx.db.insert('retirementPlan', {
    userId,
    currentAge: 30,
    retirementAge: 65,
    annualReturn: 0.06,
    annualInflation: 0.025,
  });
}

const DATA_TABLES = [
  'accounts',
  'transactions',
  'people',
  'incomeSources',
  'recurringExpenses',
  'retirementPlan',
] as const;

// Clear only the calling user's financial data (preferences are left alone).
async function clearData(ctx: MutationCtx, userId: Id<'users'>) {
  for (const table of DATA_TABLES) {
    const rows = await ctx.db
      .query(table)
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

// --- Mutations --------------------------------------------------------------

// Seed once for the signed-in user — no-ops if they already have accounts.
export const seedSampleData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query('accounts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(1);
    if (existing.length > 0) return { seeded: false };
    await seedAccountsAndTransactions(ctx, userId);
    return { seeded: true };
  },
});

// Seed the sample household once for the signed-in user — no-ops if they have people.
export const seedHousehold = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query('people')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(1);
    if (existing.length > 0) return { seeded: false };
    await seedHouseholdData(ctx, userId);
    return { seeded: true };
  },
});

// Wipe the signed-in user's financial data (NOT preferences) and restore the sample dataset.
export const resetToSample = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await clearData(ctx, userId);
    await seedAccountsAndTransactions(ctx, userId);
    await seedHouseholdData(ctx, userId);
    await seedRetirementPlan(ctx, userId);
    return { reset: true };
  },
});
