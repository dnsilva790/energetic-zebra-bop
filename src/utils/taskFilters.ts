import { TodoistTask } from "@/lib/types";

/**
 * Checks if a task should be excluded from triage/display based on specific criteria.
 * Excludes:
 * - "Ler emails de hoje" if it's an hourly recurring task.
 * - Any task that is a subtask (has a parent_id).
 * @param task The TodoistTask object to check.
 * @returns True if the task should be excluded, false otherwise.
 */
export const shouldExcludeTaskFromTriage = (task: TodoistTask): boolean => {
  // Exclude subtasks
  if (task.parent_id !== null) {
    return true;
  }

  // Exclude "Ler emails de hoje" if it's an hourly recurring task
  const isEmailTask = task.content === "Ler emails de hoje";
  const isHourlyRecurring = task.due?.is_recurring && 
                            (task.due.string?.toLowerCase().includes("every hour") || 
                             task.due.string?.toLowerCase().includes("toda hora"));

  return isEmailTask && isHourlyRecurring;
};