// A small Claude-powered demo agent that reads the fictional demo person's details through our MCP server,
// using a bearer token (spec 7.2 path A, demo agent only).
// First run `npm run demo:setup` (creates the person and token on the TEST database), start the app against that
// database, then run `npm run demo:agent`. Reads ANTHROPIC_API_KEY and DEMO_AGENT_TOKEN from .env.
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MODEL = "claude-haiku-4-5";
const PRICE_PER_MILLION = { input: 1, output: 5 }; // USD, Anthropic published price for Haiku 4.5
const MCP_URL = process.env.MCP_URL ?? "http://localhost:3000/mcp";
const token = process.env.DEMO_AGENT_TOKEN;
if (!token || !process.env.ANTHROPIC_API_KEY) {
  throw new Error("Set ANTHROPIC_API_KEY and DEMO_AGENT_TOKEN in .env first (run npm run demo:setup).");
}

// 1. Connect to the MCP server with the bearer token.
const mcp = new Client({ name: "demo-agent", version: "0.0.0" });
await mcp.connect(
  new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);

// 2. Ask the server which tools it offers, and describe them to Claude.
const { tools: mcpTools } = await mcp.listTools();
console.log("Tools from server:", mcpTools.map((t) => t.name).join(", "));
const tools: Anthropic.Tool[] = mcpTools.map((t) => ({
  name: t.name,
  description: t.description ?? "",
  input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
}));

// 3. Let Claude decide to call a tool; run it on the server; give the result back.
const claude = new Anthropic();
const messages: Anthropic.MessageParam[] = [
  {
    role: "user",
    content:
      "Use your tools. First greet Lia. Then read the person's saved details and tell me, in two sentences, how they like to be contacted and any rule about appointment times. " +
      `Finally, record what you just did with the task tool, using the external id "demo-${new Date().toISOString().slice(0, 10)}-care-check", category "research", and outcome "completed". ` +
      "Say which tool results you used.",
  },
];
let inputTokens = 0;
let outputTokens = 0;

for (let turn = 0; turn < 5; turn++) {
  const response = await claude.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
  inputTokens += response.usage.input_tokens;
  outputTokens += response.usage.output_tokens;
  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason !== "tool_use") {
    for (const block of response.content) if (block.type === "text") console.log("Claude:", block.text);
    break;
  }
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    console.log(`Claude called tool "${block.name}" with`, JSON.stringify(block.input));
    const result = await mcp.callTool({ name: block.name, arguments: block.input as Record<string, unknown> });
    console.log("Server returned:", JSON.stringify(result.content));
    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify(result.content),
      is_error: result.isError === true,
    });
  }
  messages.push({ role: "user", content: results });
}

const cost =
  (inputTokens * PRICE_PER_MILLION.input + outputTokens * PRICE_PER_MILLION.output) / 1_000_000;
console.log(`Model: ${MODEL} | input tokens: ${inputTokens} | output tokens: ${outputTokens} | cost: $${cost.toFixed(6)}`);
await mcp.close();