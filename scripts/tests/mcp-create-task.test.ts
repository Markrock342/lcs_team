import assert from "node:assert/strict";
import test from "node:test";
import {
  canCreateTask,
  createTaskAuditSummary,
  createTaskInputSchema,
  taskInsertFromMcp,
} from "../../src/lib/mcp-create-task.ts";

const actorId = "9e698731-3208-4bd6-8867-221321f8a6ca";
const projectId = "f55210c1-5308-42d2-9791-262189214dc7";
const assigneeId = "d7352a08-748b-4b37-925a-b2d227704986";

test("create_task accepts and normalizes only its public allowlist", () => {
  const parsed = createTaskInputSchema.parse({
    title: "  ตรวจหน้า Dashboard  ",
    description: "  ตรวจความถูกต้องก่อนส่ง  ",
    client_id: projectId,
    assigned_to: assigneeId,
    due_date: "2026-10-20",
    confirm: true,
  });

  assert.deepEqual(parsed, {
    title: "ตรวจหน้า Dashboard",
    description: "ตรวจความถูกต้องก่อนส่ง",
    client_id: projectId,
    assigned_to: assigneeId,
    priority: "medium",
    due_date: "2026-10-20",
    confirm: true,
  });
});

test("create_task rejects missing confirmation and privilege-setting fields", () => {
  const invalidInputs = [
    { title: "งานที่ยังไม่ยืนยัน" },
    { title: "งานที่ปฏิเสธ", confirm: false },
    { title: "", confirm: true },
    { title: "x".repeat(161), confirm: true },
    { title: "ปลอมผู้สร้าง", confirm: true, created_by: actorId },
    { title: "ข้ามสถานะ", confirm: true, status: "done" },
    { title: "ข้ามความคืบหน้า", confirm: true, progress: 100 },
    { title: "priority ผิด", confirm: true, priority: "critical" },
    { title: "วันไม่มีจริง", confirm: true, due_date: "2026-02-30" },
    { title: "project ผิด", confirm: true, client_id: "not-a-uuid" },
    { title: "member ผิด", confirm: true, assigned_to: "not-a-uuid" },
    { title: "รายละเอียดยาว", confirm: true, description: "x".repeat(2_001) },
  ];

  for (const input of invalidInputs) {
    assert.equal(createTaskInputSchema.safeParse(input).success, false, JSON.stringify(input).slice(0, 100));
  }
});

test("server-controlled task fields cannot be supplied by the caller", () => {
  const parsed = createTaskInputSchema.parse({ title: "งานใหม่", priority: "high", confirm: true });
  const insert = taskInsertFromMcp(parsed, actorId);

  assert.deepEqual(insert, {
    title: "งานใหม่",
    description: null,
    client_id: null,
    assigned_to: null,
    priority: "high",
    due_date: null,
    status: "pending",
    progress: 0,
    created_by: actorId,
  });
});

test("admin or PM still require both exact server-side gates", () => {
  const enabled = { enabled: "true", roleGuardVerified: "true" };
  assert.equal(canCreateTask("admin", enabled), true);
  assert.equal(canCreateTask("pm", enabled), true);

  for (const role of ["accounting", "backend", "frontend", "design", "sale", "guest", "ADMIN", null]) {
    assert.equal(canCreateTask(role, enabled), false);
  }
  for (const config of [
    {},
    { enabled: "true" },
    { roleGuardVerified: "true" },
    { enabled: "TRUE", roleGuardVerified: "true" },
    { enabled: "true", roleGuardVerified: "false" },
  ]) {
    assert.equal(canCreateTask("admin", config), false);
  }
});

test("audit summary records intent without copying the task description", () => {
  const parsed = createTaskInputSchema.parse({
    title: "งานใหม่",
    description: "รายละเอียดภายในที่ไม่ควรซ้ำใน audit",
    confirm: true,
  });
  const summary = createTaskAuditSummary(parsed);

  assert.equal(summary.confirmed, true);
  assert.equal("description" in summary, false);
  assert.equal(summary.priority, "medium");
});
