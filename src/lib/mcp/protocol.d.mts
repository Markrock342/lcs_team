export const MCP_VERSION: string;
export const READ_TOOLS: readonly { name: string; description: string; inputSchema: Record<string, unknown> }[];
export const WRITE_TOOLS: readonly { name: string; description: string; inputSchema: Record<string, unknown> }[];
export const TOOLS: readonly { name: string; description: string; inputSchema: Record<string, unknown> }[];
export interface CreateTaskInput {
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  description?: string;
  client_id?: string;
  assigned_to?: string;
  due_date?: string;
}
export function processMcpMessage(
  message: unknown,
  operations: {
    list_clients: (args: { limit: number }) => Promise<unknown>;
    list_tasks: (args: { limit: number; status?: string }) => Promise<unknown>;
    get_workspace_summary: (args: Record<string, never>) => Promise<unknown>;
    create_task?: (args: CreateTaskInput) => Promise<unknown>;
  },
  options?: { allowWrites?: boolean }
): Promise<{ status: number; body: any }>;
