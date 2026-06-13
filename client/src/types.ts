// App-facing types derived directly from the Convex schema and functions,
// so they stay in sync with the backend automatically.
import { FunctionReturnType } from 'convex/server';
import { Doc, Id } from '../convex/_generated/dataModel';
import { api } from '../convex/_generated/api';

export type Account = Doc<'accounts'>;
export type Transaction = Doc<'transactions'>;
export type Person = Doc<'people'>;
export type IncomeSource = Doc<'incomeSources'>;
export type RecurringExpense = Doc<'recurringExpenses'>;
export type RetirementPlan = Doc<'retirementPlan'>;
export type Budget = FunctionReturnType<typeof api.budget.get>;
export type Summary = FunctionReturnType<typeof api.summary.get>;
export type RetirementResult = FunctionReturnType<typeof api.planning.projectRetirement>;
export type HouseholdResult = FunctionReturnType<typeof api.planning.projectHousehold>;
export type Advice = FunctionReturnType<typeof api.planning.savingsAdvice>;
export type { Id };
