// Pieces shared by the supplier's screens.
import type { ReactNode } from 'react';
import { addDays, money, num } from '../../lib/format';
import type { Data, Purchase } from '../../data/types';

export const dash: ReactNode = <span className="muted">—</span>;
/** A quantity without its unit: whole numbers as they are, fractions with one decimal. */
export const n1 = (v: number): string => num(v, Number.isInteger(v) ? 0 : 1);
/** A unit price: kopecks are kept when there are any. */
export const rub = (v: number): string => (Number.isInteger(v) ? money(v) : `${num(v, 2)} ₽`);

/** What the purchase costs once a price is known. */
export const cost = (p: Purchase): number | undefined => (p.price === undefined ? undefined : p.price * p.qty);
export const sumCost = (list: Purchase[]): number => list.reduce((s, p) => s + (cost(p) ?? 0), 0);

/** No order placed yet and the material is wanted within two days (or the date has already passed). */
export const atRisk = (d: Data, p: Purchase): boolean =>
  (p.status === 'new' || p.status === 'sourcing') && p.wantDate <= addDays(d.today, 2);
/** The wanted date deserves red: the order is not placed in time, or the date passed and the material is not on site. */
export const wantLate = (d: Data, p: Purchase): boolean => atRisk(d, p) || (p.status !== 'received' && p.wantDate < d.today);

/** Two lines that read right both in a table cell and in a phone row title. */
export function NameCell({ a, b }: { a: ReactNode; b?: ReactNode }) {
  return (
    <>
      <div className="t1" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a}</div>
      {b && <div className="t2 muted" style={{ fontWeight: 400, fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b}</div>}
    </>
  );
}
