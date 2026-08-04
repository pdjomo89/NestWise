import { action, internalMutation, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserId, requireUserId } from './auth';

// The Convex runtime exposes env vars via process.env. The project has no
// @types/node (Convex functions don't run on Node), so declare just this.
declare const process: { env: Record<string, string | undefined> };

// ---------------------------------------------------------------------------
// Stripe REST helpers. Same approach as plaid.ts: call the JSON API directly
// with fetch instead of the Node SDK, so this runs in Convex's default runtime
// with no extra bundling. The secret key lives in a Convex env var and never
// reaches the browser — the client only ever receives a redirect URL.
// ---------------------------------------------------------------------------

const STRIPE_API = 'https://api.stripe.com';

// True once a secret key is present. Until then billing is dormant: no upgrade
// UI, and every Pro gate below stays open so the app works exactly as it did
// before Stripe was wired up (and keeps working in local dev).
export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function stripeConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      'Stripe is not configured. Set STRIPE_SECRET_KEY (and the price ids) in the Convex environment — see STRIPE_SETUP.md.'
    );
  }
  return { secretKey };
}

// Stripe takes form-encoded bodies with bracketed paths for nested data
// (`line_items[0][price]=price_123`), so flatten objects/arrays into that shape.
function formEncode(obj: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const path = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          parts.push(...formEncode(item as Record<string, unknown>, `${path}[${i}]`));
        } else {
          parts.push(
            `${encodeURIComponent(`${path}[${i}]`)}=${encodeURIComponent(String(item))}`
          );
        }
      });
    } else if (typeof value === 'object') {
      parts.push(...formEncode(value as Record<string, unknown>, path));
    } else {
      parts.push(`${encodeURIComponent(path)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

async function stripeFetch(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<any> {
  const { secretKey } = stripeConfig();
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
  let payload: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = formEncode(body ?? {}).join('&');
  }
  const res = await fetch(STRIPE_API + path, { method, headers, body: payload });
  const json = await res.json();
  if (!res.ok) {
    const err = json?.error ?? {};
    const e = new Error(
      `Stripe ${path} failed: ${err.code ?? res.status} — ${err.message ?? 'unknown error'}`
    );
    // Keep Stripe's machine-readable fields so callers can recover from
    // specific failures instead of only being able to show the message.
    (e as StripeApiError).stripeCode = err.code;
    (e as StripeApiError).stripeParam = err.param;
    throw e;
  }
  return json;
}

type StripeApiError = Error & { stripeCode?: string; stripeParam?: string };

// Stripe no longer recognises the customer we sent — deleted in the dashboard,
// or created under a different key's mode (test ids don't exist in live).
function isMissingCustomer(e: unknown): boolean {
  const err = e as StripeApiError;
  return err?.stripeCode === 'resource_missing' && err?.stripeParam === 'customer';
}

// ---------------------------------------------------------------------------
// Entitlement. Stripe is the source of truth; the `subscriptions` row is a
// local mirror kept fresh by the webhook (http.ts) and by `refresh` below.
// ---------------------------------------------------------------------------

// Statuses that grant Pro. `past_due` is included deliberately: Stripe is still
// retrying the card, and revoking access mid-dunning punishes someone whose
// card merely expired. Access ends when Stripe gives up and the subscription
// becomes `canceled` / `unpaid`.
const PRO_STATUSES = ['active', 'trialing', 'past_due'];

function rowIsPro(row: Doc<'subscriptions'> | null | undefined): boolean {
  return Boolean(row?.status && PRO_STATUSES.includes(row.status));
}

async function subscriptionRow(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const rows = await ctx.db
    .query('subscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(1);
  return rows[0] ?? null;
}

// Does this user have Pro? Always true while billing is dormant, so a
// deployment without Stripe keys behaves like the pre-billing app.
export async function isProUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>
): Promise<boolean> {
  if (!billingEnabled()) return true;
  return rowIsPro(await subscriptionRow(ctx, userId));
}

// Gate a query/mutation on Pro. `feature` names what was blocked so the UI can
// show a useful message next to the upgrade button.
export async function requireProUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  feature: string
) {
  if (!(await isProUser(ctx, userId))) {
    throw new Error(`${feature} is a NestWise Pro feature. Upgrade in Settings to unlock it.`);
  }
}

// Same gate for actions, which have no direct db access.
export async function requireProAction(ctx: ActionCtx, userId: Id<'users'>, feature: string) {
  if (!billingEnabled()) return;
  const pro: boolean = await ctx.runQuery(internal.stripe.isProInternal, { userId });
  if (!pro) {
    throw new Error(`${feature} is a NestWise Pro feature. Upgrade in Settings to unlock it.`);
  }
}

export const isProInternal = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => isProUser(ctx, userId),
});

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

// Billing state for the signed-in user, driving the whole billing UI.
// `configured` is false until Stripe keys are set, which hides the upgrade card.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const configured = billingEnabled();
    const userId = await getUserId(ctx);
    const row = userId ? await subscriptionRow(ctx, userId) : null;
    return {
      configured,
      // Signed-out callers never have Pro; signed-in ones do while billing is
      // dormant, matching isProUser so the UI and the server agree.
      pro: userId ? (!configured ? true : rowIsPro(row)) : false,
      status: row?.status ?? null,
      interval: row?.interval ?? null,
      amount: row?.amount ?? null,
      currency: row?.currency ?? null,
      currentPeriodEnd: row?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
      trialing: row?.status === 'trialing',
      trialEnd: row?.trialEnd ?? null,
      // How long a trial this user would get if they subscribed right now — 0
      // once they've had one, so the UI never advertises a trial it won't grant.
      trialDays: row?.stripeSubscriptionId ? 0 : trialPeriodDays(),
      // A Stripe customer exists, so the billing portal can be opened even
      // after the subscription ends (to see invoices or resubscribe).
      hasCustomer: Boolean(row?.stripeCustomerId),
    };
  },
});

// ---------------------------------------------------------------------------
// Public actions (called from the browser)
// ---------------------------------------------------------------------------

type PlanKey = 'monthly' | 'annual';
type PlanInfo = {
  key: PlanKey;
  priceId: string;
  amount: number | null; // minor units, in `currency`
  currency: string | null;
  interval: string | null;
};

// Length of the free trial in days — 60 (two months) unless overridden. Set
// STRIPE_TRIAL_DAYS to 0 to sell without a trial.
function trialPeriodDays(): number {
  const raw = process.env.STRIPE_TRIAL_DAYS;
  if (raw === undefined) return 60;
  const days = Number(raw);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
}

// Whether Checkout asks for a card before starting the trial. Collecting one up
// front is the default: the subscription converts by itself on day 60 instead
// of quietly lapsing, which is the whole point of a trial. Set
// STRIPE_TRIAL_REQUIRE_CARD=false to let people start with no card at all —
// more signups, far fewer conversions, and trials become easy to farm.
function trialRequiresCard(): boolean {
  return process.env.STRIPE_TRIAL_REQUIRE_CARD !== 'false';
}

function priceIdFor(plan: PlanKey): string | undefined {
  return plan === 'annual'
    ? process.env.STRIPE_PRICE_ID_ANNUAL
    : process.env.STRIPE_PRICE_ID_MONTHLY;
}

// The plans on offer, read live from Stripe so the app never shows a price that
// drifted from the dashboard. Returns [] when Stripe isn't configured yet.
//
// These are the *base* prices. With Adaptive Pricing on, Stripe converts them
// to the buyer's local currency at checkout, so the UI labels them "from".
export const listPlans = action({
  args: {},
  handler: async (): Promise<PlanInfo[]> => {
    if (!billingEnabled()) return [];
    const plans: PlanInfo[] = [];
    for (const key of ['monthly', 'annual'] as PlanKey[]) {
      const priceId = priceIdFor(key);
      if (!priceId) continue;
      try {
        const price = await stripeFetch('GET', `/v1/prices/${priceId}`);
        plans.push({
          key,
          priceId,
          amount: typeof price.unit_amount === 'number' ? price.unit_amount : null,
          currency: price.currency ?? null,
          interval: price.recurring?.interval ?? null,
        });
      } catch {
        // A mistyped or deleted price id shouldn't blank the whole page — skip
        // it; checkout for that plan will surface the real error if attempted.
      }
    }
    return plans;
  },
});

// Where Stripe sends the browser back. APP_URL wins when set so a stolen
// `origin` can't turn checkout into an open redirect; without it we fall back
// to the caller's origin, which keeps localhost dev working with zero config.
function returnOrigin(clientOrigin?: string): string {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (clientOrigin && /^https?:\/\//.test(clientOrigin)) return clientOrigin.replace(/\/+$/, '');
  return 'http://localhost:5173';
}

// Start a subscription. Returns a Stripe-hosted Checkout URL for the browser to
// redirect to; card details never touch NestWise.
export const createCheckoutSession = action({
  args: {
    plan: v.union(v.literal('monthly'), v.literal('annual')),
    origin: v.optional(v.string()),
  },
  handler: async (ctx, { plan, origin }): Promise<{ url: string }> => {
    const userId = await requireUserId(ctx);
    const priceId = priceIdFor(plan);
    if (!priceId) {
      throw new Error(
        `No Stripe price configured for the ${plan} plan. Set STRIPE_PRICE_ID_${plan.toUpperCase()} in the Convex environment.`
      );
    }

    const existing = await ctx.runQuery(internal.stripe.byUserInternal, { userId });
    if (existing?.status && PRO_STATUSES.includes(existing.status)) {
      throw new Error('You already have an active NestWise Pro subscription.');
    }

    const freshCustomer = async (): Promise<string> => {
      const email = await ctx.runQuery(internal.stripe.userEmailInternal, { userId });
      const customer = await stripeFetch('POST', '/v1/customers', {
        email: email ?? undefined,
        metadata: { userId },
      });
      const id = customer.id as string;
      await ctx.runMutation(internal.stripe.setCustomer, { userId, stripeCustomerId: id });
      return id;
    };

    // Reuse this user's Stripe customer so their payment methods and invoice
    // history follow them across resubscribes.
    let customerId = existing?.stripeCustomerId ?? (await freshCustomer());

    // One trial per user, ever. Cancelling clears `status` but keeps
    // `stripeSubscriptionId`, so a previous subscriber resubscribing pays from
    // day one rather than farming a fresh two months each time.
    const trialDays = trialPeriodDays();
    const grantTrial = trialDays > 0 && !existing?.stripeSubscriptionId;
    const requireCard = trialRequiresCard();

    const base = returnOrigin(origin);
    // Opt-in: both need one-time setup in the Stripe dashboard, and sending
    // them before that setup exists makes Stripe reject the session.
    const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === 'true';
    const adaptivePricing = process.env.STRIPE_ADAPTIVE_PRICING;

    const buildSession = (customer: string) => ({
      mode: 'subscription',
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancelled`,
      client_reference_id: userId,
      // Carried onto the subscription so the webhook can find the owner even if
      // the customer row hasn't landed yet.
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
        ...(grantTrial
          ? {
              trial_period_days: trialDays,
              // Only reachable when we didn't ask for a card: end the trial
              // instead of piling up an invoice nobody can pay.
              ...(requireCard
                ? {}
                : { trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } }),
            }
          : {}),
      },
      // Skips the card form entirely for a trial started without one.
      ...(grantTrial && !requireCard ? { payment_method_collection: 'if_required' } : {}),
      allow_promotion_codes: true,
      // Collect an address worldwide: needed for tax, and it improves the
      // acceptance rate on international cards.
      billing_address_collection: automaticTax ? 'required' : 'auto',
      ...(automaticTax
        ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' } }
        : {}),
      // Omitting payment_method_types lets Stripe offer every method enabled in
      // the dashboard, chosen per country — iDEAL, SEPA, Bancontact, cards, etc.
      ...(adaptivePricing ? { adaptive_pricing: { enabled: adaptivePricing === 'true' } } : {}),
    });

    let session;
    try {
      session = await stripeFetch('POST', '/v1/checkout/sessions', buildSession(customerId));
    } catch (e) {
      // A stored customer id Stripe no longer knows — deleted in the dashboard,
      // or a test-mode id left behind after switching to a live key. Without
      // this the user could never pay again, and the error would be opaque.
      // Note the trial decision above is unaffected: it keys off the stored
      // subscription id, so a replacement customer earns no second trial.
      if (!isMissingCustomer(e)) throw e;
      customerId = await freshCustomer();
      session = await stripeFetch('POST', '/v1/checkout/sessions', buildSession(customerId));
    }

    return { url: session.url as string };
  },
});

