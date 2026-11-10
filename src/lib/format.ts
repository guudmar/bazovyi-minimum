// Formatting helpers: money, quantities, dates. All dates in the data are ISO strings (YYYY-MM-DD).

export function iso(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export const todayISO = (): string => iso(new Date());

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
}
/** Monday of the week the date falls in. */
export function weekStart(date: string): string {
  const d = new Date(date + 'T12:00:00');
  const wd = (d.getDay() + 6) % 7;
  return addDays(date, -wd);
}

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
export function num(v: number, digits = 0): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
/** 1 240 000 ₽ */
export const money = (v: number): string => `${v < 0 ? '−' : ''}${nf0.format(Math.abs(Math.round(v)))} ₽`;
/** +1 240 000 ₽ / −54 000 ₽ */
export const moneySigned = (v: number): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf0.format(Math.abs(Math.round(v)))} ₽`;
/** 1,2 млн ₽ — for axis ticks only */
export function moneyShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${num(v / 1_000_000, a % 1_000_000 === 0 ? 0 : 1)} млн`;
  if (a >= 1000) return `${num(v / 1000)} тыс.`;
  return num(v);
}
export function qty(v: number, unit: string): string {
  return `${num(v, Number.isInteger(v) ? 0 : 1)} ${unit}`;
}
export function pct(v: number, digits = 0): string {
  return `${num(v * 100, digits)}%`;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/** 10 ноя */
export function dShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
/** пн, 10 ноя */
export function dWeek(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]}, ${dShort(date)}`;
}
/** 10.11.2026 */
export function dFull(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}
/** Сегодня / Вчера / Завтра / 10 ноя */
export function dRel(date: string, today = todayISO()): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'Сегодня';
  if (n === -1) return 'Вчера';
  if (n === 1) return 'Завтра';
  return dShort(date);
}
/** «3 дня назад», «через 2 дня», «сегодня» */
export function dAgo(date: string, today = todayISO()): string {
  const n = daysBetween(date, today);
  if (n === 0) return 'сегодня';
  if (n > 0) return `${n} ${plural(n, 'день', 'дня', 'дней')} назад`;
  return `через ${-n} ${plural(-n, 'день', 'дня', 'дней')}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 10;
  const b = Math.abs(n) % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
export const count = (n: number, one: string, few: string, many: string): string =>
  `${num(n)} ${plural(n, one, few, many)}`;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
