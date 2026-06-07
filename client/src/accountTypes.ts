// Account types. `investment: true` means the add/edit form encourages a
// "contributed" (cost basis) so gains can be shown.
export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', investment: false },
  { value: 'savings', label: 'Savings', investment: false },
  { value: 'retirement', label: 'Retirement (401k/IRA)', investment: true },
  { value: 'brokerage', label: 'Brokerage / Stocks', investment: true },
  { value: 'iul', label: 'IUL', investment: true },
  { value: 'crypto', label: 'Crypto', investment: true },
  { value: 'real-estate', label: 'Real estate', investment: true },
  { value: 'other', label: 'Other', investment: false },
] as const;

export const ACCOUNT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label])
);

export const isInvestmentType = (type: string) =>
  ACCOUNT_TYPES.find((t) => t.value === type)?.investment ?? false;