// Open Stripe's hosted billing portal — change card, switch plan, download
// invoices, cancel. Cancelling there flows back through the webhook.
export const createPortalSession = action({
  args: { origin: v.optional(v.string()) },
  handler: async (ctx, { origin }): Promise<{ url: string }> => {
    const userId = await requireUserId(ctx);
    const row = await ctx.runQuery(internal.stripe.byUserInternal, { userId });
    if (!row?.stripeCustomerId) throw new Error('No billing account yet — subscribe first.');
    const session = await stripeFetch('POST', '/v1/billing_portal/sessions', {
      customer: row.stripeCustomerId,
      return_url: `${returnOrigin(origin)}/?checkout=managed`,
    });
    return { url: session.url as string };
  },
});

// Pull the live subscription state from Stripe for this user.
//
// The webhook is the normal path, but this covers the two cases it can't: the
// success redirect racing ahead of the webhook, and local development, where
// Stripe can't reach a machine-local Convex deployment at all.
export const refresh = action({
  args: {},
  handler: async (ctx): Promise<{ pro: boolean }> => {
    const userId = await requireUserId(ctx);
    if (!billingEnabled()) return { pro: true };
    const row = await ctx.runQuery(internal.stripe.byUserInternal, { userId });
    if (!row?.stripeCustomerId) return { pro: false };

    const res = await stripeFetch(
      'GET',
      `/v1/subscriptions?customer=${encodeURIComponent(row.stripeCustomerId)}&status=all&limit=20`
    );
    const subs: any[] = res.data ?? [];
    // Prefer one that actually grants access; otherwise keep the most recent so
    // the UI can explain *why* it lapsed rather than showing nothing.
    const sub = subs.find((s) => PRO_STATUSES.includes(s.status)) ?? subs[0];
    if (!sub) {
      await ctx.runMutation(internal.stripe.clearSubscription, { userId });
      return { pro: false };
    }
    await ctx.runMutation(internal.stripe.applySubscription, {
      stripeCustomerId: row.stripeCustomerId,
      userId,
      ...fromStripeSubscription(sub),
    });
    return { pro: PRO_STATUSES.includes(sub.status) };
  },
});

