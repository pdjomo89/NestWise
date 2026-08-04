import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { auth } from './auth';
import {
  fromStripeSubscription,
  retrieveSubscription,
  verifyWebhookSignature,
} from './stripe';

const http = httpRouter();

auth.addHttpRoutes(http);

// Stripe webhook — the authoritative channel for subscription changes. Stripe
// posts here on every lifecycle event (payment succeeded, card declined, plan
// switched, cancelled), so entitlement stays correct without the user ever
// returning to the app.
//
// Endpoint URL to register in the Stripe dashboard:
//   <your Convex site URL>/stripe/webhook
// (the .convex.site domain, not .convex.cloud — see STRIPE_SETUP.md).
http.route({
  path: '/stripe/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    // Raw text, never request.json(): the signature covers these exact bytes.
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    const valid = await verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      // 400 tells Stripe not to keep retrying a request we'll never accept.
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const object = event.data?.object ?? {};

    // Metadata carries the NestWise user id we set when creating the customer,
    // the checkout session and the subscription. Validate it before use.
    const rawUserId: string | undefined =
      object.metadata?.userId ?? object.client_reference_id ?? undefined;
    const userId = rawUserId
      ? await ctx.runQuery(internal.stripe.resolveUserId, { raw: rawUserId })
      : null;

    switch (event.type) {
      // Fires the moment checkout succeeds. Handled alongside the subscription
      // events so Pro unlocks immediately rather than on the next event.
      case 'checkout.session.completed': {
        if (object.mode !== 'subscription' || !object.subscription) break;
        const sub = await retrieveSubscription(object.subscription as string);
        await ctx.runMutation(internal.stripe.applySubscription, {
          stripeCustomerId: object.customer as string,
          userId: userId ?? undefined,
          ...fromStripeSubscription(sub),
        });
        break;
      }

      // Renewals, plan switches, failed payments, cancel-at-period-end toggles.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      // Fires ~3 days before a free trial converts to a paid subscription.
      case 'customer.subscription.trial_will_end': {
        await ctx.runMutation(internal.stripe.applySubscription, {
          stripeCustomerId: object.customer as string,
          userId: userId ?? undefined,
          ...fromStripeSubscription(object),
        });
        break;
      }

      // The subscription is over — access ends now.
      case 'customer.subscription.deleted': {
        await ctx.runMutation(internal.stripe.clearSubscription, {
          stripeCustomerId: object.customer as string,
          userId: userId ?? undefined,
          stripeSubscriptionId: object.id as string,
        });
        break;
      }

      default:
        // Everything else is acknowledged and ignored, so Stripe stops retrying.
        break;
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
