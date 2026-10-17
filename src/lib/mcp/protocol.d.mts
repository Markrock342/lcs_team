export const MCP_VERSION: string;
export const TOOLS: readonly { name: string; description: string; inputSchema: Record<string, unknown> }[];
export function processMcpMessage(
  message: unknown,
  operations: {
    list_clients: (args: { limit: number }) => Promise<unknown>;
    list_tasks: (args: { limit: number; status?: string }) => Promise<unknown>;
    get_workspace_summary: (args: Record<string, never>) => Promise<unknown>;
  }
): Promise<{ status: number; body: unknown }>;