// ---------------------------------------------------------------------------
// Webhook support (used by http.ts)
// ---------------------------------------------------------------------------

export async function retrieveSubscription(id: string): Promise<any> {
  return stripeFetch('GET', `/v1/subscriptions/${encodeURIComponent(id)}`);
}

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compare without leaking where the mismatch is via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verify a `Stripe-Signature` header against the raw request body, the same way
// stripe.webhooks.constructEvent does — HMAC-SHA256 over "<timestamp>.<body>",
// plus a freshness window so a captured request can't be replayed later.
// Implemented with Web Crypto because Convex's runtime has no Node crypto.
//
// The body MUST be the exact bytes Stripe sent: re-serializing parsed JSON
// changes the signature and every event fails.
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  toleranceSeconds = 300
): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const items = signatureHeader.split(',').map((part) => {
    const i = part.indexOf('=');
    return [part.slice(0, i).trim(), part.slice(i + 1).trim()] as const;
  });
  const timestamp = items.find(([k]) => k === 't')?.[1];
  const signatures = items.filter(([k]) => k === 'v1').map(([, sig]) => sig);
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = toHex(mac);
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

// Turn an untrusted string from Stripe metadata into a real user id, or null.
// normalizeId rejects anything that isn't a well-formed id for this table, so a
// tampered value can't reach ctx.db.get.
export const resolveUserId = internalQuery({
  args: { raw: v.string() },
  handler: async (ctx, { raw }) => {
    const id = ctx.db.normalizeId('users', raw);
    if (!id) return null;
    return (await ctx.db.get(id)) ? id : null;
  },
});

