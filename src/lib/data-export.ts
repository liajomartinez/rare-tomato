import type { Db } from "@/db/client";
import { ownedTables, type OwnedTableName } from "@/db/schema";
import { tenantDb, type Row } from "@/db/tenant";
import { decryptField, type MasterKeys } from "./crypto";
import { getDataKey, getUser } from "./identity";
import { readSummary } from "./tasks";
import { logSafeError } from "./safe-log";

// Export everything about one person as JSON (spec FR-H1, SEC-5). The file holds readable text for the OWNER: encrypted fields are
// decrypted here, so an export can never ship ciphertext. Secrets are left out (token hashes). Every owned table is included, and a
// test fails if a new table is added without being handled here.

export const EXPORT_FORMAT_VERSION = 1;

/** Fields that are never exported: they are secrets or internal keys, not the person's information. */
const SECRET_FIELDS = new Set(["tokenHash", "tokenPrefix", "wrappedDataKey"]);

export interface ExportDocument {
  format_version: number;
  exported_at: string;
  about: string;
  account: Record<string, unknown>;
  tables: Record<OwnedTableName, Row[]>;
}

export const UNREADABLE = "[could not be read: this value could not be decrypted]";

export async function exportAll(db: Db, masters: MasterKeys, userId: string, now = new Date()): Promise<ExportDocument> {
  const t = tenantDb(db, userId);
  const user = await getUser(db, userId);
  const key = await getDataKey(db, userId, masters);
  const tables = {} as Record<OwnedTableName, Row[]>;
  let unreadable = 0;
  const readable = (fn: () => string): string => {
    try {
      return fn();
    } catch (error) {
      logSafeError(error, "export");
      unreadable += 1; // one bad value must not stop the person getting the rest of their data (FR-H1)
      return UNREADABLE;
    }
  };

  for (const name of Object.keys(ownedTables) as OwnedTableName[]) {
    const rows = (await t[name].list()) as Row[];
    tables[name] = rows.map((row) => {
      const out: Row = {};
      for (const [field, value] of Object.entries(row)) {
        if (SECRET_FIELDS.has(field) || field === "userId" || field === "deletedAt") continue;
        if (field.endsWith("Encrypted") || (name === "tasks" && field === "summary")) continue; // replaced below by readable text
        out[field] = value;
      }
      if (name === "profileFacts") out.value = readable(() => decryptField(key, row.valueEncrypted as string, userId, "profile_fact.value"));
      if (name === "tasks") {
        out.summary = readable(() => readSummary(row, key, userId));
        if (row.detailsEncrypted) out.details = readable(() => decryptField(key, row.detailsEncrypted as string, userId, "task.details"));
      }
      if (name === "feedback" && row.noteEncrypted) out.note = readable(() => decryptField(key, row.noteEncrypted as string, userId, "feedback.note"));
      return out;
    });
  }

  return {
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: now.toISOString(),
    about:
      "Everything Rare Tomato holds about you, in readable form. Task records and scores were reported by your agents (agent-reported). " +
      "Agents may also keep what they read in their own memory; that is outside this file.",
    account: {
      email: user?.email ?? null,
      plan: user?.plan ?? null,
      adult_attested_at: user?.adultAttestedAt ?? null,
      terms_version_accepted: user?.termsVersion ?? null,
      terms_accepted_at: user?.termsAcceptedAt ?? null,
      created_at: user?.createdAt ?? null,
      values_that_could_not_be_read: unreadable,
    },
    tables,
  };
}
