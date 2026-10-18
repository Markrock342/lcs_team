# LCS Team MCP: create_task (stacked Draft PR / BLOCKED)

This is an **additive, default-OFF** proposal stacked on the Phase 1 read-only PR.
It is not deployed and must not be used with production customer data during testing.
The existing read tools remain available when task creation is disabled.

## Tool and write boundaries

- New tool: create_task. One task per explicitly approved request; requires \`confirm: true\`.
  This parameter is an intent signal from the caller, **not** proof of independent human approval:
  the MCP client/agent must ask for user confirmation for each task.
- Fields: required \`title\` (trimmed, 1–160 chars), optional \`description\` (max 2,000),
  \`client_id\` (existing accessible UUID), \`assigned_to\` (existing accessible UUID),
  \`priority\` (low/medium/high/urgent, defaults medium), and \`due_date\` (YYYY-MM-DD).
  A missing client_id creates an **unlinked** task. The tool does not create clients/projects.
- Rejects unknown keys (including status, progress, created_by), invalid UUIDs/dates,
  missing confirmation, out-of-range text and unknown priority.
- Server sets created_by from Supabase Auth-verified user ID, status=pending, progress=0.
  Database writes use the authenticated user's Bearer token and RLS, **never Service Role**.
  References are checked under that same user identity. Returns limited task metadata only.
- Each request revalidates Supabase user token and OAuth client binding. Only profile.role
  admin or pm can access the MCP route; *display_roles are not authorization*.
  The create_task tool is hidden and rejected at invocation unless both server-side
  gates are set to the exact string true:
  \`LCS_MCP_ENABLE_TASK_CREATION=true\` AND \`LCS_MCP_ROLE_GUARD_VERIFIED=true\`.
  Both are absent by default. Other tools remain read-only. No separate write token.

## BLOCKERS BEFORE enabling either production write flag

1. **Fix and independently verify DB role integrity.** Existing SQL in main includes a
   self-profile update policy and signup path that accepts raw_user_meta_data.role.
   A client-supplied role could undermine server-side admin/pm authorization.
   Audit the *deployed* schema and all profile insert/update paths, protect role and
   display_roles in DB (including INSERT, UPDATE, triggers, signup defaults, RPC paths),
   validate only trusted admin provisioning, and add adversarial tests for self-promotion.
   The existence of historical fix-*.sql files does NOT prove that production applied them.
   \`LCS_MCP_ROLE_GUARD_VERIFIED\` is a manual release attestation **only after** that review.
2. **Verify task INSERT RLS** for authorized admin/pm and denial of unauthorized identities;
   existing broad Team INSERT policies are not a substitute for role validation.
3. Phase 1 PR #1 is still BLOCKED: complete OAuth protected-resource metadata, discovery,
   consent/client onboarding and audience binding before using as a ChatGPT connector.
4. Restore functioning GitHub CI/runner; verify the unit tests, TypeScript, ESLint and build.
   Exercise authenticated read/write/deny scenarios against a disposable, synthetic Supabase
   project only. Do not use any real customer, task, token or production secret.
5. Require a separate reviewed rollout and explicit approval for enabling flags.
   Simply merging a PR does **not** constitute approval to turn on writes.

## Manual validation (disposable test environment ONLY)

\`\`\`sh
node --test scripts/tests/mcp.test.mjs
npx tsc --noEmit
npm run lint
npm run build
\`\`\`

Test missing/invalid token, wrong OAuth client, revoked user, forged role metadata, guest/backend,
admin and pm, role self-promotion, INSERT RLS, invalid client_id/assigned_to, invalid JSON-RPC,
no write tool when disabled, confirmation handling and correct created_by/pending status.
No production migration, merge or deployment in this PR. Branch pushes may trigger Vercel
Preview depending on repository settings; do not promote previews to production.

## Example payload (illustrative only; do not run on real data)

\`\`\`json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_task","arguments":{"title":"Synthetic test task","priority":"medium","confirm":true}}}
\`\`\`

The example creates an unlinked task only **after** write gates, authentication and RLS pass.
For CHJ, identify/create the actual CHJ project by an independently approved workflow before
linking its ID; do not guess a client UUID or create real CHJ data as part of this test.
