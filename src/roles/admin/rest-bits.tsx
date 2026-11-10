// Small pieces shared by the economist's non-finance screens.
import type { ReactNode } from 'react';
import { useData } from '../../data/store';
import { LINE_LABEL, LINE_TONE, PART_LABEL, PURCHASE_LABEL, ROUTE_LABEL, lineState, material } from '../../data/select';
import { Pill, RouteBar } from '../../ui/kit';
import { count, dShort, daysBetween, num, qty } from '../../lib/format';
import type { Data, NeedLine, NeedPart } from '../../data/types';

/** A missing value. A real zero is printed as 0, never as a dash. */
export const dash = <span className="muted">—</span>;

/** Lets a long name wrap inside a phone row title instead of being cut by an ellipsis. */
export function Wrap({ children }: { children: ReactNode }) {
  return <span style={{ whiteSpace: 'normal' }}>{children}</span>;
}

const nf3 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
/** A measured or entered value as it is: 2,75 stays 2,75 and 6,2 stays 6,2. */
export const dec = (v: number): string => nf3.format(v);
/** A quantity without its unit: whole numbers as they are, the rest to one decimal. */
export const n1 = (v: number): string => num(v, Number.isInteger(v) ? 0 : 1);

/** How long something has been waiting: «сегодня», «3 дня». */
export function waiting(since: string, today: string): string {
  const n = daysBetween(since, today);
  return n <= 0 ? 'сегодня' : count(n, 'день', 'дня', 'дней');
}

/** Where one part of a position is right now, with the order or the purchase behind it. */
function partNote(d: Data, p: NeedPart): string {
  if (p.status === 'received') return 'получено';
  if (p.status === 'shipped') return 'в пути на объект';
  if (p.status === 'clarify') return 'ждёт ответа прораба';
  if (p.route === 'supplier') {
    const pu = d.purchases.find((x) => x.partId === p.id);
    return pu ? `закупка № ${pu.num}: ${PURCHASE_LABEL[pu.status].toLowerCase()}${pu.supplier ? `, ${pu.supplier}` : ''}` : 'у снабженца';
  }
  if (p.route === 'order' && p.status === 'ordered') {
    const o = d.tradeOrders.find((x) => x.partId === p.id);
    return o ? `заказ № ${o.num}, ${o.supplier}${o.status === 'delayed' ? ', задержан' : ''}` : 'заказано, ждём на складе';
  }
  return PART_LABEL[p.status].toLowerCase();
}

/**
 * One position of a need, read-only: what was asked, the route bar and, if asked, every part with its route.
 * A position can be covered in parts and by several routes; every part stays tied to the original need.
 */
export function NeedLineBlock({ line, caption, legend, parts }: { line: NeedLine; caption?: ReactNode; legend?: boolean; parts?: boolean }) {
  const d = useData();
  const m = material(d, line.materialId);
  const st = lineState(line);
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{m.name}</div>
          {caption && <div className="muted" style={{ fontSize: 13, lineHeight: '18px', marginTop: 1 }}>{caption}</div>}
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div className="num" style={{ fontWeight: 500 }}>{qty(line.qty, m.unit)}</div>
          <div style={{ marginTop: 2 }}><Pill tone={LINE_TONE[st]}>{LINE_LABEL[st]}</Pill></div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}><RouteBar line={line} legend={legend} /></div>
      {parts && (line.parts.length ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {line.parts.map((p) => {
            const short = p.status === 'received' && p.received !== undefined && p.received < p.qty;
            const late = p.status !== 'received' && p.status !== 'clarify' && !!p.eta && p.eta < d.today;
            return (
              <div key={p.id} style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: '18px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {ROUTE_LABEL[p.route]} <span className="muted">· {partNote(d, p)}</span>
                  {p.status !== 'received' && p.eta && (late
                    ? <span className="neg"> · срок был {dShort(p.eta)}</span>
                    : <span className="muted"> · срок {dShort(p.eta)}</span>)}
                </div>
                <div className="num nowrap">{short ? `${n1(p.received ?? 0)} из ${qty(p.qty, m.unit)}` : qty(p.qty, m.unit)}</div>
              </div>
            );
          })}
        </div>
      ) : <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Маршрут ещё не назначен.</p>)}
    </div>
  );
}
