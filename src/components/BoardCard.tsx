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
      className={`relative p-3 rounded-lg border cursor-pointer transition-colors ${
        isDragging
          ? "opacity-50 border-indigo-500 bg-gray-800"
          : isSelected
          ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
          : task.completed
          ? "border-gray-200 bg-gray-50"
          : "border-gray-200 bg-white hover:border-gray-300 shadow-sm"
      }`}
    >
      <div className={`text-sm ${task.completed ? "line-through text-gray-400" : "text-gray-800"}`}>
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
