import type { Priority, Task } from "./types";

const priorityRank: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function isWithinMonth(value: string, date: Date) {
  return value >= toDateInputValue(startOfMonth(date)) && value <= toDateInputValue(endOfMonth(date));
}

export function isWithinNextSevenDays(value: string) {
  const today = toDateInputValue();
  const nextWeek = toDateInputValue(addDays(new Date(), 7));
  return value >= today && value <= nextWeek;
}

export function isToday(value: string) {
  return value === toDateInputValue();
}

export function isPastDate(value: string) {
  return value < toDateInputValue();
}

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.deadline.localeCompare(b.deadline);
  });
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(new Date(`${value}T00:00:00`));
}

export function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric"
  }).format(date);
}
