"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AssigneeInitials } from "./AssigneeInput";
import type { SprintTask } from "@/lib/types";

interface BoardCardProps {
  sprintTask: SprintTask;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export default function BoardCard({ sprintTask, isSelected, onClick }: BoardCardProps) {
  const { task } = sprintTask;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sprintTask.id,
    data: { type: "sprintTask", sprintTask },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`relative p-3 rounded-lg border-2 cursor-pointer transition-colors ${
        isDragging
          ? "opacity-50 border-indigo-500 bg-gray-800"
          : isSelected
          ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 shadow"
          : task.completed
          ? "border-gray-300 bg-gray-100 shadow-sm"
          : "border-gray-300 bg-white hover:border-gray-400 shadow"
      }`}
    >
      <div className={`text-sm flex items-start gap-1.5 ${task.completed ? "line-through text-gray-400" : "text-gray-800"}`}>
        {task.completed && (
          <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-green-500 text-white shrink-0 mt-0.5">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
        {task.title}
      </div>

      {task.assignees && task.assignees.length > 0 && (
        <div className="flex items-center gap-1 mt-2">
          {task.assignees.map((assignee) => (
            <AssigneeInitials key={assignee.id} name={assignee.name} size="sm" />
          ))}
        </div>
      )}
    </div>
  );
}
