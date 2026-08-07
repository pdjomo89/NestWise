// Marks the one moment a user has just created their account, so the app can
// show the welcome/trial step once instead of dropping them straight onto the
// dashboard. Kept in localStorage rather than the database because it describes
// a single sign-up on a single device, not durable account state — the trial
// offer itself is always re-derivable from `stripe.status`.
const WELCOME_KEY = 'nw-welcome';

export const markNewSignUp = () => localStorage.setItem(WELCOME_KEY, '1');
export const clearWelcome = () => localStorage.removeItem(WELCOME_KEY);
export const isNewSignUp = () => localStorage.getItem(WELCOME_KEY) === '1';

// The plan picked on the sign-up form, held across the moment the account is
// created. Checkout can only be started once the user exists, and the sign-up
// component unmounts the instant auth flips — so the choice is parked here and
// the welcome step picks it up and redirects.
const PLAN_KEY = 'nw-plan';

export type PendingPlan = 'monthly' | 'annual';

export const setPendingPlan = (plan: PendingPlan) => localStorage.setItem(PLAN_KEY, plan);
export const clearPendingPlan = () => localStorage.removeItem(PLAN_KEY);
export const pendingPlan = (): PendingPlan | null => {
  const raw = localStorage.getItem(PLAN_KEY);
  return raw === 'monthly' || raw === 'annual' ? raw : null;
};
