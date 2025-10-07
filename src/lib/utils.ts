import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isValid, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string or a Todoist 'due' or 'deadline' object for display.
 * It detects if a time component is present in the date string and formats accordingly.
 * @param dateInput The date string (e.g., 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS') or TodoistTask['due'] / TodoistTask['deadline'] object.
 * @returns Formatted date string (e.g., "dd/MM/yyyy HH:mm") or "Sem vencimento" / "Data inválida" / "Erro de data".
 */
export function formatDateForDisplay(dateInput: string | TodoistTask['due'] | TodoistTask['deadline'] | null | undefined): string {
  if (!dateInput) return "Sem vencimento";

  let dateString: string;
  if (typeof dateInput === 'string') {
    dateString = dateInput;
  } else if (dateInput && typeof dateInput === 'object' && 'date' in dateInput) {
    dateString = dateInput.date;
  } else {
    return "Data inválida";
  }

  if (dateString.trim() === '') {
    return "Data inválida";
  }

  try {
    const parsedDate = parseISO(dateString);

    if (!isValid(parsedDate)) {
      console.warn("Invalid date string after parseISO:", dateString);
      return "Data inválida";
    }

    // Check if the original date string contains a time component (e.g., 'T' followed by digits)
    // The native Todoist 'deadline' is date-only, so it won't have a time component.
    // The 'due' field might have 'datetime'.
    const hasTime = dateString.includes('T') && /\d{2}:\d{2}/.test(dateString);
    const formatString = hasTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";

    return format(parsedDate, formatString, { locale: ptBR });
  } catch (e: any) {
    console.error("Error formatting date:", dateString, "Error details:", e.message, e);
    return "Erro de data";
  }
}

/**
 * Rounds a given date to the next 15-minute interval.
 * For example, if the date is 19:40, it returns 19:45.
 * If the date is 19:45, it returns 19:45.
 * @param date The date to round.
 * @returns A new Date object rounded to the next 15-minute interval.
 */
export const roundToNext15Minutes = (date: Date): Date => {
  const minutes = date.getMinutes();
  const remainder = minutes % 15;
  if (remainder === 0) {
    return date; // Already on a 15-minute mark
  }
  const minutesToAdd = 15 - remainder;
  return addMinutes(date, minutesToAdd);
};