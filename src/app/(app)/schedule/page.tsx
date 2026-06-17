"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge, Avatar, EmptyState } from "@/components/ui";
import { PageHeader, FilterTabs } from "@/components/mobile-ui";
import { MonthGanttCalendar } from "@/components/MonthGanttCalendar";
import { TaskCountdown } from "@/components/TaskCountdown";
import type { Task } from "@/lib/types";

export default function SchedulePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"month" | "list">("month");

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    const supabase = createClient();
    const { data } = await supabase
      .from("tasks")
      .select(
        "*, client:clients(*), assignee:profiles!tasks_assigned_to_fkey(*)"
      )
      .order("start_date", { ascending: true });
    setTasks(data ?? []);
    setLoading(false);
  }

  const unscheduled = tasks.filter(
    (t) => !t.start_date && !t.due_date && t.status !== "done"
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="ตารางงาน"
        description="ปฏิทินรายเดือน — แถบงานทับกันแยกสี/แถว"
      />

      <FilterTabs
        active={view}
        onChange={(k) => setView(k as "month" | "list")}
        tabs={[
          { key: "month", label: "ปฏิทิน" },
          { key: "list", label: "รายการ" },
        ]}
      />

      {view === "month" ? (
        <MonthGanttCalendar
          month={currentMonth}
          tasks={tasks}
          onMonthChange={setCurrentMonth}
        />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-border bg-background">
                  <th className="text-left px-4 py-3 font-medium min-w-[200px]">
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
                {tasks.map((task) => (
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
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2">
              <Calendar size={18} className="text-amber-400" />
              งานที่ยังไม่ได้วางวัน ({unscheduled.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {unscheduled.map((task) => (
              <div
                key={task.id}
                className="px-5 py-3 flex items-center justify-between hover:bg-card-hover"
              >
                <div>
                  <p className="font-medium text-sm">{task.title}</p>
                  <p className="text-xs text-muted">
                    {task.client?.name ?? "ไม่ระบุลูกค้า"}
                  </p>
                  <div className="mt-1.5">
                    <TaskCountdown
                      startDate={task.start_date}
                      dueDate={task.due_date}
                      status={task.status}
                      size="sm"
                    />
                  </div>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {tasks.length === 0 && (
        <EmptyState
          icon={<Calendar size={28} />}
          title="ยังไม่มีงานในตาราง"
          description="เพิ่มงานพร้อมวันที่เริ่ม-ครบ เพื่อดูในปฏิทิน"
        />
      )}
    </div>
  );
}
