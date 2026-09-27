// "HH:MM" helpers. All arithmetic is on minutes-of-day; no Date objects for times.

export const SLOT_MIN = 30;
export const DAY_MIN = 24 * 60;

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMin(min: number): string {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function addMin(hhmm: string, delta: number): string {
  return fromMin(toMin(hhmm) + delta);
}

export const ALL_SLOTS: string[] = Array.from({ length: DAY_MIN / SLOT_MIN }, (_, i) => fromMin(i * SLOT_MIN));

// Calendar-date arithmetic on "YYYY-MM-DD" (UTC calendar, no time-of-day involved).
export function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const t = Date.UTC(y, mo - 1, d) + days * 86_400_000;
  const u = new Date(t);
  return `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, "0")}-${String(u.getUTCDate()).padStart(2, "0")}`;
}

/** Step a (date, "HH:MM") pair by any number of minutes, rolling the date over midnight. */
export function stepBy(date: string, time: string, minutes: number): { date: string; slot: string } {
  const m = toMin(time) + minutes;
  const days = Math.floor(m / DAY_MIN);
  return { date: days ? addDays(date, days) : date, slot: fromMin(m) };
}

/** Step a (date, slot) pair by ±30 minutes, rolling the date over midnight. */
export function stepSlot(date: string, slot: string, dir: 1 | -1): { date: string; slot: string } {
  const m = toMin(slot) + dir * SLOT_MIN;
  if (m >= DAY_MIN) return { date: addDays(date, 1), slot: fromMin(m) };
  if (m < 0) return { date: addDays(date, -1), slot: fromMin(m) };
  return { date, slot: fromMin(m) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(date: string): string {
  const [, mo, d] = date.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${d}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday of a "YYYY-MM-DD" calendar date. */
export function weekday(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}
