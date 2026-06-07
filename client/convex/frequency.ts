// Pay/charge frequencies, shared by the Convex backend and the React client.
export const FREQUENCIES = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'annually',
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  annually: 'Annually',
};

// Normalize an amount at a given frequency to a per-month figure.
export function toMonthly(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'semimonthly':
      return amount * 2;
    case 'monthly':
      return amount;
    case 'annually':
      return amount / 12;
  }
}
