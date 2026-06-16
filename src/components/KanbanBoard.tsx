"use client";

import type { Task, TaskStatus } from "@/lib/types";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import { StatusBadge, Avatar } from "@/components/ui";

const COLUMNS: TaskStatus[] = ["pending", "waiting", "in_progress", "review", "done"];

export function KanbanBoard({
  tasks,
  onStatusChange,
}: {
  tasks: Task[];
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col && !t.parent_id);
        return (
          <div
            key={col}
            className="flex-shrink-0 w-[280px] sm:w-72 snap-start bg-card border border-border rounded-2xl flex flex-col max-h-[70vh]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("taskId");
              if (id) onStatusChange(id, col);
            }}
          >
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
              <span className="text-sm font-medium">{TASK_STATUS_LABELS[col]}</span>
              <span className="text-xs text-muted bg-background px-2 py-0.5 rounded-full">{colTasks.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)}
                  className="bg-background border border-border rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-accent/30 touch-manipulation"
                >
                  <p className="font-medium text-sm">{task.title}</p>
                  <p className="text-xs text-muted mt-1">{task.client?.name ?? "—"}</p>
                  {task.assignee && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Avatar name={task.assignee.display_name} size="sm" />
                      <span className="text-[10px] text-muted">{task.assignee.display_name}</span>
                    </div>
                  )}
                  {task.due_date && (
                    <p className="text-[10px] text-accent mt-1">ครบ {task.due_date}</p>
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
