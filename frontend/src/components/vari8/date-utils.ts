export type CalendarDate = { year: number; month: number; day: number };

export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return isValidCalendarDate(date) ? date : null;
}

export function isValidCalendarDate({
  year,
  month,
  day,
}: CalendarDate): boolean {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    return false;
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2)
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isoWeeksInYear(year: number): 52 | 53 {
  const janFirst = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  return janFirst === 4 || (janFirst === 3 && daysInMonth(year, 2) === 29)
    ? 53
    : 52;
}

export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseTimeValue(
  value: string,
): { hour: string; minute: string } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hourText = match[1] ?? "";
  const minuteText = match[2] ?? "";
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;
  return { hour: hourText, minute: minuteText };
}

export function normalizeTimePart(
  value: string,
  maximum: number,
): string | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const number = Number(value);
  return number <= maximum ? String(number).padStart(2, "0") : null;
}
