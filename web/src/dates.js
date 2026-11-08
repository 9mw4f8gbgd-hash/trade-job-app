// Calendar dates stay on the shop's local clock. Weeks start Sunday.
const pad = (n) => String(n).padStart(2, '0');

export function localKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

export function addMonths(date, n) {
  const day = date.getDate();
  const first = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, dim));
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  return addDays(d, -d.getDay());
}

export function weekDays(date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function sameDay(a, b) {
  return localKey(a) === localKey(b);
}

export function inMonth(date, monthAnchor) {
  return date.getFullYear() === monthAnchor.getFullYear() && date.getMonth() === monthAnchor.getMonth();
}
