import { TodoistTask } from "@/lib/types";

/**
 * Checks if a task should be excluded from triage/display based on specific criteria.
 * Currently excludes "Ler emails de hoje" if it's an hourly recurring task,
 * and also excludes any subtasks.
 * @param task The TodoistTask object to check.
 * @returns True if the task should be excluded, false otherwise.
 */
export const shouldExcludeTaskFromTriage = (task: TodoistTask): boolean => {
  // Exclude "Ler emails de hoje" if it's an hourly recurring task
  const isEmailTask = task.content === "Ler emails de hoje";
  const isHourlyRecurring = task.due?.is_recurring && 
                            (task.due.string?.toLowerCase().includes("every hour") || 
                             task.due.string?.toLowerCase().includes("toda hora"));
  
  if (isEmailTask && isHourlyRecurring) {
    return true;
  }

  // Exclude any subtasks (tasks with a parent_id)
  if (task.parent_id) {
    return true;
  }

  return false;
};