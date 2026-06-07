# Connecting a bank (Plaid)

NestWise links banks through **Plaid**. Plaid shows a secure pop-up where you
log into your bank; NestWise only ever receives a token it uses to pull
accounts and transactions server-side. Your bank credentials never touch the
app.

Plaid has three environments. NestWise uses the same code for all of them — you
only change Convex environment variables:

| Environment    | Data                | Cost | Approval                         |
| -------------- | ------------------- | ---- | -------------------------------- |
| **Sandbox**    | Fake test data      | Free | Instant                          |
| **Trial plan** | Real bank data      | Free | Auto-approved after ID check     |
| **Production** | Real bank data      | Paid | Application review               |

> Plaid retired its old **Development** environment. New accounts go straight
> from Sandbox to the **Trial plan** (real data, free, up to 10 connected banks)
> and only need full **Production** beyond 10 banks or for products outside the
> Trial bundle.

## 1. Get sandbox keys (start here)

1. Sign up at <https://dashboard.plaid.com/signup> (free).
2. Go to **Developers → Keys**.
3. Copy your **`client_id`** and the **Sandbox** **`secret`**.

## 2. Add the keys to Convex

From the `client/` directory:

```bash
npx convex env set PLAID_CLIENT_ID  your_client_id_here
npx convex env set PLAID_SECRET     your_sandbox_secret_here
# PLAID_ENV is already set to "sandbox"
```

(To verify: `npx convex env list`.)

## 3. Connect a bank (sandbox)

1. Open the app → **Accounts** tab → **+ Connect bank**.
2. Pick any institution in the Plaid pop-up.
3. Sandbox login: username **`user_good`**, password **`pass_good`**.
4. If a phone-verification screen appears, enter the code **`123456`**
   (sandbox doesn't send a real text). A bank-level MFA prompt, if shown,
   accepts **`1234`**.
5. NestWise imports the accounts and transactions; your Dashboard, Budget,
   and spending charts update automatically.
6. Use **Sync now** any time to pull new transactions.

> Sandbox data is **fake** — it never shows your real money. Use it to confirm
> the integration works, then move to the Trial plan for real data.

## 4. Going live with real bank data (Trial plan)

1. In the [Plaid Dashboard](https://dashboard.plaid.com), click
   **"Test with Real Data"** (the Trial plan / Production request prompt) and
   complete identity verification — auto-approved for most developers.
2. Copy your **Production** secret from **Developers → Keys**. Your
   **`client_id` stays the same**.
3. Point Convex at production (no code changes):

   ```bash
   npx convex env set PLAID_ENV production
   npx convex env set PLAID_SECRET your_production_secret
   ```

4. Reconnect via **Accounts → + Connect bank**, choosing **your real bank** and
   logging in with **your real credentials**.

The Trial plan lets you connect up to **10 real banks** for free. Beyond that
(or for products outside the Trial bundle) you apply for full **Production**,
which is paid.

### OAuth banks (required for most major US banks)

Most large US banks (Chase, Bank of America, Wells Fargo, …) connect via
**OAuth**: Plaid sends the browser to the bank's own site and then redirects
back to NestWise. NestWise already handles the redirect end-to-end — it passes
a `redirect_uri`, persists the Link token across the reload, and resumes the
flow on return (see `convex/plaid.ts` `createLinkToken` and
`src/components/ConnectBank.tsx`).

The redirect URL is your app's own origin with a trailing slash, e.g.:

- Local: `http://localhost:5173/`
- Codespaces: `https://<name>-5173.app.github.dev/`
- Production deploy: `https://your-domain.example/`

You must **register that exact URL** in the Plaid dashboard under
**Developers → API → Allowed redirect URIs** before connecting an OAuth bank,
or `createLinkToken` fails with an `INVALID_FIELD` / redirect-uri error. Plaid
requires HTTPS for production redirect URIs (Codespaces forwarded URLs and real
domains both qualify; plain `http://localhost` is only allowed in sandbox).

The redirect URI is only sent to Plaid when `PLAID_ENV` is **not** `sandbox`,
so sandbox testing needs no dashboard registration.
