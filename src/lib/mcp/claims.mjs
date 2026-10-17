/** Pure validation performed only AFTER Supabase Auth verifies the access token. */
export function validateMcpClaims(input, expected, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const aud = input.aud;
  const audMatch = typeof aud === "string" ? aud === expected.audience
    : Array.isArray(aud) && aud.includes(expected.audience);
  return input.iss === expected.issuer && audMatch &&
    input.client_id === expected.clientId && input.sub === expected.userId &&
    input.role === "authenticated" &&
    typeof input.exp === "number" && Number.isFinite(input.exp) && input.exp > nowSeconds &&
    (input.nbf === undefined || (typeof input.nbf === "number" && input.nbf <= nowSeconds));
}
