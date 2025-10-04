import { TodoistTask } from "@/lib/types";

/**
 * Checks if a task should be excluded from triage/display based on specific criteria.
 * Currently excludes "Ler emails de hoje" if it's an hourly recurring task.
 * @param task The TodoistTask object to check.
 * @returns True if the task should be excluded, false otherwise.
 */
export const shouldExcludeTaskFromTriage = (task: TodoistTask): boolean => {
  const isEmailTask = task.content === "Ler emails de hoje";
  
  // Check for hourly recurrence in English or Portuguese
  const isHourlyRecurring = task.due?.is_recurring && 
                            (task.due.string?.toLowerCase().includes("every hour") || 
                             task.due.string?.toLowerCase().includes("toda hora"));

  return isEmailTask && isHourlyRecurring;
};