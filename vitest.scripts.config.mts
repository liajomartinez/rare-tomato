import { defineConfig } from "vitest/config";
import path from "node:path";

// One-off set-up scripts (for example creating the fictional demo person). They run through vitest only so that
// the "@/" import shortcuts work; they are not tests.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["scripts/**/*.script.ts"], testTimeout: 120_000 },
});
