import { mutation } from './_generated/server';

// ONE-TIME MIGRATION HELPER — delete after use.
// Wipes every row from the data tables so the schema can switch to a required
// per-user `userId`. Pre-auth rows have no owner and must be cleared. This is
// run once via `npx convex run cleanup:wipeAll`, then this file is removed.
const DATA_TABLES = [
  'accounts',
  'transactions',
  'plaidItems',
  'people',
  'incomeSources',
  'recurringExpenses',
  'retirementPlan',
  'preferences',
] as const;

export const wipeAll = mutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;
    for (const table of DATA_TABLES) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return { deleted };
  },
});
