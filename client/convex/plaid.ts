import { action, internalAction, internalMutation, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { getUserId, requireUserId } from './auth';

// The Convex runtime exposes env vars via process.env. The project has no
// @types/node (Convex functions don't run on Node), so declare just this.
declare const process: { env: Record<string, string | undefined> };

// Shared result shape for the import actions; annotated explicitly so the
// actions that call each other via ctx.runAction don't hit circular inference.
type SyncResult = { items: number; imported: number; removed: number };

// ---------------------------------------------------------------------------
// Plaid REST helpers. We call the JSON API directly with fetch (available in
// Convex actions) instead of the Node SDK, so this runs in the default runtime
// with no extra bundling. Secrets live in Convex env vars — never the client.
// ---------------------------------------------------------------------------

function plaidConfig() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? 'sandbox').toLowerCase();
  if (!clientId || !secret) {
    throw new Error(
      'Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET (and optionally PLAID_ENV) in the Convex environment.'
    );
  }
  const base =
    env === 'production'
      ? 'https://production.plaid.com'
      : env === 'development'
      ? 'https://development.plaid.com'
      : 'https://sandbox.plaid.com';
  return { clientId, secret, base, env };
}

async function plaidFetch(path: string, body: Record<string, unknown>) {
  const { clientId, secret, base } = plaidConfig();
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Plaid ${path} failed: ${json.error_code ?? res.status} — ${json.error_message ?? 'unknown error'}`
    );
  }
  return json;
}

// ---------------------------------------------------------------------------
// Mapping from Plaid shapes to NestWise's account/transaction model.
// ---------------------------------------------------------------------------

// Plaid amount convention: positive = money leaving the account (spending),
// negative = money entering (income/refund). NestWise uses the opposite
// (positive = income, negative = expense), so we negate.
const toNestAmount = (plaidAmount: number) => -plaidAmount;

// Map Plaid's personal_finance_category.primary to a NestWise category key.
function mapCategory(primary?: string): string {
  switch (primary) {
    case 'INCOME':
      return 'income';
    case 'FOOD_AND_DRINK':
      return 'food';
    case 'TRANSPORTATION':
    case 'TRAVEL':
      return 'transport';
    case 'RENT_AND_UTILITIES':
      return 'housing';
    case 'LOAN_PAYMENTS':
    case 'BANK_FEES':
      return 'bills';
    case 'TRANSFER_IN':
    case 'TRANSFER_OUT':
      return 'savings';
    default:
      return 'general';
  }
}

// Map a Plaid account to a NestWise account type. Credit/loan balances are
// debts, so we store them as negative toward net worth.
function mapAccountTypeAndBalance(plaidType: string, subtype: string | null, current: number) {
  const sub = (subtype ?? '').toLowerCase();
  if (plaidType === 'depository') {
    if (sub === 'savings') return { type: 'savings', balance: current };
    return { type: 'checking', balance: current };
  }
  if (plaidType === 'investment') return { type: 'brokerage', balance: current };
  if (plaidType === 'credit' || plaidType === 'loan') {
    return { type: 'other', balance: -Math.abs(current) };
  }
  return { type: 'other', balance: current };
}

// ---------------------------------------------------------------------------
// Public actions (called from the browser). All require a signed-in user so
// every connection and imported row is owned by that user.
// ---------------------------------------------------------------------------

// Create a Link token used to open Plaid Link in the browser.
//
// `redirectUri` is the app URL Plaid sends the browser back to after an OAuth
// bank login (most major US banks). It must EXACTLY match an "Allowed redirect
// URI" registered in the Plaid dashboard. We only attach it outside sandbox.
export const createLinkToken = action({
  args: { redirectUri: v.optional(v.string()) },
  handler: async (ctx, { redirectUri }) => {
    const userId = await requireUserId(ctx);
    const { env } = plaidConfig();
    const useOAuthRedirect = redirectUri && env !== 'sandbox';
    const res = await plaidFetch('/link/token/create', {
      client_name: 'NestWise',
      // Scope Plaid's user to our user so re-links map to the same Plaid user.
      user: { client_user_id: userId },
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      ...(useOAuthRedirect ? { redirect_uri: redirectUri } : {}),
    });
    return { linkToken: res.link_token as string };
  },
});

// Exchange the public token from Link for a permanent access token, store the
// connection for this user, then immediately pull accounts + transactions.
export const exchangePublicToken = action({
  args: { publicToken: v.string(), institutionName: v.optional(v.string()) },
  handler: async (ctx, { publicToken, institutionName }): Promise<SyncResult> => {
    const userId = await requireUserId(ctx);
    const res = await plaidFetch('/item/public_token/exchange', {
      public_token: publicToken,
    });
    await ctx.runMutation(internal.plaid.storeItem, {
      userId,
      itemId: res.item_id,
      accessToken: res.access_token,
      institutionName,
    });
    return await ctx.runAction(internal.plaid.syncCore, { userId });
  },
});

// Re-pull accounts + transactions for this user's connected banks ("Sync now").
export const sync = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    const userId = await requireUserId(ctx);
    return await ctx.runAction(internal.plaid.syncCore, { userId });
  },
});

// Remove one of this user's connections at Plaid and locally (keeps imported rows).
export const disconnect = action({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.runQuery(internal.plaid.getItemByItemId, { userId, itemId });
    if (!item) return { removed: false };
    try {
      await plaidFetch('/item/remove', { access_token: item.accessToken });
    } catch {
      // If Plaid removal fails (e.g. already gone), still drop it locally.
    }
    await ctx.runMutation(internal.plaid.deleteItem, { userId, itemId });
    return { removed: true };
  },
});

// Lightweight, token-free view of THIS user's connections for the UI.
export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const items = await ctx.db
      .query('plaidItems')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return items.map((i) => ({
      itemId: i.itemId,
      institutionName: i.institutionName ?? 'Bank',
      accountCount: accounts.filter((a) => a.plaidItemId === i.itemId).length,
      lastSynced: i.cursor ? true : false,
    }));
  },
});

// ---------------------------------------------------------------------------
// Internal action: the actual fetch-and-store loop, shared by exchange + sync.
// Scoped to one user (passed in from the public actions, which authenticated).
// ---------------------------------------------------------------------------

export const syncCore = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<SyncResult> => {
    const items = await ctx.runQuery(internal.plaid.getItems, { userId });
    let imported = 0;
    let removedCount = 0;
    for (const item of items) {
      // Accounts (balances + names).
      const acctRes = await plaidFetch('/accounts/get', { access_token: item.accessToken });
      const accounts = (acctRes.accounts as any[]).map((a) => {
        const { type, balance } = mapAccountTypeAndBalance(
          a.type,
          a.subtype,
          a.balances?.current ?? 0
        );
        return {
          plaidItemId: item.itemId,
          plaidAccountId: a.account_id as string,
          name: a.name as string,
          type,
          balance,
        };
      });

      // Transactions — incremental sync, paginated until has_more is false.
      let cursor: string | undefined = item.cursor ?? undefined;
      const added: any[] = [];
      const modified: any[] = [];
      const removed: string[] = [];
      let hasMore = true;
      while (hasMore) {
        const res = await plaidFetch('/transactions/sync', {
          access_token: item.accessToken,
          cursor,
          count: 500,
        });
        added.push(...res.added);
        modified.push(...res.modified);
        removed.push(...res.removed.map((r: any) => r.transaction_id));
        cursor = res.next_cursor;
        hasMore = res.has_more;
      }

      const mapTxn = (t: any) => ({
        plaidTransactionId: t.transaction_id as string,
        plaidAccountId: t.account_id as string,
        description: (t.merchant_name || t.name || 'Transaction') as string,
        category: mapCategory(t.personal_finance_category?.primary),
        amount: toNestAmount(t.amount),
        date: t.date as string,
      });

      const result = await ctx.runMutation(internal.plaid.applySync, {
        userId,
        plaidItemId: item.itemId,
        accounts,
        added: added.map(mapTxn),
        modified: modified.map(mapTxn),
        removed,
        cursor,
      });
      imported += result.upserted;
      removedCount += result.removed;
    }
    return { items: items.length, imported, removed: removedCount };
  },
});

// ---------------------------------------------------------------------------
// Internal queries / mutations (db access for the actions above). All scoped
// to the userId passed in by the authenticated public action.
// ---------------------------------------------------------------------------

export const getItems = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('plaidItems')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect(),
});

export const getItemByItemId = internalQuery({
  args: { userId: v.id('users'), itemId: v.string() },
  handler: async (ctx, { userId, itemId }) => {
    const rows = await ctx.db
      .query('plaidItems')
      .withIndex('by_item', (q) => q.eq('userId', userId).eq('itemId', itemId))
      .take(1);
    return rows[0] ?? null;
  },
});

export const storeItem = internalMutation({
  args: {
    userId: v.id('users'),
    itemId: v.string(),
    accessToken: v.string(),
    institutionName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('plaidItems')
      .withIndex('by_item', (q) => q.eq('userId', args.userId).eq('itemId', args.itemId))
      .take(1);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, {
        accessToken: args.accessToken,
        institutionName: args.institutionName ?? existing[0].institutionName,
      });
      return existing[0]._id;
    }
    return ctx.db.insert('plaidItems', args);
  },
});

export const deleteItem = internalMutation({
  args: { userId: v.id('users'), itemId: v.string() },
  handler: async (ctx, { userId, itemId }) => {
    const rows = await ctx.db
      .query('plaidItems')
      .withIndex('by_item', (q) => q.eq('userId', userId).eq('itemId', itemId))
      .take(1);
    if (rows[0]) await ctx.db.delete(rows[0]._id);
  },
});

const acctArg = v.object({
  plaidItemId: v.string(),
  plaidAccountId: v.string(),
  name: v.string(),
  type: v.string(),
  balance: v.number(),
});
const txnArg = v.object({
  plaidTransactionId: v.string(),
  plaidAccountId: v.string(),
  description: v.string(),
  category: v.string(),
  amount: v.number(),
  date: v.string(),
});

// Apply one sync's worth of accounts + transactions atomically for one user,
// keeping rows idempotent via the (userId, plaidAccountId/plaidTransactionId) keys.
export const applySync = internalMutation({
  args: {
    userId: v.id('users'),
    plaidItemId: v.string(),
    accounts: v.array(acctArg),
    added: v.array(txnArg),
    modified: v.array(txnArg),
    removed: v.array(v.string()),
    cursor: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { userId, plaidItemId, accounts, added, modified, removed, cursor }
  ): Promise<{ upserted: number; removed: number }> => {
    // Upsert accounts and build a plaidAccountId -> Convex _id map.
    const idByPlaid = new Map<string, any>();
    for (const a of accounts) {
      const existing = await ctx.db
        .query('accounts')
        .withIndex('by_plaid_account', (q) =>
          q.eq('userId', userId).eq('plaidAccountId', a.plaidAccountId)
        )
        .take(1);
      if (existing[0]) {
        await ctx.db.patch(existing[0]._id, {
          name: a.name,
          type: a.type,
          balance: a.balance,
          plaidItemId: a.plaidItemId,
        });
        idByPlaid.set(a.plaidAccountId, existing[0]._id);
      } else {
        const id = await ctx.db.insert('accounts', {
          userId,
          name: a.name,
          type: a.type,
          balance: a.balance,
          plaidItemId: a.plaidItemId,
          plaidAccountId: a.plaidAccountId,
        });
        idByPlaid.set(a.plaidAccountId, id);
      }
    }

    let upserted = 0;
    for (const t of [...added, ...modified]) {
      const accountId = idByPlaid.get(t.plaidAccountId);
      const existing = await ctx.db
        .query('transactions')
        .withIndex('by_plaid_txn', (q) =>
          q.eq('userId', userId).eq('plaidTransactionId', t.plaidTransactionId)
        )
        .take(1);
      const fields = {
        accountId,
        description: t.description,
        category: t.category,
        amount: t.amount,
        date: t.date,
        plaidTransactionId: t.plaidTransactionId,
      };
      if (existing[0]) await ctx.db.patch(existing[0]._id, fields);
      else await ctx.db.insert('transactions', { userId, ...fields });
      upserted++;
    }

    let removedCount = 0;
    for (const txnId of removed) {
      const existing = await ctx.db
        .query('transactions')
        .withIndex('by_plaid_txn', (q) =>
          q.eq('userId', userId).eq('plaidTransactionId', txnId)
        )
        .take(1);
      if (existing[0]) {
        await ctx.db.delete(existing[0]._id);
        removedCount++;
      }
    }

    // Save the cursor so the next sync only fetches new changes.
    const item = await ctx.db
      .query('plaidItems')
      .withIndex('by_item', (q) => q.eq('userId', userId).eq('itemId', plaidItemId))
      .take(1);
    if (item[0]) await ctx.db.patch(item[0]._id, { cursor });

    return { upserted, removed: removedCount };
  },
});
