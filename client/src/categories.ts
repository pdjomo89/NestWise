// One source of truth for category colors, used by the dashboard chart,
// category labels, and transaction pills so coding stays consistent.
export const CATEGORY_COLORS: Record<string, string> = {
  income: '#10b981',
  housing: '#6366f1',
  food: '#22c55e',
  bills: '#ef4444',
  transport: '#f59e0b',
  savings: '#06b6d4',
  general: '#a855f7',
};

const PALETTE = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#a855f7', '#ec4899'];

// Deterministic fallback so an unmapped category always gets the same color.
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const colorFor = (category: string) =>
  CATEGORY_COLORS[category.toLowerCase()] ?? PALETTE[hash(category) % PALETTE.length];

// Category values are stored as lowercase English keys. Display them via the
// capitalized form so it can be looked up in the translation dictionary
// (t('Housing') → 'Logement' in French, 'Housing' in English).
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
