// Canadian registered-plan limits and government benefit amounts.
//
// ─────────────────────────────────────────────────────────────────────────────
// THESE ARE STARTING DEFAULTS, NOT AUTHORITATIVE FIGURES.
//
// Every number here is legislated and re-indexed at least yearly, so it goes
// stale on a schedule. Two consequences the UI has to respect:
//
//   1. Every value is editable wherever it's used, and labelled with the year
//      it came from, so nobody mistakes a default for their real position.
//   2. Contribution *room* is personal, not statutory — unused RRSP and TFSA
//      room carries forward, so someone's actual room is almost never the
//      annual limit. Only the CRA knows it. The app asks for it and points at
//      the Notice of Assessment / CRA My Account rather than pretending to
//      compute it.
//
// When updating: bump REFERENCE_YEAR with the values, in one commit.
// Sources — CRA (contribution limits) and Service Canada (CPP/OAS).
// ─────────────────────────────────────────────────────────────────────────────

export const REFERENCE_YEAR = 2025;

export type RoomKind = 'rrsp' | 'tfsa' | 'fhsa' | 'resp' | 'rdsp';

export type RoomPlan = {
  kind: RoomKind;
  label: string;
  // Statutory limit for one year, used only as the starting value.
  annualLimit: number;
  // Lifetime ceiling where one exists.
  lifetimeLimit?: number;
  // How the annual figure is actually determined, in plain language.
  basis: string;
  note: string;
};

export const ROOM_PLANS: RoomPlan[] = [
  {
    kind: 'rrsp',
    label: 'RRSP',
    annualLimit: 32490,
    basis: '18% of last year’s earned income, up to the annual dollar limit',
    note: 'Your real room is on your Notice of Assessment — it includes every year of unused room carried forward, minus any pension adjustment.',
  },
  {
    kind: 'tfsa',
    label: 'TFSA',
    annualLimit: 7000,
    basis: 'A flat amount each year since you turned 18',
    note: 'Unused room carries forward, and anything you withdrew is added back on January 1 of the following year.',
  },
  {
    kind: 'fhsa',
    label: 'FHSA',
    annualLimit: 8000,
    lifetimeLimit: 40000,
    basis: 'A flat amount each year once the account is open',
    note: 'Carry-forward is capped, so the most you can contribute in one year is limited even after skipping a year.',
  },
  {
    kind: 'resp',
    label: 'RESP',
    annualLimit: 2500,
    lifetimeLimit: 50000,
    basis: 'No annual cap, but the CESG grant matches 20% of the first $2,500 each year',
    note: 'Contributing about $2,500 a year captures the full $500 grant. The grant tops out at $7,200 per child.',
  },
  {
    kind: 'rdsp',
    label: 'RDSP',
    annualLimit: 1500,
    lifetimeLimit: 200000,
    basis: 'No annual cap; grants and bonds depend on family income',
    note: 'Contributions attract the Canada Disability Savings Grant, and low-income beneficiaries also receive the bond with no contribution at all.',
  },
];

export const roomPlan = (kind: string): RoomPlan | undefined =>
  ROOM_PLANS.find((p) => p.kind === kind);

// ── Government retirement benefits ──────────────────────────────────────────
// Monthly amounts in today's dollars, at age 65. Both are indexed to inflation,
// so the projection carries them forward at the plan's inflation rate rather
// than treating them as fixed nominal amounts.

// Maximum CPP at 65. Most people receive well under this — it assumes close to
// the maximum contribution in nearly every working year — so the form defaults
// to the typical amount and shows the maximum as the ceiling.
export const CPP_MAX_MONTHLY_AT_65 = 1433;
// What a typical new CPP retirement pension actually starts at.
export const CPP_TYPICAL_MONTHLY_AT_65 = 900;
export const OAS_MONTHLY_AT_65 = 728;

// Quebec residents receive QPP instead of CPP. The amounts are close enough
// that the same field works for both; the label says so.
export const CPP_LABEL = 'CPP / QPP';
