// Kinds of income a household can have. The picker in the Budget tab writes
// `kind` on an income source; the free-text label stays available for the
// specifics ("Acme Corp"). Rows created before this existed have no `kind` and
// fall back to showing their label alone.
export const INCOME_TYPES = [
  { value: 'salary', label: 'Salary', icon: '💼' },
  { value: 'hourly', label: 'Hourly wages', icon: '⏱️' },
  { value: 'bonus', label: 'Bonus / commission', icon: '🎯' },
  { value: 'selfemployed', label: 'Self-employed / freelance', icon: '🧑‍💻' },
  { value: 'business', label: 'Business income', icon: '🏪' },
  { value: 'rental', label: 'Rental income', icon: '🏠' },
  { value: 'investment', label: 'Investments / dividends', icon: '📈' },
  { value: 'pension', label: 'Pension / retirement', icon: '🪺' },
  { value: 'benefits', label: 'Benefits / support', icon: '🤝' },
  { value: 'other', label: 'Other income', icon: '💰' },
] as const;

export type IncomeType = (typeof INCOME_TYPES)[number]['value'];

export const DEFAULT_INCOME_TYPE: IncomeType = 'salary';

export const INCOME_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  INCOME_TYPES.map((k) => [k.value, k.label])
);

export const incomeTypeIcon = (kind?: string | null): string =>
  INCOME_TYPES.find((k) => k.value === kind)?.icon ?? '💰';
