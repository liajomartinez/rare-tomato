import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", hookTimeout: 60_000, testTimeout: 30_000, maxWorkers: 1, execArgv: ["--liftoff-only", "--max-old-space-size=1536"] },
});
