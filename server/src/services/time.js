export const CASINO_TIME_ZONE = process.env.CASINO_TIME_ZONE || "Europe/Brussels";

const casinoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CASINO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const casinoClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CASINO_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23"
});

export function casinoDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(casinoDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function casinoTimeParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(casinoClockFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { weekday: Math.max(0, weekday), hour: Number(parts.hour) || 0 };
}
