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
    // ISO currency code of `balance` (e.g. USD, CAD). Absent on manual accounts,
    // which are assumed to be in the user's display currency. Set from Plaid for
    // linked accounts so mixed-currency holdings can be flagged (no FX applied).
    currency: v.optional(v.string()),
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
    // ISO currency code of `amount` (e.g. USD, CAD). Absent on manual entries,
    // which are assumed to be in the user's display currency. Set from Plaid.
    currency: v.optional(v.string()),
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
    // What sort of income this is (salary, rental, pension, ... — see
    // src/incomeTypes.ts). Optional: rows predating the picker have none.
    kind: v.optional(v.string()),
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

  // Saved retirement plans — one or more per user (e.g. one per spouse). Rates
  // are decimals (0.06 = 6%). currentSavings and monthlyContribution are
  // optional overrides: when set they take precedence over the live net worth /
  // budget surplus; when absent the app falls back to those live figures (keeps
  // older rows valid too). `label` names the plan ("You", "Spouse", …); absent
  // on legacy single-plan rows, where the UI falls back to a default name.
  retirementPlan: defineTable({
    userId: v.id('users'),
    label: v.optional(v.string()),
    currentAge: v.number(),
    retirementAge: v.number(),
    annualReturn: v.number(),
    annualInflation: v.number(),
    currentSavings: v.optional(v.number()),
    monthlyContribution: v.optional(v.number()),
    // Tax mix of the nest egg, as shares of 1 (the remainder is the taxable
    // share). Defaulted from the user's own accounts and editable per plan;
    // absent on rows saved before after-tax projection existed, which then
    // report pre-tax figures exactly as they did before.
    deferredShare: v.optional(v.number()),
    freeShare: v.optional(v.number()),
    marginalTaxRate: v.optional(v.number()), // expected rate in retirement
    // Government benefits for this person, as monthly amounts in TODAY's
    // dollars at age 65. Both are indexed, so today's dollars is the stable
    // way to store them. Start ages carry the permanent early/late adjustment.
    cppMonthly: v.optional(v.number()),
    cppStartAge: v.optional(v.number()),
    oasMonthly: v.optional(v.number()),
    oasStartAge: v.optional(v.number()),
    // Age the RRSP is converted to a RRIF. 71 is the legal deadline.
    rrifConversionAge: v.optional(v.number()),
  }).index('by_user', ['userId']),

  // Registered-plan contribution room, one row per plan per calendar year.
  //
  // `limit` is what the user tells us they have — real room includes years of
  // carry-forward that only the CRA can total up, so this is seeded from the
  // statutory annual limit and then edited from their Notice of Assessment.
  // `used` is what they've put in so far this year.
  contributionRoom: defineTable({
    userId: v.id('users'),
    kind: v.string(), // rrsp | tfsa | fhsa | resp | rdsp — see src/canada.ts
    year: v.number(), // calendar year the room applies to
    limit: v.number(),
    used: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_year', ['userId', 'year']),

  // Stripe billing state — at most one row per user, created the first time
  // they open checkout. The row is the local mirror of the Stripe subscription;
  // Stripe remains the source of truth and pushes changes via webhook (see
  // http.ts). `status` holds the raw Stripe status string so a new status Stripe
  // introduces later can't fail validation; `stripe.ts` decides which of them
  // grant Pro access.
  subscriptions: defineTable({
    userId: v.id('users'),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    // active | trialing | past_due | canceled | incomplete | unpaid | paused
    status: v.optional(v.string()),
    priceId: v.optional(v.string()),
    // The plan's base price, copied from the Stripe Price. With Adaptive
    // Pricing the buyer is charged a converted amount in their own currency,
    // so treat these as "list price" for display — the portal shows what was
    // actually billed.
    currency: v.optional(v.string()),
    amount: v.optional(v.number()), // minor units of `currency` (e.g. cents)
    interval: v.optional(v.string()), // month | year
    currentPeriodEnd: v.optional(v.number()), // epoch ms
    cancelAtPeriodEnd: v.optional(v.boolean()),
    // When the free trial ends (epoch ms), i.e. when the first charge lands.
    // Absent once the trial is over, so it can't be used to tell whether this
    // user has *ever* trialled — `stripeSubscriptionId` is what guards that.
    trialEnd: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_customer', ['stripeCustomerId']),

  // One row per day the coach was viewed, so progress can be charted over time.
  // Written by `coach.recordToday`, which recomputes the score server-side and
  // overwrites the row for the current day.
  coachSnapshots: defineTable({
    userId: v.id('users'),
    date: v.string(), // YYYY-MM-DD (UTC), matches budget.ts's month handling
    score: v.number(), // 0-100 overall
    pillars: v.array(v.object({ key: v.string(), score: v.number() })),
  }).index('by_user_date', ['userId', 'date']),

  // UI preferences (one row per user) — persisted across devices.
  preferences: defineTable({
    userId: v.id('users'),
    theme: v.union(v.literal('dark'), v.literal('light')),
    lang: v.union(v.literal('en'), v.literal('fr')),
    currency: v.optional(v.string()), // display currency code, e.g. USD/EUR
    // Where the user files taxes. Decides which account types the pickers
    // offer (RRSP/TFSA vs 401k/IRA) and which tax rules the retirement
    // projection applies. Absent on rows predating the setting — the client
    // then guesses from the browser locale and writes it back.
    country: v.optional(v.union(v.literal('CA'), v.literal('US'))),
  }).index('by_user', ['userId']),
});
