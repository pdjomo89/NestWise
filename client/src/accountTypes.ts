// Account types. `investment: true` means the add/edit form encourages a
// "contributed" (cost basis) so gains can be shown. `liability: true` means the
// balance is money owed (e.g. a credit card): the form takes a positive amount
// and stores it negative so it subtracts from net worth.
export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', investment: false, liability: false },
  { value: 'savings', label: 'Savings', investment: false, liability: false },
  { value: 'credit', label: 'Credit card', investment: false, liability: true },
  { value: 'retirement', label: 'Retirement (401k/IRA)', investment: true, liability: false },
  { value: 'brokerage', label: 'Brokerage / Stocks', investment: true, liability: false },
  { value: 'iul', label: 'IUL', investment: true, liability: false },
  { value: 'crypto', label: 'Crypto', investment: true, liability: false },
  { value: 'real-estate', label: 'Real estate', investment: true, liability: false },
  { value: 'other', label: 'Other', investment: false, liability: false },
] as const;

export const ACCOUNT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label])
);

export const isInvestmentType = (type: string) =>
  ACCOUNT_TYPES.find((t) => t.value === type)?.investment ?? false;

export const isLiabilityType = (type: string) =>
  ACCOUNT_TYPES.find((t) => t.value === type)?.liability ?? false;
