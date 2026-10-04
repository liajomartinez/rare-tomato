// Spike 4 (Jev half): one call to TypeSafe's Jev with a pinned model version.
// Run with: npm run demo:jev   (reads TYPESAFE_API_KEY from .env)
// Uses only fictional text (Appendix E of the spec). Never real personal data.

const MODEL = "jev-1.13.0"; // pinned on purpose; never "jev-latest"
const INPUT_PRICE_PER_MILLION = 0.042; // USD, from TypeSafe's published model page (VERIFY)
const key = process.env.TYPESAFE_API_KEY;
if (!key) throw new Error("Set TYPESAFE_API_KEY in .env first.");

const rule = "Never book appointments before 10 am.";
const state = "The agent booked a dentist appointment for the account holder at 8:00 am next Tuesday.";

const body = {
  model: MODEL,
  state,
  questions: {
    applies: { type: "noul", instructions: `Is the rule '${rule}' relevant to the action described?` },
    violated: { type: "noul", instructions: `Does the described action violate the rule '${rule}'?` },
  },
};

const started = performance.now();
const res = await fetch("https://api.typesafe.ai/v1/systemone", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const latencyMs = Math.round(performance.now() - started);
console.log("HTTP status:", res.status, "| latency:", latencyMs, "ms");
if (!res.ok) {
  console.log("Error body:", (await res.text()).slice(0, 300));
  process.exit(1);
}
const json = (await res.json()) as {
  model: string;
  answers: Record<string, { type: string; noul: number }>;
  usage: { input_tokens: number; output_tokens: number };
};
console.log("Model returned:", json.model);
for (const [name, answer] of Object.entries(json.answers)) console.log(`${name}: ${answer.noul}`);
const cost = (json.usage.input_tokens * INPUT_PRICE_PER_MILLION) / 1_000_000;
console.log(
  `Tokens in: ${json.usage.input_tokens} | out: ${json.usage.output_tokens} | cost: $${cost.toFixed(8)} (output is free)`,
);
