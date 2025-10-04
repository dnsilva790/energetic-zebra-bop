import { TodoistTask } from "@/lib/types";

/**
 * Checks if a task should be excluded from triage/display based on specific criteria.
 * Excludes:
 * - Any task that is a subtask (has a parent_id).
 * - Any recurring task with a frequency less than 24 hours (e.g., "every hour", "every 12 hours", "every 30 minutes").
 * @param task The TodoistTask object to check.
 * @returns True if the task should be excluded, false otherwise.
 */
export const shouldExcludeTaskFromTriage = (task: TodoistTask): boolean => {
  // Exclude subtasks
  if (task.parent_id !== null) {
    return true;
  }

  // Exclude recurring tasks with frequency less than 24 hours
  if (task.due?.is_recurring && task.due.string) {
    const recurrenceString = task.due.string.toLowerCase();
    // Check for hourly or minute-based recurrence
    if (recurrenceString.includes("hour") || recurrenceString.includes("hora") ||
        recurrenceString.includes("min") || recurrenceString.includes("minuto")) {
      return true;
    }
  }

  return false; // By default, don't exclude
};