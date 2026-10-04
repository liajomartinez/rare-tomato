import { WorkOS } from "@workos-inc/node";
import { logSafeError } from "./safe-log";

// Asks the sign-in provider (WorkOS) to remove the person's sign-in record after their data is deleted (spec FR-H2).
// Best effort: our own data is already gone by the time this runs, so a failure here must not undo or hide that. It uses the
// provider's maintained SDK; nothing here handles passwords or tokens.

export type RemoveResult = "removed" | "failed" | "not_configured";

export async function removeSignInRecord(authSubject: string | null, apiKey = process.env.WORKOS_API_KEY): Promise<RemoveResult> {
  if (!authSubject || !apiKey) return "not_configured";
  try {
    await new WorkOS(apiKey).userManagement.deleteUser(authSubject);
    return "removed";
  } catch (error) {
    logSafeError(error, "sign-in-provider");
    return "failed";
  }
}
