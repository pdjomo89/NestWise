// One source of truth for category colors, used by the dashboard chart,
// category labels, and transaction pills so coding stays consistent.
export const CATEGORY_COLORS: Record<string, string> = {
  income: '#10b981',
  housing: '#6366f1',
  food: '#22c55e',
  bills: '#ef4444',
  transport: '#f59e0b',
  savings: '#06b6d4',
  entertainment: '#ec4899',
  shopping: '#8b5cf6',
  health: '#14b8a6',
  general: '#a855f7',
};

// Dark-surface steps for the four hues that sit too light against the dark
// panel (OKLCH L above the 0.48–0.67 band, which washes them out). Same hue, one
// step darker; every other category reads correctly in both themes.
const CATEGORY_COLORS_DARK: Record<string, string> = {
  food: '#16a34a',
  transport: '#d97706',
  savings: '#0891b2',
  health: '#0d9488',
};

// The order categories are drawn in wherever they sit side by side (the grouped
// monthly bars). It is FIXED — never sorted by value — for two reasons: a colour
// must stay welded to its category as amounts change, and neighbouring bars have
// to be tellable apart. This particular sequence keeps every adjacent pair clear
// of the red/green, teal/pink, amber/red and indigo/violet/purple collisions in
// both themes (validated on adjacent pairs against both panel surfaces).
export const CHART_CATEGORY_ORDER = [
  'food',
  'savings',
  'bills',
  'general',
  'transport',
  'health',
  'housing',
  'entertainment',
  'shopping',
];

const PALETTE = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#a855f7', '#ec4899'];

// Deterministic fallback so an unmapped category always gets the same color.
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const colorFor = (category: string) =>
  CATEGORY_COLORS[category.toLowerCase()] ?? PALETTE[hash(category) % PALETTE.length];

// Theme-aware variant. Charts drawn on a panel should use this so the four
// too-light hues drop to their dark step; everything else is unchanged.
export const chartColorFor = (category: string, theme: 'dark' | 'light') => {
  const key = category.toLowerCase();
  if (theme === 'dark' && CATEGORY_COLORS_DARK[key]) return CATEGORY_COLORS_DARK[key];
  return colorFor(key);
};

// Category values are stored as lowercase English keys. Display them via the
// capitalized form so it can be looked up in the translation dictionary
// (t('Housing') → 'Logement' in French, 'Housing' in English).
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
