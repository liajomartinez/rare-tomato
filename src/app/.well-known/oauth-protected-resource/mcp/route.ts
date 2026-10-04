import { baseFor, mcpUrlFor } from "@/lib/base-address";
import { authkitIssuer } from "@/lib/handler";

export const dynamic = "force-dynamic";

// RFC 9728 protected resource metadata: tells an MCP client which authorization server to use. It names the agent address the client came in on
// (the main address or the old alias), so each client sees metadata that matches the address it connected to.
export function GET(request: Request) {
  const issuer = authkitIssuer();
  if (!issuer) return new Response("Not configured", { status: 404 });
  return Response.json({
    resource: mcpUrlFor(baseFor(request.url)),
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
  });
}
