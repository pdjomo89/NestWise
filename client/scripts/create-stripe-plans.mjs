#!/usr/bin/env node
// Create the NestWise Pro product and its two memberships (monthly + yearly)
// in Stripe, then print the commands to wire them into Convex.
//
// Stripe keeps test mode and live mode completely separate, so you run this
// twice — once with your sk_test_ key, once with sk_live_ when you go live.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-plans.mjs
//   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-plans.mjs --monthly 9 --yearly 90 --currency usd
//
// Amounts are in whole currency units (9 = $9.00). Re-running creates a second
// set of prices rather than editing the first — Stripe prices are immutable, so
// changing what you charge means making a new price and updating the env var.

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error('Set STRIPE_SECRET_KEY first:\n  STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-plans.mjs');
  process.exit(1);
}

const currency = arg('currency', 'usd').toLowerCase();
const productName = arg('name', 'NestWise Pro');
const monthly = Number(arg('monthly', '9'));
const yearly = Number(arg('yearly', '90'));

if (!Number.isFinite(monthly) || !Number.isFinite(yearly) || monthly <= 0 || yearly <= 0) {
  console.error('--monthly and --yearly must be positive numbers (whole currency units).');
  process.exit(1);
}

// Zero-decimal currencies (JPY, KRW, ...) are charged in whole units; every
// other currency is charged in minor units, so 9 becomes 900.
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);
const toMinor = (n) => Math.round(ZERO_DECIMAL.has(currency) ? n : n * 100);

function formEncode(obj, prefix = '') {
  const parts = [];
  for (const [k, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const path = prefix ? `${prefix}[${k}]` : k;
    if (typeof value === 'object') parts.push(...formEncode(value, path));
    else parts.push(`${encodeURIComponent(path)}=${encodeURIComponent(String(value))}`);
  }
  return parts;
}

async function stripe(path, body) {
  const res = await fetch('https://api.stripe.com' + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formEncode(body).join('&'),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path}: ${json.error?.message ?? res.status}`);
  }
  return json;
}

// Both secret (sk_) and restricted (rk_) keys carry the mode in the prefix.
const mode = /^[sr]k_live/.test(KEY) ? 'LIVE' : 'test';

try {
  const product = await stripe('/v1/products', {
    name: productName,
    description: 'Automatic bank sync and household retirement planning in NestWise.',
  });

  const [month, year] = await Promise.all([
    stripe('/v1/prices', {
      product: product.id,
      currency,
      unit_amount: toMinor(monthly),
      recurring: { interval: 'month' },
      nickname: 'Monthly membership',
    }),
    stripe('/v1/prices', {
      product: product.id,
      currency,
      unit_amount: toMinor(yearly),
      recurring: { interval: 'year' },
      nickname: 'Yearly membership',
    }),
  ]);

  const saving = Math.round((1 - yearly / (monthly * 12)) * 100);

  console.log(`\nCreated in ${mode} mode:\n`);
  console.log(`  Product  ${product.name}  (${product.id})`);
  console.log(`  Monthly  ${monthly} ${currency.toUpperCase()}/month  ${month.id}`);
  console.log(`  Yearly   ${yearly} ${currency.toUpperCase()}/year   ${year.id}`);
  if (saving > 0) console.log(`\n  The yearly membership saves ${saving}% versus paying monthly.`);
  else console.log(`\n  Heads up: the yearly membership isn't cheaper than 12 monthly payments.`);

  console.log(`\nNow wire them up (from client/):\n`);
  console.log(`  npx convex env set STRIPE_PRICE_ID_MONTHLY ${month.id}`);
  console.log(`  npx convex env set STRIPE_PRICE_ID_ANNUAL  ${year.id}`);
  console.log(`  npx convex env set STRIPE_SECRET_KEY       ${KEY.slice(0, 12)}...\n`);
  console.log(`Then finish the webhook + worldwide payment settings in STRIPE_SETUP.md.\n`);
} catch (e) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}
