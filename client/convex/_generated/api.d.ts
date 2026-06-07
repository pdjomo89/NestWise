/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as budget from "../budget.js";
import type * as frequency from "../frequency.js";
import type * as income from "../income.js";
import type * as people from "../people.js";
import type * as plaid from "../plaid.js";
import type * as planning from "../planning.js";
import type * as preferences from "../preferences.js";
import type * as recurring from "../recurring.js";
import type * as retirement from "../retirement.js";
import type * as seed from "../seed.js";
import type * as summary from "../summary.js";
import type * as transactions from "../transactions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  budget: typeof budget;
  frequency: typeof frequency;
  income: typeof income;
  people: typeof people;
  plaid: typeof plaid;
  planning: typeof planning;
  preferences: typeof preferences;
  recurring: typeof recurring;
  retirement: typeof retirement;
  seed: typeof seed;
  summary: typeof summary;
  transactions: typeof transactions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
