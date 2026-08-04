// Marks the one moment a user has just created their account, so the app can
// show the welcome/trial step once instead of dropping them straight onto the
// dashboard. Kept in localStorage rather than the database because it describes
// a single sign-up on a single device, not durable account state — the trial
// offer itself is always re-derivable from `stripe.status`.
const WELCOME_KEY = 'nw-welcome';

export const markNewSignUp = () => localStorage.setItem(WELCOME_KEY, '1');
export const clearWelcome = () => localStorage.removeItem(WELCOME_KEY);
export const isNewSignUp = () => localStorage.getItem(WELCOME_KEY) === '1';
