import { mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';

// --- Seeding helpers (plain functions, reused by the mutations below) -------

async function seedAccountsAndTransactions(ctx: MutationCtx) {
  const checking = await ctx.db.insert('accounts', {
    name: 'Everyday Checking',
    type: 'checking',
    balance: 4200,
  });
  const savings = await ctx.db.insert('accounts', {
    name: 'Emergency Savings',
    type: 'savings',
    balance: 12000,
  });
  await ctx.db.insert('accounts', {
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
    await ctx.db.insert('transactions', { accountId, description, category, amount, date });
  }
}

async function seedHouseholdData(ctx: MutationCtx) {
  const alex = await ctx.db.insert('people', { name: 'Alex' });
  const sam = await ctx.db.insert('people', { name: 'Sam' });

  await ctx.db.insert('incomeSources', { personId: alex, label: 'Salary', amount: 2500, frequency: 'biweekly' });
  await ctx.db.insert('incomeSources', { personId: sam, label: 'Salary', amount: 4800, frequency: 'monthly' });
  await ctx.db.insert('incomeSources', { personId: sam, label: 'Freelance', amount: 600, frequency: 'monthly' });

  const recurring = [
    ['Internet', 'bills', 60, 'monthly'],
    ['Phone plan', 'bills', 80, 'monthly'],
    ['Car insurance', 'transport', 1200, 'annually'],
    ['Gym', 'general', 40, 'monthly'],
  ] as const;
  for (const [label, category, amount, frequency] of recurring) {
    await ctx.db.insert('recurringExpenses', { label, category, amount, frequency });
  }
}

async function seedRetirementPlan(ctx: MutationCtx) {
  await ctx.db.insert('retirementPlan', {
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

async function clearData(ctx: MutationCtx) {
  for (const table of DATA_TABLES) {
    for (const row of await ctx.db.query(table).collect()) {
      await ctx.db.delete(row._id);
    }
  }
}

// --- Mutations --------------------------------------------------------------

// Seed once on first run — no-ops if accounts already exist.
export const seedSampleData = mutation({
  args: {},
  handler: async (ctx) => {
    if ((await ctx.db.query('accounts').take(1)).length > 0) return { seeded: false };
    await seedAccountsAndTransactions(ctx);
    return { seeded: true };
  },
});

// Seed the sample household once — no-ops if people already exist.
export const seedHousehold = mutation({
  args: {},
  handler: async (ctx) => {
    if ((await ctx.db.query('people').take(1)).length > 0) return { seeded: false };
    await seedHouseholdData(ctx);
    return { seeded: true };
  },
});

// Wipe all financial data (NOT preferences) and restore the sample dataset.
export const resetToSample = mutation({
  args: {},
  handler: async (ctx) => {
    await clearData(ctx);
    await seedAccountsAndTransactions(ctx);
    await seedHouseholdData(ctx);
    await seedRetirementPlan(ctx);
    return { reset: true };
  },
});
