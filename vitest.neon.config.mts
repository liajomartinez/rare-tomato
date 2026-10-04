import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs the database tests against the real Neon "test" branch instead of the in-memory copy.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    hookTimeout: 120_000,
    testTimeout: 60_000,
    env: { TEST_AGAINST_NEON: "true" },
    include: ["src/**/*.test.ts"],
    maxWorkers: 2,
  },
});
