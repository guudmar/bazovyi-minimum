// Pieces shared by the manager's screens: one flat list of need lines and the figures derived from it.
import type { ReactNode } from 'react';
import { lineState, lineStats, material, objectName, stockView } from '../../data/select';
import type { Data, DeliveryLine, Material, Need, NeedLine } from '../../data/types';
import { RouteBar } from '../../ui/kit';
import { num } from '../../lib/format';

export const dash: ReactNode = <span className="muted">—</span>;
/** A quantity without its unit: whole numbers as they are, fractions with one decimal. */
export const n1 = (v: number): string => num(v, Number.isInteger(v) ? 0 : 1);

export interface LineRow { need: Need; line: NeedLine; mat: Material }
export const allLines = (d: Data): LineRow[] =>
  d.needs.flatMap((need) => need.lines.map((line) => ({ need, line, mat: material(d, line.materialId) })));

export const needTitle = (d: Data, n: Need): string => `№ ${n.num} · ${objectName(d, n.objectId)}`;

/** The earliest wanted date among the positions that are not on site yet. */
export function nearestWant(n: Need): string | undefined {
  return n.lines.filter((l) => lineState(l) !== 'done').map((l) => l.wantDate).sort()[0];
}

export interface Deficit { mat: Material; demand: number; available: number; expected: number; rows: LineRow[] }
/** Materials whose unrouted demand is larger than what the warehouse can give right now. */
export function deficits(d: Data): Deficit[] {
  const map = new Map<string, Deficit>();
  for (const r of allLines(d)) {
    const open = lineStats(r.line).open;
    if (open <= 0) continue;
    let x = map.get(r.mat.id);
    if (!x) {
      const v = stockView(d, r.mat.id);
      x = { mat: r.mat, demand: 0, available: v.available, expected: v.expected, rows: [] };
      map.set(r.mat.id, x);
    }
    x.demand += open;
    x.rows.push(r);
  }
  return [...map.values()].filter((x) => x.demand > x.available).sort((a, b) => a.mat.name.localeCompare(b.mat.name, 'ru'));
}

export const ISSUE_TEXT: Record<NonNullable<DeliveryLine['issue']>, string> = {
  short: 'недовоз', wrong: 'не тот товар', damaged: 'повреждено',
};

/** Two lines that read right both in a table cell and in a phone row title (there the kit's Two would print both lines in bold). */
export function NameCell({ a, b }: { a: ReactNode; b?: ReactNode }) {
  return (
    <>
      <div className="t1" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a}</div>
      {b && <div className="t2 muted" style={{ fontWeight: 400, fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b}</div>}
    </>
  );
}

/** A material name with the route bar of its need line under it. Works as a table cell and as a phone row title. */
export function LineCell({ name, line }: { name: ReactNode; line: NeedLine }) {
  return (
    <>
      <div className="t1" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      <div style={{ margin: '6px 0 2px', maxWidth: 320 }}><RouteBar line={line} /></div>
    </>
  );
}
