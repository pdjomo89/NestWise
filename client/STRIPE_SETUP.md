# Taking payments (Stripe)

NestWise sells a **Pro** subscription through Stripe. Users click *Upgrade* in
Settings, get redirected to Stripe's hosted Checkout page, pay, and come back
unlocked. Card details never touch NestWise — the app only ever handles a
redirect URL and a webhook.

Billing is **dormant until you set `STRIPE_SECRET_KEY`**. Without it the Pro
panel doesn't render and every Pro-gated feature stays open, so the app behaves
exactly as it did before Stripe was wired up.

## What Pro unlocks

Gates live server-side, so they can't be bypassed from the browser:

| Feature                                | Where the gate lives                 |
| -------------------------------------- | ------------------------------------ |
| Linking a bank / syncing via Plaid      | `convex/plaid.ts`                    |
| More than one retirement plan           | `convex/retirement.ts` (`FREE_PLAN_LIMIT`) |

Everything else stays free. To change the split, add or remove
`requireProAction` / `requireProUser` calls — both come from `convex/stripe.ts`.

## 1. Create the two memberships

NestWise Pro is sold as a **monthly** membership and a **yearly** one. Sign up
at <https://dashboard.stripe.com/register>, then create both — either way works:

**With the script** (fastest, and repeatable when you switch to live mode):

```bash
STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-plans.mjs \
  --monthly 9 --yearly 90 --currency usd
```

It creates the product and both recurring prices, tells you what the yearly
membership saves against monthly, and prints the exact `convex env set`
commands for step 2. Defaults are $9/month and $90/year.

**By hand:** stay in **Test mode** (toggle, top right), then **Product catalogue
→ Add product**, name it "NestWise Pro", and add two **recurring** prices — one
billed monthly, one billed yearly. Copy both price ids (`price_…`).

Either way, pick a single currency for now; step 4 is what makes it work
worldwide. Stripe prices are immutable, so changing what you charge later means
creating a new price and pointing the env var at it.

The app shows a "N% off" badge on the yearly card, calculated from the two
prices, so give the yearly membership a real discount or the badge won't appear.

## 2. Add the keys to Convex

From the `client/` directory:

```bash
npx convex env set STRIPE_SECRET_KEY        sk_test_...
npx convex env set STRIPE_PRICE_ID_MONTHLY  price_...
npx convex env set STRIPE_PRICE_ID_ANNUAL   price_...
npx convex env set APP_URL                  https://your-app.example.com
```

(Verify with `npx convex env list`.)

`APP_URL` is where Stripe sends people back after checkout. Set it in
production — it's what stops a crafted link from redirecting users somewhere
else afterwards. Leave it unset locally and the app falls back to the browser's
own origin, so `localhost:5173` just works.

| Variable                    | Required | Purpose                                        |
| --------------------------- | -------- | ---------------------------------------------- |
| `STRIPE_SECRET_KEY`         | yes      | Server API key. Also the master billing switch. |
| `STRIPE_PRICE_ID_MONTHLY`   | one of   | Monthly plan price id.                          |
| `STRIPE_PRICE_ID_ANNUAL`    | the two  | Annual plan price id.                           |
| `STRIPE_WEBHOOK_SECRET`     | yes¹     | Verifies webhook authenticity (step 3).         |
| `APP_URL`                   | prod     | Post-checkout return origin.                    |
| `STRIPE_AUTOMATIC_TAX`      | no       | `true` to collect VAT/GST (needs Stripe Tax on). |
| `STRIPE_ADAPTIVE_PRICING`   | no       | `true`/`false` to force the per-session setting. |
| `STRIPE_TRIAL_DAYS`         | no       | Free-trial length. Defaults to **60**; `0` disables. |
| `STRIPE_TRIAL_REQUIRE_CARD` | no       | `false` to start trials without a card (see below). |

¹ Without it every webhook is rejected, and subscription changes made *outside*
the app (a renewal, a failed card, cancelling in the portal) won't reach
NestWise.

## 3. Point the webhook at Convex

