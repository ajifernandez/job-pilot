"use client";

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { COLUMNS, Job, JobStatus, STATUSES } from "@/lib/api";
import { JobCard } from "./job-card";

type Props = {
  jobs: Job[]; // ya filtrados
  onMove: (jobId: string, status: JobStatus, orderedIds: string[]) => void;
  onRemove: (job: Job) => void;
};

export function Kanban({ jobs, onMove, onRemove }: Props) {
  const byStatus = (s: JobStatus) =>
    jobs.filter((j) => j.status === s).sort((a, b) => a.position - b.position || b.created_at.localeCompare(a.created_at));

  function onDragEnd({ draggableId, source, destination }: DropResult) {
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;
    const dest = destination.droppableId as JobStatus;
    const ids = byStatus(dest).map((j) => j.id).filter((id) => id !== draggableId);
    ids.splice(destination.index, 0, draggableId);
    onMove(draggableId, dest, ids);
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((status) => {
          const items = byStatus(status);
          return (
            <section key={status} className="w-72 shrink-0 rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900/50" aria-label={STATUSES[status]}>
              <h2 className="mb-2 flex justify-between px-1 text-sm font-semibold">
                {STATUSES[status]}
                <span className="font-normal text-zinc-500">{items.length}</span>
              </h2>
              <Droppable droppableId={status}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.droppableProps}
                    className={`min-h-24 space-y-2 rounded ${snap.isDraggingOver ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                  >
                    {items.map((job, i) => (
                      <Draggable key={job.id} draggableId={job.id} index={i} disableInteractiveElementBlocking>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                            <JobCard job={job} onRemove={onRemove} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {prov.placeholder}
                  </div>
                )}
              </Droppable>
            </section>
          );
        })}
      </div>
    </DragDropContext>
  );
}
