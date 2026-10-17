export interface McpClaimRequirements {
  issuer: string;
  audience: string;
  clientId: string;
  userId: string;
}
export function validateMcpClaims(input: unknown, expected: McpClaimRequirements, nowSeconds?: number): boolean;