> **Already done for NestWise production.** The live endpoint is
> `https://outgoing-spaniel-316.convex.site/stripe/webhook`, registered in
> live mode with all seven events, and `STRIPE_WEBHOOK_SECRET` is set on the
> `outgoing-spaniel-316` deployment. The rest of this section is the recipe for
> doing it again — a new deployment, or the same thing in test mode.
>
> Note this Stripe account is shared with other apps, and **webhook endpoints
> receive events for the whole account**, not just NestWise. That's harmless
> here: the handler ignores non-subscription checkouts and silently drops
> subscription events whose customer it doesn't recognise.

Stripe pushes every subscription change to the app. The endpoint is your Convex
**site** URL (`.convex.site`, not `.convex.cloud`):

```
https://<your-deployment>.convex.site/stripe/webhook
```

1. **Developers → Webhooks → Add endpoint**, paste that URL.
2. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
3. Copy the **signing secret** (`whsec_…`) and set it:

```bash
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
```

The handler verifies the `Stripe-Signature` header (HMAC-SHA256 over the raw
body, with a 5-minute replay window) before trusting anything, and returns 400
on a bad signature so Stripe stops retrying.

## 3b. The free trial

Both memberships start with a **2-month free trial** (`STRIPE_TRIAL_DAYS`,
default `60`). Stripe runs it: the subscription is created immediately with
status `trialing`, nothing is charged, and on day 60 Stripe takes the first
payment by itself. `trialing` grants Pro exactly like `active`, so trial users
get the full app.

**One trial per user, ever.** Cancelling clears the status but keeps the Stripe
subscription id on the row, and checkout only grants a trial to a user who has
never had a subscription. Someone who cancels and comes back pays from day one.
(This is per NestWise account — it won't stop the same person signing up with a
second email. Stripe's own radar/rules are the tool for that if it becomes a
problem.)

**A card is collected up front** by default. Nothing is charged during the
trial, but the subscription converts on its own when the trial ends, which is
the point of running one. Set `STRIPE_TRIAL_REQUIRE_CARD=false` to let people
start with no card at all — expect noticeably more signups and far fewer
conversions, since most trials then simply expire. In that mode the trial is
set to cancel rather than raise an invoice nobody can pay.

To sell without any trial:

```bash
npx convex env set STRIPE_TRIAL_DAYS 0
```

Existing trials are unaffected — Stripe owns them once they've started.

Two events matter here and are already in the list above: the trial converting
shows up as `customer.subscription.updated` (status `trialing` → `active`), and
Stripe fires `customer.subscription.trial_will_end` about three days before, if
you later want to send a heads-up email.

## 4. Make it work worldwide

This is the part that decides whether someone in Amsterdam or São Paulo can
actually pay you.

**Payment methods.** In **Settings → Payment methods**, turn on the methods you
want. NestWise deliberately doesn't pin a list, so Stripe shows each buyer the
methods common where they are — cards everywhere, plus iDEAL in the
Netherlands, SEPA Direct Debit across the EU, Bancontact in Belgium, BLIK in
Poland, and so on. Note that not all of them support recurring charges; Stripe
hides those that can't.

**Adaptive Pricing.** In **Settings → Payments → Adaptive Pricing**, switch it
on. Your prices stay defined in one currency, and Stripe presents a converted
local-currency amount at checkout. Buyers see a familiar figure and avoid their
bank's foreign-transaction fee, which measurably lifts conversion. The in-app
price is labelled as a starting figure because of this.

**Tax.** If you need to collect VAT/GST, enable **Stripe Tax** (Settings →
Tax), register the jurisdictions you owe in, then set
`npx convex env set STRIPE_AUTOMATIC_TAX true`. NestWise then asks Checkout to
compute tax and requires a billing address. Leave it off until Stripe Tax is
actually configured — turning it on first makes Stripe reject the session.

**Billing portal.** In **Settings → Billing → Customer portal**, save a
configuration and allow plan switching and cancellation. The *Manage billing*
button opens it.

**Regulatory.** Stripe handles SCA / 3-D Secure for European cards
automatically on Checkout — there's nothing to add on our side.

