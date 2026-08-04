// Greeting helpers, shared by the sign-in screen and the dashboard so both
// screens say the same thing at the same hour.

// Keyed off the visitor's local clock. Signed out we have no name to use; signed
// in the caller pairs this with one from `displayName`.
export function timeGreeting(t: (s: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t('Good morning');
  if (hour < 18) return t('Good afternoon');
  return t('Good evening');
}

// Fallback for users who haven't set a display name in Settings: sign-up only
// collects an email, so a first name has to come out of the local part —
// "ada.lovelace@x.com" → "Ada", "ada99@x.com" → "Ada". Returns null when the
// result would be noise (initials, an all-digit handle, a long opaque string);
// callers then greet without a name rather than badly.
export function displayName(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[._+-]/)[0] ?? '';
  const word = first.replace(/\d+$/, '');
  if (word.length < 2 || word.length > 20 || !/^[a-zA-Z]+$/.test(word)) return null;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}
