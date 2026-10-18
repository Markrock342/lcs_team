# LCS Team MCP Phase 1 — Draft / Read Only

Endpoint: POST /api/mcp. Stateless Streamable HTTP JSON responses, MCP protocol 2025-06-18.
Tools: list_clients, list_tasks, get_workspace_summary. All reads use selected columns and 50-row cap.
No write tools, migrations, Service Role, cookie auth, or production changes.

## Security
- Every request, including initialization, requires a Supabase USER bearer access token.
- Supabase Auth getUser(token) validates token server-side; then verified token claims
  must match issuer, audience, configured LCS_MCP_OAUTH_CLIENT_ID, authenticated role,
  expiry and the verified user ID. Profile role must be admin.
- PostgREST receives the USER bearer token, preserving RLS. Fail closed on errors.
- No Origin allowed, no CORS, no token or query error logging. Do not paste real tokens in AI chat.
- Configure LCS_MCP_OAUTH_CLIENT_ID to the dedicated approved Supabase OAuth app
  client ID; optionally LCS_MCP_TOKEN_AUDIENCE (defaults to authenticated).
- Browser password login tokens without that OAuth client ID are intentionally rejected.

## Not ready for ChatGPT connection
A complete OAuth authorization flow and protected-resource metadata/discovery,
resource binding, consent and registration compatibility must be configured and
independently reviewed before any public rollout. This draft is not a complete
ChatGPT custom plugin. Do not deploy until security review and explicit approval.

## Test plan (synthetic test project ONLY)
Run node --test scripts/tests/mcp.test.mjs, npm run lint, npx tsc --noEmit, npm run build.
Test 401 missing/invalid/expired/wrong-client token, 403 non-admin, correct RLS,
pagination limits, zero mutations, invalid JSON, no sensitive output, valid initialize,
tools/list and tools/call. Do not connect tests to production.
A GitHub branch push may trigger Vercel Preview deployment if auto-deploy is enabled.

## Additive write proposal (NOT enabled)
See [MCP_CREATE_TASK.md](./MCP_CREATE_TASK.md) for the stacked create_task Draft PR.
Production task writes are disabled by default, even for admin/PM. Phase 1 security and OAuth blockers remain open.
