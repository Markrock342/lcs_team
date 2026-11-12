"use client";

import type { Task, TaskStatus } from "@/lib/types";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import { Avatar } from "@/components/ui";
import { TaskCountdown } from "@/components/TaskCountdown";

const COLUMNS: TaskStatus[] = ["pending", "waiting", "in_progress", "review", "done"];

export function KanbanBoard({
  tasks,
  onStatusChange,
  readOnly = false,
}: {
  tasks: Task[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col && !t.parent_id);
        return (
          <div
            key={col}
            className="flex-shrink-0 w-[min(19rem,84vw)] sm:w-72 snap-start bg-card border border-border rounded-2xl flex flex-col sm:max-h-[70vh]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("taskId");
              if (id && !readOnly) onStatusChange(id, col);
            }}
          >
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
              <span className="text-base font-semibold">{TASK_STATUS_LABELS[col]}</span>
              <span className="text-sm text-muted bg-background px-2.5 py-0.5 rounded-full tabular-nums">{colTasks.length}</span>
            </div>
            <div className="flex-1 sm:overflow-y-auto p-2 space-y-2">
              {colTasks.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-muted">ไม่มีงาน</p>
              )}
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  draggable={!readOnly}
                  onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)}
                  className="bg-background border border-border rounded-xl p-3 hover:border-accent/30 sm:cursor-grab sm:active:cursor-grabbing"
                >
                  <p className="text-base font-medium leading-snug wrap-anywhere">{task.title}</p>
                  <p className="text-[0.8125rem] text-muted mt-1">{task.client?.name ?? "ไม่ระบุลูกค้า"}</p>
                  {task.assignee && (
                    <div className="flex items-center gap-2 mt-2">
                      <Avatar name={task.assignee.display_name} src={task.assignee.avatar_url} size="sm" />
                      <span className="min-w-0 truncate text-[0.8125rem] text-muted">{task.assignee.display_name}</span>
                    </div>
                  )}
                  <div className="mt-2">
                    <TaskCountdown
                      startDate={task.start_date}
                      dueDate={task.due_date}
                      status={task.status}
                      showDates={false}
                      size="sm"
                    />
                  </div>
                  {!readOnly && (
                    <label className="mt-3 block">
                      <span className="sr-only">ย้ายสถานะงาน {task.title}</span>
                      <select
                        value={task.status}
                        onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
                        className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-base sm:text-sm"
                      >
                        {COLUMNS.map((status) => (
                          <option key={status} value={status}>
                            {status === task.status ? "สถานะ: " : "ย้ายไป: "}
                            {TASK_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
