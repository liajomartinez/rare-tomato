// The one door to Claude (ADR 0005). Everything that calls a model goes through `ModelClient`, so tests can
// use a fake one (no money spent, no network) and the SDK can be swapped in one place.
// Model names and prices are CONFIG, not scattered through the code (spec 8.3): change them here or by environment variable.

export const MODELS = {
  // The spec (8.3) says "claude-sonnet-5". That id is not confirmed to exist, so this default is the current Sonnet
  // id and can be overridden with RULE_MODEL. To be confirmed with Lia.
  ruleWriter: process.env.RULE_MODEL || "claude-sonnet-5-5",
  conflictCheck: process.env.CONFLICT_MODEL || "claude-haiku-4-5-20251001",
} as const;

/**
 * Estimated price in US dollars per million tokens. The Haiku numbers are Anthropic's published price as used in the
 * demo agent. **The Sonnet numbers are an UNVERIFIED placeholder**: check Anthropic's pricing page before launch (spec 14.2).
 * Costs logged from these are estimates.
 */
export const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  default: { input: 3, output: 15 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICE_PER_MILLION[model] ?? PRICE_PER_MILLION.default;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export interface ModelRequest {
  model: string;
  system: string;
  /** The user turn. Anything untrusted inside it must already be fenced as quoted data by the caller. */
  user: string;
  maxTokens: number;
  /** Leave unset for models that no longer accept it. */
  temperature?: number;
}
export interface ModelReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
export interface ModelClient {
  complete(request: ModelRequest): Promise<ModelReply>;
}

/** The real client. Reads ANTHROPIC_API_KEY from the environment; never logs the key, the prompt or the reply. */
export function anthropicClient(): ModelClient {
  return {
    async complete(request) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const claude = new Anthropic();
      const response = await claude.messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        // Only sent when asked for: the current Sonnet rejects a temperature setting ("deprecated for this model").
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        // The system prompt is marked cacheable (spec 6.1 step 4).
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.user }],
      });
      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return { text, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    },
  };
}
