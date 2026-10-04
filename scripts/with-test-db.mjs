// Runs a command with the database set to the Neon TEST branch, and with every live setting hidden from it.
// Use it as:  node scripts/with-test-db.mjs <command and arguments>
// It refuses to run if the test database address is missing or is the same as the live one.
import { spawn } from "node:child_process";

process.loadEnvFile(".env");
const test = process.env.DATABASE_URL_TEST;
const live = [process.env.LIVE_DATABASE_URL].filter(Boolean);
if (!test) throw new Error("DATABASE_URL_TEST is not set in .env");
if (live.includes(test)) throw new Error("The test database address matches the live one. Refusing to start.");

// BEARER_ENABLED lets the demo agent use its own token on this local test server only.
const env = { ...process.env, DATABASE_URL: test, BEARER_ENABLED: "true" };
delete env.LIVE_DATABASE_URL;
delete env.LIVE_MASTER_KEY;

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Give a command to run.");
console.log("Using the TEST database. Live settings are hidden from this command.");
const child = spawn(command, args, { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
