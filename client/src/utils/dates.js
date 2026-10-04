const pad = (value) => String(value).padStart(2, "0");

export function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTime(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function validDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localDateTimeToIso(value, previous = "") {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const date = new Date(value);
  // Reject non-existent wall-clock times at daylight-saving transitions.
  if (localDateTime(date) !== value) return "";
  // Preserve seconds and the exact occurrence of a repeated autumn hour.
  if (previous && localDateTime(previous) === value) return new Date(previous).toISOString();
  return date.toISOString();
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export function casinoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
