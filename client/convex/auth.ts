import { convexAuth, getAuthUserId } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import type { QueryCtx, MutationCtx, ActionCtx } from './_generated/server';
import type { Id, TableNames } from './_generated/dataModel';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});

// The signed-in user's id, or null when unauthenticated. Read queries use this
// to return an empty result for signed-out callers instead of throwing.
export async function getUserId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  return await getAuthUserId(ctx);
}

// Throw unless signed in; otherwise return the user id. Use in writes/actions.
export async function requireUserId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

// Fetch a row by id and confirm it belongs to the signed-in user. Throws if the
// caller isn't signed in or the row is missing / owned by someone else — so an
// update/remove can never touch another user's data.
export async function getOwned<T extends TableNames>(ctx: MutationCtx, id: Id<T>) {
  const userId = await requireUserId(ctx);
  const doc = await ctx.db.get(id);
  if (!doc || (doc as { userId?: Id<'users'> }).userId !== userId) {
    throw new Error('Not found');
  }
  return doc;
}
