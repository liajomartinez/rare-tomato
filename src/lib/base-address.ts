// The one place that knows the site's address. Everything that needs "where Rare Tomato lives" (the agent address shown on Your agents, the
// agent endpoint's audience and metadata, the allowed host names, the sign-in return addresses) reads it from here, so a change of address is
// one setting (APP_BASE_URL) and not a search through the code.
//
// Two addresses work at the same time: the main one (raretomato.ai) and the old one (agent-care.vercel.app), which stays as an alias so that
// agents connected through the old address keep working. A sign-in token is accepted for either address.

export const DEFAULT_BASE_URL = "https://raretomato.ai";
export const LEGACY_BASE_URL = "https://agent-care.vercel.app";

const clean = (u: string) => u.trim().replace(/\/+$/, "");

/** The main address, without a trailing slash. Set APP_BASE_URL to change it. */
export function baseUrl(): string {
  return clean(process.env.APP_BASE_URL || DEFAULT_BASE_URL);
}

/** Every address the site answers on: the main one first, then the old alias. */
export function knownBases(): string[] {
  return [...new Set([baseUrl(), LEGACY_BASE_URL])];
}

export const mcpUrlFor = (base: string) => `${clean(base)}/mcp`;
export const metadataUrlFor = (base: string) => `${clean(base)}/.well-known/oauth-protected-resource/mcp`;

/** The agent address we show and name in our metadata. MCP_RESOURCE_URL can still override it. */
export function resourceUrl(): string {
  return clean(process.env.MCP_RESOURCE_URL || mcpUrlFor(baseUrl()));
}

/** Sign-in tokens issued for either address are accepted. */
export function acceptedAudiences(): string[] {
  return [...new Set([resourceUrl(), ...knownBases().map(mcpUrlFor)])];
}

/** The host names the agent endpoint answers for (plus any listed in MCP_ALLOWED_HOSTS). */
export function knownHosts(): string[] {
  return [...new Set(knownBases().map((b) => new URL(b).host))];
}

/** The address a request came in on, if it is one of ours; otherwise the main address. */
export function baseFor(requestUrl: string): string {
  try {
    const origin = new URL(requestUrl).origin;
    return knownBases().includes(origin) ? origin : baseUrl();
  } catch {
    return baseUrl();
  }
}

/** True when the request came in on one of our own addresses (so we may echo that address back). */
export function isKnownOrigin(requestUrl: string): boolean {
  try {
    return knownBases().includes(new URL(requestUrl).origin);
  } catch {
    return false;
  }
}

/** The return addresses the sign-in provider must allow, one per address the site answers on. */
export function redirectUris(): string[] {
  return knownBases().map((b) => `${b}/callback`);
}
