import { defineSchema, defineTable } from 'convex/server';
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
export default defineSchema({
  accounts: defineTable({
    name: v.string(),
    type: v.string(), // checking | savings | retirement | brokerage | iul | crypto | ...
    balance: v.number(), // current value
    contributed: v.optional(v.number()), // cost basis for investments (gain = balance - contributed)
    // Set when the account was imported from a linked bank via Plaid.
    plaidItemId: v.optional(v.string()),
    plaidAccountId: v.optional(v.string()),
  }).index('by_plaid_account', ['plaidAccountId']),

  transactions: defineTable({
    accountId: v.optional(v.id('accounts')),
    description: v.string(),
    category: v.string(),
    amount: v.number(), // positive = income, negative = expense
    date: v.string(), // YYYY-MM-DD
    // Set when imported from Plaid; used to keep syncs idempotent.
    plaidTransactionId: v.optional(v.string()),
  })
    .index('by_date', ['date'])
    .index('by_plaid_txn', ['plaidTransactionId']),

  // A linked bank connection ("Item" in Plaid terms). Holds the secret access
  // token (server-only) plus the sync cursor for incremental transaction pulls.
  plaidItems: defineTable({
    itemId: v.string(),
    accessToken: v.string(),
    institutionName: v.optional(v.string()),
    cursor: v.optional(v.string()), // transactions/sync cursor; absent = full sync
  }).index('by_item', ['itemId']),

  // Household members (e.g. the two partners of a couple).
  people: defineTable({
    name: v.string(),
  }),

  // Recurring income, owned by a person, at a given frequency.
  incomeSources: defineTable({
    personId: v.optional(v.id('people')),
    label: v.string(),
    amount: v.number(),
    frequency,
  }),

  // Recurring/fixed expenses (rent, subscriptions, insurance, ...).
  recurringExpenses: defineTable({
    label: v.string(),
    category: v.string(),
    amount: v.number(),
    frequency,
  }),

  // The saved retirement plan (a single row). Rates are decimals (0.06 = 6%).
  // currentSavings and monthlyContribution are optional overrides: when set
  // they take precedence over the live net worth / budget surplus; when absent
  // the app falls back to those live figures (keeps older rows valid too).
  retirementPlan: defineTable({
    currentAge: v.number(),
    retirementAge: v.number(),
    annualReturn: v.number(),
    annualInflation: v.number(),
    currentSavings: v.optional(v.number()),
    monthlyContribution: v.optional(v.number()),
  }),

  // UI preferences (a single row) — persisted across devices.
  preferences: defineTable({
    theme: v.union(v.literal('dark'), v.literal('light')),
    lang: v.union(v.literal('en'), v.literal('fr')),
    currency: v.optional(v.string()), // display currency code, e.g. USD/EUR
  }),
});
