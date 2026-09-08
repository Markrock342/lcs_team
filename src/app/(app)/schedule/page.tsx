"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ListRow,
  PageLoader,
  StatusBadge,
} from "@/components/ui";
import { PageHeader, PageShell, FilterTabs } from "@/components/mobile-ui";
import { MonthGanttCalendar } from "@/components/MonthGanttCalendar";
import { TaskCountdown } from "@/components/TaskCountdown";
import type { Task, Profile } from "@/lib/types";

export default function SchedulePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"month" | "list" | "team">("month");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadTasks();
  }, []);

  async function loadTasks() {
    setError(null);
    const supabase = createClient();
    const [tasksRes, profilesRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "*, client:clients(*), assignee:profiles!tasks_assigned_to_fkey(*)"
        )
        .order("start_date", { ascending: true }),
      supabase.from("profiles").select("*").order("display_name"),
    ]);
    if (tasksRes.error || profilesRes.error) {
      setError("โหลดตารางงานไม่สำเร็จ ลองอีกครั้ง");
      setLoading(false);
      return;
    }
    setTasks(tasksRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }

  const filteredTasks =
    assigneeFilter === "all"
      ? tasks
      : assigneeFilter === "unassigned"
        ? tasks.filter((t) => !t.assigned_to)
        : tasks.filter((t) => t.assigned_to === assigneeFilter);

  const unscheduled = filteredTasks.filter(
    (t) => !t.start_date && !t.due_date && t.status !== "done"
  );

  const tasksByMember = profiles.map((member) => ({
    member,
    tasks: filteredTasks.filter(
      (t) => t.assigned_to === member.id && t.status !== "done"
    ),
  }));

  if (loading) {
    return <PageLoader label="กำลังโหลดตารางงาน..." />;
  }

  if (error) {
    return (
      <PageShell width="wide">
        <ErrorState
          description={error}
          onRetry={() => {
            setLoading(true);
            void loadTasks();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="ตารางงาน"
        description="ดูวันเริ่ม กำหนดส่ง และภาระงานของแต่ละคน"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          active={view}
          onChange={(k) => setView(k as "month" | "list" | "team")}
          tabs={[
            { key: "month", label: "ปฏิทิน" },
            { key: "list", label: "รายการ" },
            { key: "team", label: "ทีม" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="shrink-0">ผู้รับผิดชอบ</span>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground sm:w-auto"
          >
            <option value="all">ทุกคน</option>
            <option value="unassigned">ยังไม่มอบหมาย</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredTasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Calendar size={28} />}
            title={tasks.length === 0 ? "ยังไม่มีงานในตาราง" : "ไม่พบงานตามตัวกรอง"}
            description={
              tasks.length === 0
                ? "เพิ่มวันเริ่มหรือกำหนดส่ง แล้วงานจะแสดงในตาราง"
                : "ลองเลือกผู้รับผิดชอบคนอื่น"
            }
          />
        </Card>
      ) : view === "month" ? (
        <MonthGanttCalendar
          month={currentMonth}
          tasks={filteredTasks}
          onMonthChange={setCurrentMonth}
        />
      ) : view === "team" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasksByMember.map(({ member, tasks: memberTasks }) => (
            <Card key={member.id}>
              <CardHeader
                title={member.display_name}
                description={`${memberTasks.length} งานค้าง`}
                icon={<Avatar name={member.display_name} src={member.avatar_url} size="sm" />}
              />
              <div className="max-h-72 divide-y divide-border overflow-y-auto">
                {memberTasks.map((task) => (
                  <ListRow
                    key={task.id}
                    title={<span className="block truncate">{task.title}</span>}
                    description={task.client?.name ?? "ไม่ระบุลูกค้า"}
                    trailing={<StatusBadge status={task.status} />}
                  />
                ))}
                {memberTasks.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted">ไม่มีงานค้าง</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <Card className="md:hidden">
            <div className="divide-y divide-border">
            {filteredTasks.map((task) => (
              <ListRow
                key={task.id}
                title={
                  <span className="block truncate">
                  {task.parent_id && <span className="text-muted mr-1">↳</span>}
                  {task.title}
                  </span>
                }
                description={
                  <div className="space-y-1.5">
                    <p>
                      {task.client?.name ?? "ไม่ระบุลูกค้า"}
                      {task.assignee ? ` · ${task.assignee.display_name}` : ""}
                    </p>
                  <TaskCountdown
                    startDate={task.start_date}
                    dueDate={task.due_date}
                    status={task.status}
                    showDates={false}
                    size="sm"
                  />
                  </div>
                }
                trailing={<StatusBadge status={task.status} />}
              />
            ))}
            </div>
          </Card>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-border bg-background">
                  <th className="min-w-50 px-4 py-3 text-left font-medium">
                    งาน
                  </th>
                  <th className="text-left px-4 py-3 font-medium">ลูกค้า</th>
                  <th className="text-left px-4 py-3 font-medium">ผู้รับผิดชอบ</th>
                  <th className="text-left px-4 py-3 font-medium">เริ่ม</th>
                  <th className="text-left px-4 py-3 font-medium">ครบ</th>
                  <th className="text-left px-4 py-3 font-medium">ระยะ</th>
                  <th className="text-left px-4 py-3 font-medium">นับถอยหลัง</th>
                  <th className="text-left px-4 py-3 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-card-hover transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      {task.parent_id && (
                        <span className="text-muted mr-1">↳</span>
                      )}
                      {task.title}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {task.client?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {task.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={task.assignee.display_name}
                            src={task.assignee.avatar_url}
                            size="sm"
                          />
                          <span className="text-xs">
                            {task.assignee.display_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {task.start_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {task.due_date ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-accent font-medium">
                        {task.duration_days} วัน
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TaskCountdown
                        startDate={task.start_date}
                        dueDate={task.due_date}
                        status={task.status}
                        showDates={false}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {unscheduled.length > 0 && (
        <Card>
          <CardHeader
            title="งานที่ยังไม่ได้วางวัน"
            description={`${unscheduled.length} งานรอกำหนดวัน`}
            icon={<Calendar size={18} className="text-amber-400" />}
          />
          <div className="divide-y divide-border">
            {unscheduled.map((task) => (
              <ListRow
                key={task.id}
                title={task.title}
                description={
                  <div className="space-y-1.5">
                    <p>
                    {task.client?.name ?? "ไม่ระบุลูกค้า"}
                    </p>
                    <TaskCountdown
                      startDate={task.start_date}
                      dueDate={task.due_date}
                      status={task.status}
                      size="sm"
                    />
                  </div>
                }
                trailing={<StatusBadge status={task.status} />}
              />
            ))}
          </div>
        </Card>
      )}
    </PageShell>
  );
}
