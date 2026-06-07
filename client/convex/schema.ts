import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

// Reusable validator for a pay/charge frequency (see frequency.ts).
const frequency = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('semimonthly'),
  v.literal('monthly'),
  v.literal('annually')
);

// NestWise data model. Convex adds `_id` and `_creationTime` to every row.
// Every user-owned table carries `userId` (the owner) and a `by_user` index so
// queries can return only the signed-in user's data.
export default defineSchema({
  // Convex Auth tables (users, authSessions, authAccounts, ...).
  ...authTables,

  accounts: defineTable({
    userId: v.id('users'),
    name: v.string(),
    type: v.string(), // checking | savings | retirement | brokerage | iul | crypto | ...
    balance: v.number(), // current value
    contributed: v.optional(v.number()), // cost basis for investments (gain = balance - contributed)
    // Set when the account was imported from a linked bank via Plaid.
    plaidItemId: v.optional(v.string()),
    plaidAccountId: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_plaid_account', ['userId', 'plaidAccountId']),

  transactions: defineTable({
    userId: v.id('users'),
    accountId: v.optional(v.id('accounts')),
    description: v.string(),
    category: v.string(),
    amount: v.number(), // positive = income, negative = expense
    date: v.string(), // YYYY-MM-DD
    // Set when imported from Plaid; used to keep syncs idempotent.
    plaidTransactionId: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_user_date', ['userId', 'date'])
    .index('by_plaid_txn', ['userId', 'plaidTransactionId']),

  // A linked bank connection ("Item" in Plaid terms). Holds the secret access
  // token (server-only) plus the sync cursor for incremental transaction pulls.
  plaidItems: defineTable({
    userId: v.id('users'),
    itemId: v.string(),
    accessToken: v.string(),
    institutionName: v.optional(v.string()),
    cursor: v.optional(v.string()), // transactions/sync cursor; absent = full sync
  })
    .index('by_user', ['userId'])
    .index('by_item', ['userId', 'itemId']),

  // Household members (e.g. the two partners of a couple).
  people: defineTable({
    userId: v.id('users'),
    name: v.string(),
  }).index('by_user', ['userId']),

  // Recurring income, owned by a person, at a given frequency.
  incomeSources: defineTable({
    userId: v.id('users'),
    personId: v.optional(v.id('people')),
    label: v.string(),
    amount: v.number(),
    frequency,
  }).index('by_user', ['userId']),

  // Recurring/fixed expenses (rent, subscriptions, insurance, ...).
  recurringExpenses: defineTable({
    userId: v.id('users'),
    label: v.string(),
    category: v.string(),
    amount: v.number(),
    frequency,
  }).index('by_user', ['userId']),

  // The saved retirement plan (one row per user). Rates are decimals (0.06 = 6%).
  // currentSavings and monthlyContribution are optional overrides: when set
  // they take precedence over the live net worth / budget surplus; when absent
  // the app falls back to those live figures (keeps older rows valid too).
  retirementPlan: defineTable({
    userId: v.id('users'),
    currentAge: v.number(),
    retirementAge: v.number(),
    annualReturn: v.number(),
    annualInflation: v.number(),
    currentSavings: v.optional(v.number()),
    monthlyContribution: v.optional(v.number()),
  }).index('by_user', ['userId']),

  // UI preferences (one row per user) — persisted across devices.
  preferences: defineTable({
    userId: v.id('users'),
    theme: v.union(v.literal('dark'), v.literal('light')),
    lang: v.union(v.literal('en'), v.literal('fr')),
    currency: v.optional(v.string()), // display currency code, e.g. USD/EUR
  }).index('by_user', ['userId']),
});
