"use client";

import { Card, Checkbox, Status } from "@/components/vari8/components";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice, useDemoStore } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

export function TasksScreen({ demo }: { demo: ParsedDemo }) {
  const { asOf } = useDemoStore();
  const [tasks, setTasks] = useDemoSlice("tasks");
  const sorted = [...tasks.items].sort((a, b) => a.due.localeCompare(b.due));
  const doneCount = tasks.items.filter((t) => t.done).length;

  const toggle = (id: string, done: boolean) =>
    setTasks((c) => ({
      items: c.items.map((t) => (t.id === id ? { ...t, done } : t)),
    }));

  return (
    <ClientScreen
      title="Tasks"
      description="Things your coach asked you to do."
    >
      <DemoGate demo={demo} empty="No open tasks.">
        <Card>
          <div className="client-kv">
            <span>
              {doneCount} of {tasks.items.length} complete
            </span>
            <span>Due dates vs {asOf}</span>
          </div>
        </Card>
        <div className="client-card-stack">
          {sorted.map((task) => {
            const overdue = !task.done && task.due < asOf;
            return (
              <Card
                key={task.id}
                className="client-task"
                data-overdue={overdue || undefined}
              >
                <div className="client-kv">
                  <span className="client-set-row">
                    <Checkbox
                      label={task.title}
                      checked={task.done}
                      onCheckedChange={(v) => toggle(task.id, v === true)}
                    />
                  </span>
                  <span className="client-set-row">
                    {overdue && <Status tone="danger">Overdue</Status>}
                    {task.done && <Status tone="positive">Done</Status>}
                    <span>{task.due}</span>
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
        {tasks.items.length > 0 && doneCount === tasks.items.length && (
          <Card>
            <p className="client-hint">Everything ticked off. Nice work.</p>
          </Card>
        )}
      </DemoGate>
    </ClientScreen>
  );
}
