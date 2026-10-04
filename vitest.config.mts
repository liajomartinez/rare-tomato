import { defineConfig } from "vitest/config";
import path from "node:path";

// One worker on a developer machine: each test file starts an in-memory Postgres (WebAssembly), and two or more at once crashed workers on an
// 8 GB laptop (exit code 2147483651). One worker was also faster overall. CI keeps two.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", hookTimeout: 60_000, testTimeout: 30_000, maxWorkers: process.env.CI ? 2 : 1 },
});