## 5. Test it

Use Stripe's [test cards](https://docs.stripe.com/testing) in test mode:

| Card                  | Result                                  |
| --------------------- | --------------------------------------- |
| `4242 4242 4242 4242` | Succeeds                                |
| `4000 0025 0000 3155` | Requires 3-D Secure authentication      |
| `4000 0000 0000 9995` | Declined (insufficient funds)           |
| `4000 0027 6000 3184` | European card — exercises SCA           |

Any future expiry, any CVC, any postcode.

Then: **Settings → NestWise Pro → Subscribe**, pay, and you should land back in
Settings with a *Pro* badge and a renewal date.

### Local development

Stripe can't reach a Convex deployment running on your machine, so webhooks
won't arrive. Two options:

- **Do nothing.** On returning from Checkout the app calls `stripe.refresh`,
  which reads the subscription straight from Stripe. Upgrades unlock fine; only
  out-of-band changes (a renewal at 3am) won't sync until the next refresh.
- **Forward them properly** with the [Stripe CLI](https://docs.stripe.com/stripe-cli):

  ```bash
  stripe listen --forward-to http://127.0.0.1:3211/stripe/webhook
  ```

  It prints its own `whsec_…`; set that as `STRIPE_WEBHOOK_SECRET` while you
  develop. (`3211` is the local backend's site port, from
  `VITE_CONVEX_SITE_URL` in `.env.local`.)

## 6. Going live

Production (`outgoing-spaniel-316`) already has the billing code and the
webhook secret, but **billing is deliberately dormant there**: `STRIPE_SECRET_KEY`
is not set, so the Pro panel is hidden, the welcome step is skipped, and bank
linking stays open to everyone — the live app behaves exactly as it did before.

Flipping it on is one command per variable:

```bash
CONVEX_DEPLOYMENT=dev:adamant-dove-782 npx convex env set --prod \
  STRIPE_SECRET_KEY       rk_live_...
CONVEX_DEPLOYMENT=dev:adamant-dove-782 npx convex env set --prod \
  STRIPE_PRICE_ID_MONTHLY price_1U0TTDLlEtiuZlM0DYqMXdz6
CONVEX_DEPLOYMENT=dev:adamant-dove-782 npx convex env set --prod \
  STRIPE_PRICE_ID_ANNUAL  price_1U0TUeLlEtiuZlM0qZxw4bRA
CONVEX_DEPLOYMENT=dev:adamant-dove-782 npx convex env set --prod \
  APP_URL                 https://your-real-domain
```

(The `CONVEX_DEPLOYMENT` prefix names the project; `--prod` targets its
production deployment. It's needed because local dev runs on an anonymous
deployment that isn't part of the project.)

**The moment `STRIPE_SECRET_KEY` lands, existing users lose bank linking and
extra retirement plans until they subscribe or start a trial.** Decide that's
what you want before running the first command. To back it out, unset the same
variable — the gates open again immediately.

Also before charging real customers:

1. Activate the account (**Settings → Business → Activate**) — Stripe needs
   business details and a bank account before it will pay you out.
2. Set `APP_URL` to the real domain, so checkout returns to the right place.
3. Turn on the payment methods and Adaptive Pricing (section 4) — they're
   configured per mode, and live mode is separate from test.
4. Save a customer portal configuration, or *Manage billing* will error.

## How it fits together

```
Settings → Subscribe
   └─ stripe.createCheckoutSession   creates/reuses a Stripe customer,
      (convex/stripe.ts)             returns a hosted Checkout URL
         ↓ browser redirect
      Stripe Checkout                local currency + local payment methods
         ↓ pays                          ↓
   ?checkout=success              POST /stripe/webhook  (convex/http.ts)
      └─ stripe.refresh                 └─ signature verified, then
         (covers the race)                 subscriptions row updated
                        ↓
              stripe.status → Pro unlocked everywhere
```

`subscriptions` is only ever a mirror. Stripe stays the source of truth, and
`stripe.refresh` can rebuild the row from it at any time.
