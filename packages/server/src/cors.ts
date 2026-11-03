/** Which web pages may talk to this server. */

/** Reads `ALLOWED_ORIGINS`, a comma separated list such as `https://cardgolf.party`. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "");
}

/**
 * The CORS header for a request from `origin`. With no allowed list, any
 * page may connect (handy for local development). With a list, only those
 * pages get a matching header, so the browser blocks every other site.
 */
export function corsOriginHeader(
  allowed: readonly string[],
  origin: string | null,
): Record<string, string> {
  if (allowed.length === 0)
    return { "Access-Control-Allow-Origin": origin ?? "*" };
  if (origin !== null && allowed.includes(origin)) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  // No match: say the first allowed site is the only one, so others fail.
  return { "Access-Control-Allow-Origin": allowed[0] ?? "", Vary: "Origin" };
}
