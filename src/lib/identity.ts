import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { agentConnections, users } from "@/db/schema";
import { isSubjectDeleted, signupsOpen } from "@/db/system";
import { newDataKey, unwrapDataKey, wrapDataKey, type MasterKeys } from "./crypto";
import { TERMS_VERSION } from "./strings";

// People are looked up by their sign-in id BEFORE we know whose data to open, so this is the one
// place (besides src/db) that touches the raw database. It only ever reads or writes the users table.

export type User = typeof users.$inferSelect;

export class SignupsClosed extends Error {
  constructor() {
    super("New accounts are paused");
  }
}

export class AccountDeleted extends Error {
  constructor() {
    super("This account was deleted; a fresh sign-in is needed to create a new one");
  }
}

/** Finds the person for a sign-in id, creating their account the first time we see them (unless new sign-ups are switched off). */
export async function findOrCreateUser(db: Db, input: { authSubject: string; email?: string | null }): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.authSubject, input.authSubject)).limit(1);
  if (existing) return existing;
  if (await isSubjectDeleted(db, input.authSubject)) throw new AccountDeleted(); // a deleted account is never re-created by an old token or session
  if (!(await signupsOpen(db))) throw new SignupsClosed(); // the sign-ups switch (FR-J1): a new account is not created
  await db.insert(users).values({ authSubject: input.authSubject, email: input.email ?? null }).onConflictDoNothing();
  const [user] = await db.select().from(users).where(eq(users.authSubject, input.authSubject)).limit(1);
  return user;
}

/** True while the person still has to see the "One quick thing" step: they have not confirmed they are an adult, or have not accepted the CURRENT Terms. */
export function needsTermsStep(user: Pick<User, "adultAttestedAt" | "termsVersion">, currentVersion: string = TERMS_VERSION): boolean {
  return !user.adultAttestedAt || user.termsVersion !== currentVersion;
}

/** Records that the person is 18 or older and accepted this version of the Terms, with the time. The first adult confirmation time is kept. */
export async function acceptTerms(db: Db, userId: string, version: string = TERMS_VERSION, now = new Date()): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [user] = await db
    .update(users)
    .set({ adultAttestedAt: existing?.adultAttestedAt ?? now, termsVersion: version, termsAcceptedAt: now, updatedAt: now })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Records the 18+ confirmation with a time stamp (FR-A1). */
export async function attestAdult(db: Db, userId: string, now = new Date()): Promise<User> {
  const [user] = await db.update(users).set({ adultAttestedAt: now, updatedAt: now }).where(eq(users.id, userId)).returning();
  return user;
}

/**
 * The person's data key, created the first time it is needed. Only the wrapped form is stored.
 * Two calls at once are safe: the first to store a key wins and both then use it.
 */
export async function getDataKey(db: Db, userId: string, masters: MasterKeys): Promise<Buffer> {
  const read = async () => (await db.select({ w: users.wrappedDataKey }).from(users).where(eq(users.id, userId)).limit(1))[0]?.w;
  let wrapped = await read();
  if (!wrapped) {
    await db
      .update(users)
      .set({ wrappedDataKey: wrapDataKey(masters.current, newDataKey(), userId) })
      .where(and(eq(users.id, userId), isNull(users.wrappedDataKey)));
    wrapped = await read();
  }
  if (!wrapped) throw new Error("Could not set up the encryption key");
  return unwrapDataKey(masters, wrapped, userId);
}

/** Finds the connection a bearer token belongs to, by its public prefix, before we know whose it is. */
export async function findConnectionByTokenPrefix(db: Db, prefix: string) {
  const [row] = await db
    .select()
    .from(agentConnections)
    .where(and(eq(agentConnections.tokenPrefix, prefix), isNull(agentConnections.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** One person's account row, by id (for the export). */
export async function getUser(db: Db, userId: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}
