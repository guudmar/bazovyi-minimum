// Pieces shared by the manager's screens: one flat list of request lines and the figures derived from it.
import type { ReactNode } from 'react';
import { byId, lineState, lineStats, material, needOpenQty, needState, objectName, stockView, type Tone } from '../../data/select';
import type { Data, Delivery, DeliveryLine, Material, Need, NeedLine, TradeOrder } from '../../data/types';
import { num, qty } from '../../lib/format';

export const dash: ReactNode = <span className="muted">—</span>;
/** A quantity without its unit: whole numbers as they are, fractions with one decimal. */
export const n1 = (v: number): string => num(v, Number.isInteger(v) ? 0 : 1);
export const r1 = (v: number): number => Math.round(v * 10) / 10;

export interface LineRow { need: Need; line: NeedLine; mat: Material }
export const allLines = (d: Data): LineRow[] =>
  d.needs.flatMap((need) => need.lines.map((line) => ({ need, line, mat: material(d, line.materialId) })));

export const needTitle = (d: Data, n: Need): string => `№ ${n.num} · ${objectName(d, n.objectId)}`;

/** The earliest wanted date among the positions that are not on site yet. */
export function nearestWant(n: Need): string | undefined {
  return n.lines.filter((l) => lineState(l) !== 'done').map((l) => l.wantDate).sort()[0];
}
/** Something is reserved on the warehouse for this request and can be sent to the site. */
export const readyToShip = (n: Need): boolean => n.lines.some((l) => l.parts.some((p) => p.status === 'reserved'));

/** The filters of the manager's list. They may overlap: a request can wait for a decision and for the foreman's answer at once. */
export type NeedFilter = 'wait' | 'work' | 'clarify' | 'done';
export const NEED_FILTER: Record<NeedFilter, (n: Need) => boolean> = {
  wait: (n) => needOpenQty(n) > 0,
  work: (n) => needOpenQty(n) === 0 && needState(n) === 'work',
  clarify: (n) => needState(n) === 'clarify',
  done: (n) => needState(n) === 'done',
};

export interface Deficit { mat: Material; demand: number; available: number; expected: number; rows: LineRow[] }
/** Materials whose not yet provided demand is larger than what the warehouse can give right now. */
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

/* ------------------------------------------------------- linked records */
export const DELIVERY_STATE: Record<Delivery['status'], { label: string; tone: Tone }> = {
  expected: { label: 'Едет на объект', tone: 'hue' }, received: { label: 'Получена', tone: 'positive' }, problem: { label: 'Расхождение', tone: 'negative' },
};
/** The delivery a part of a request travels with, once there is one. */
export const deliveryOfPart = (d: Data, partId?: string): Delivery | undefined =>
  (partId ? d.deliveries.find((x) => x.lines.some((l) => l.partId === partId)) : undefined);
export function orderState(o: TradeOrder): { label: string; tone: Tone } {
  if (o.status === 'arrived') return { label: 'Поступил на склад', tone: 'positive' };
  return o.status === 'delayed' ? { label: 'Задержка', tone: 'negative' } : { label: 'Едет на склад', tone: 'hue' };
}
/** A delivery differs from the order: a line is short, wrong or damaged, or something arrived that was not ordered. */
export const deliveryDiffers = (dl: Delivery): boolean =>
  dl.status === 'problem' || !!dl.extras?.length || dl.lines.some((l) => !!l.issue || (l.received !== undefined && l.received !== l.qty));

/** Addresses of the records behind a request. */
export const to = {
  need: (id: string) => `/manager/needs/${id}`,
  stock: (materialId: string) => `/manager/stock?open=${materialId}`,
  order: (id: string) => `/manager/orders?open=${id}`,
  delivery: (id: string) => `/manager/orders?tab=deliveries&delivery=${id}`,
  purchase: (id: string) => `/manager?f=supplier&open=${id}`,
};

/** The place a request was created for: «1 этаж, Гостиная». A request without a place is for the whole object. */
export function placeText(d: Data, floor?: string, roomId?: string): string | undefined {
  const room = byId(d.rooms, roomId);
  const parts = [floor ?? room?.floor, room?.name].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}
/** What the quantities of a request were calculated from. */
export function basisText(d: Data, b: NonNullable<Need['basis']>): string {
  const norm = byId(d.norms, b.normId);
  const geo = byId(d.geoVersions, b.geoVersionId);
  const version = b.normVersion ?? norm?.version;
  return [
    norm ? `Рассчитано по норме «${norm.work}»` : 'Рассчитано по норме расхода',
    version ? `версия ${version}` : '',
    b.volume !== undefined ? `объём ${qty(b.volume, norm?.unit ?? '').trim()}` : '',
    geo ? `замеры: ${geo.floor}, версия ${geo.num}` : 'замеры не подтверждены',
  ].filter(Boolean).join(', ');
}