// ---------------------------------------------------------------------------
// Shape mapping + internal db access
// ---------------------------------------------------------------------------

// Flatten a Stripe subscription into the columns we mirror locally.
export function fromStripeSubscription(sub: any) {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  // `current_period_end` moved from the subscription onto its items in newer
  // Stripe API versions — read whichever one this account's version provides.
  const periodEnd = sub.current_period_end ?? item?.current_period_end;
  return {
    stripeSubscriptionId: sub.id as string,
    status: sub.status as string,
    priceId: price?.id as string | undefined,
    currency: price?.currency as string | undefined,
    amount: typeof price?.unit_amount === 'number' ? (price.unit_amount as number) : undefined,
    interval: price?.recurring?.interval as string | undefined,
    currentPeriodEnd: typeof periodEnd === 'number' ? periodEnd * 1000 : undefined,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    trialEnd: typeof sub.trial_end === 'number' ? sub.trial_end * 1000 : undefined,
  };
}

export const byUserInternal = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => subscriptionRow(ctx, userId),
});

export const userEmailInternal = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return user?.email ?? null;
  },
});

export const setCustomer = internalMutation({
  args: { userId: v.id('users'), stripeCustomerId: v.string() },
  handler: async (ctx, { userId, stripeCustomerId }) => {
    const existing = await subscriptionRow(ctx, userId);
    if (existing) {
      await ctx.db.patch(existing._id, { stripeCustomerId });
      return existing._id;
    }
    return ctx.db.insert('subscriptions', { userId, stripeCustomerId });
  },
});

