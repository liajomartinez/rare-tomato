import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import type { MasterKeys } from "./crypto";
import type { FactView, RuleView, Services } from "./mcp";
import { anthropicClient, type ModelClient } from "./claude";
import { proposeCorrection } from "./corrections";
import { gatedClient } from "./model-gate";
import { profileService } from "./profile";
import { rulesService } from "./rules";
import { tasksService } from "./tasks";
import { logSafeError } from "./safe-log";

/** The real implementation of what the tools need, working on one person at a time. */
export function makeServices(db: Db, masters: MasterKeys, model?: ModelClient, onTaskLogged?: (userId: string, taskId: string) => void): Services {
  return {
    async facts(userId, categories, connectionId) {
      const facts = await profileService(db, masters, userId).listForAgent(connectionId, categories);
      return facts.map<FactView>((f) => ({ id: f.id, category: f.category, key: f.key, value: f.value, updatedAt: f.updatedAt }));
    },

    // Only approved rules (active or locked), in the fixed order of spec 6.4. Proposed rules are never served.
    async rules(userId, connectionId) {
      const rules = await rulesService(db, userId).servedTo(connectionId);
      // Overlaps the person chose to keep ("keep both"), shown from both sides so an agent can see the tie-break (spec 6.4).
      const served = new Set(rules.map((r) => r.id));
      const overlaps = (id: string) => [
        ...new Set([...(rules.find((r) => r.id === id)?.conflictsWith ?? []), ...rules.filter((r) => r.conflictsWith.includes(id)).map((r) => r.id)]),
      ].filter((x) => served.has(x) && x !== id);
      return rules.map<RuleView>((r, i) => ({
        id: r.id,
        text: r.text,
        category: r.category,
        scope: r.scope,
        precedence_rank: i + 1,
        locked: r.status === "locked",
        conflicts_with: overlaps(r.id),
        version: r.version,
      }));
    },

    // An agent passes on a correction. It can only lead to a PROPOSED rule that the person must approve (never to an active one).
    async proposeCorrection(userId, connectionId, input) {
      return proposeCorrection(db, masters, userId, connectionId, input, gatedClient(db, userId, model ?? anthropicClient()));
    },

    async logTask(userId, connectionId, input) {
      const result = await tasksService(db, masters, userId).logTask(connectionId, input);
      // A NEW task is handed to scoring after the reply is on its way (it never slows or changes the agent's answer). Repeats are not re-scored.
      if (result.ok && result.status === "created" && onTaskLogged) {
        try {
          onTaskLogged(userId, result.taskId);
        } catch (error) {
          logSafeError(error, "services");
          // Scoring is advisory and best-effort: if it cannot be scheduled the task simply stays unscored.
        }
      }
      return result;
    },

    // Every read by an agent is recorded (FR-H4): who, what kind, when. Never the values.
    async callsSince(userId, connectionId, since) {
      return tenantDb(db, userId).auditCountSince(connectionId, since);
    },

    async audit({ userId, connectionId, action, categoriesRead }) {
      await tenantDb(db, userId).auditLog.insert({ agentConnectionId: connectionId, actor: "agent", action, categoriesRead });
    },
  };
}