// Should an event about `incomingId` be allowed to overwrite what the row
// currently tracks?
//
// Stripe does not guarantee event ordering, and one customer can hold several
// subscriptions over time. Someone who cancels and resubscribes before the old
// one lapses has both: the old one still winding down, the new one live. When
// the old one's `updated`/`deleted` event finally lands it must NOT be allowed
// to revoke the access the new one is paying for.
function supersedes(
  existing: Doc<'subscriptions'>,
  incomingId: string,
  incomingStatus: string
): boolean {
  // Nothing tracked yet, or this is the same subscription — normal update.
  if (!existing.stripeSubscriptionId || existing.stripeSubscriptionId === incomingId) return true;
  // A different subscription that grants access takes over.
  if (PRO_STATUSES.includes(incomingStatus)) return true;
  // A different, non-granting subscription may only write when the row isn't
  // currently holding a live one.
  return !(existing.status && PRO_STATUSES.includes(existing.status));
}

// Write subscription state, keyed by Stripe customer (all the webhook reliably
// has). `userId` is the fallback used to create the row if it's somehow missing
// — e.g. a subscription created directly in the Stripe dashboard.
export const applySubscription = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    userId: v.optional(v.id('users')),
    stripeSubscriptionId: v.string(),
    status: v.string(),
    priceId: v.optional(v.string()),
    currency: v.optional(v.string()),
    amount: v.optional(v.number()),
    interval: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    trialEnd: v.optional(v.number()),
  },
  handler: async (ctx, { stripeCustomerId, userId, ...fields }) => {
    const rows = await ctx.db
      .query('subscriptions')
      .withIndex('by_customer', (q) => q.eq('stripeCustomerId', stripeCustomerId))
      .take(1);
    const existing = rows[0] ?? (userId ? await subscriptionRow(ctx, userId) : null);
    if (existing) {
      if (!supersedes(existing, fields.stripeSubscriptionId, fields.status)) return existing._id;
      await ctx.db.patch(existing._id, { stripeCustomerId, ...fields });
      return existing._id;
    }
    if (!userId) return null; // Unknown customer — nothing safe to attach it to.
    return ctx.db.insert('subscriptions', { userId, stripeCustomerId, ...fields });
  },
});

// Mark the subscription gone but keep the customer id, so the user can reopen
// the portal for past invoices and resubscribe onto the same customer.
export const clearSubscription = internalMutation({
  args: {
    userId: v.optional(v.id('users')),
    stripeCustomerId: v.optional(v.string()),
    // Which subscription was deleted. Omitted only by `refresh`, which has
    // already established the customer has none left.
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, stripeCustomerId, stripeSubscriptionId }) => {
    let existing: Doc<'subscriptions'> | null = null;
    if (stripeCustomerId) {
      const rows = await ctx.db
        .query('subscriptions')
        .withIndex('by_customer', (q) => q.eq('stripeCustomerId', stripeCustomerId))
        .take(1);
      existing = rows[0] ?? null;
    }
    if (!existing && userId) existing = await subscriptionRow(ctx, userId);
    if (!existing) return null;
    // Ignore the death of a subscription the row has already moved on from —
    // otherwise resubscribing, then having the old subscription lapse, revokes
    // access the new one is paying for.
    if (
      stripeSubscriptionId &&
      existing.stripeSubscriptionId &&
      existing.stripeSubscriptionId !== stripeSubscriptionId
    ) {
      return null;
    }
    await ctx.db.patch(existing._id, { status: 'canceled', cancelAtPeriodEnd: false });
    return existing._id;
  },
});
