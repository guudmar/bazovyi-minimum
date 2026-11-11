// Pure selectors. Every total on a screen comes from here, summed from the rows.
import { addDays, daysBetween, weekStart, money, qty, count, dShort } from '../lib/format';
import type {
  Data, Operation, Register, Article, NeedLine, Need, PartStatus, Route, Work, User, Material, BuildObject,
  IssueKind, RequestStatus, Purchase, SiteMove, GeoStatus, GeoVersion, GeoTotals, MeasureMethod, SurfaceElement, Room,
} from './types';

export function byId<T extends { id: string }>(arr: T[], id?: string | null): T | undefined {
  return id ? arr.find((x) => x.id === id) : undefined;
}
export const userName = (d: Data, id?: string): string => byId(d.users, id)?.name ?? '—';
export const material = (d: Data, id: string): Material => d.materials.find((m) => m.id === id)!;
export const objectName = (d: Data, id?: string): string => byId(d.objects, id)?.name ?? '—';

/* ------------------------------------------------------------------ money */

export interface Scope { directionId?: string; entityId?: string; registerId?: string }

export function registersIn(d: Data, s: Scope = {}): Register[] {
  return d.registers.filter((r) => {
    if (s.registerId) return r.id === s.registerId;
    if (s.entityId) return r.entityId === s.entityId;
    if (s.directionId) return byId(d.entities, r.entityId)?.directionId === s.directionId;
    return true;
  });
}

/** Balance of one register at the end of `upTo` (default: now). A transfer leaves on its date and arrives when confirmed. */
export function registerBalance(d: Data, regId: string, upTo?: string): number {
  const r = byId(d.registers, regId);
  if (!r) return 0;
  let b = r.opening;
  for (const op of d.operations) {
    if (op.kind === 'transfer') {
      if (op.registerId === regId && (!upTo || op.date <= upTo)) b -= op.amount;
      if (op.toRegisterId === regId && op.transit === 'received' && (!upTo || (op.receivedDate ?? op.date) <= upTo)) b += op.amount;
    } else if (op.registerId === regId && (!upTo || op.date <= upTo)) {
      b += op.kind === 'in' ? op.amount : -op.amount;
    }
  }
  return b;
}
export const onHand = (d: Data, s: Scope = {}, upTo?: string): number =>
  registersIn(d, s).reduce((sum, r) => sum + registerBalance(d, r.id, upTo), 0);

/** Transfers that were sent and not yet confirmed by the receiving side. */
export function transits(d: Data, s: Scope = {}): Operation[] {
  const ids = new Set(registersIn(d, s).map((r) => r.id));
  return d.operations
    .filter((o) => o.kind === 'transfer' && o.transit === 'sent' && (ids.has(o.registerId) || ids.has(o.toRegisterId ?? '')))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export const transitTotal = (d: Data, s: Scope = {}): number => transits(d, s).reduce((sum, o) => sum + o.amount, 0);
/** How long a transfer has been on its way, in the same words everywhere: «в пути 3 дня», «отправлен сегодня». */
export function transitAge(d: Data, op: Operation): string {
  const n = daysBetween(op.date, d.today);
  return n <= 0 ? 'отправлен сегодня' : `в пути ${count(n, 'день', 'дня', 'дней')}`;
}

/** Income and expense operations in scope and period. Internal transfers are never counted as flow. */
export function flowOps(d: Data, s: Scope = {}, from?: string, to?: string): Operation[] {
  const ids = new Set(registersIn(d, s).map((r) => r.id));
  return d.operations.filter(
    (o) => o.kind !== 'transfer' && ids.has(o.registerId) && (!from || o.date >= from) && (!to || o.date <= to),
  );
}
export const sumIn = (ops: Operation[]): number => ops.filter((o) => o.kind === 'in').reduce((s, o) => s + o.amount, 0);
export const sumOut = (ops: Operation[]): number => ops.filter((o) => o.kind === 'out').reduce((s, o) => s + o.amount, 0);

export interface WeekFlow { start: string; end: string; in: number; out: number; current: boolean }
export function weeklyFlows(d: Data, s: Scope = {}, weeks = 8): WeekFlow[] {
  const cur = weekStart(d.today);
  const out: WeekFlow[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(cur, -7 * i);
    const end = addDays(start, 6);
    const ops = flowOps(d, s, start, end);
    out.push({ start, end, in: sumIn(ops), out: sumOut(ops), current: i === 0 });
  }
  return out;
}

export function byArticle(d: Data, s: Scope, from: string, to: string, flow: 'in' | 'out'): { article: Article; amount: number }[] {
  const ops = flowOps(d, s, from, to).filter((o) => o.kind === flow);
  return d.articles
    .filter((a) => a.flow === flow)
    .map((article) => ({ article, amount: ops.filter((o) => o.articleId === article.id).reduce((x, o) => x + o.amount, 0) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export interface ForecastDay { date: string; in: number; out: number; balance: number }
/** Money of the group day by day: what is on hand and in transit today, then the open items of the payment calendar. */
export function forecast(d: Data, days = 14, s: Scope = {}): ForecastDay[] {
  let balance = onHand(d, s) + transitTotal(d, s);
  const ents = new Set(registersIn(d, s).map((r) => r.entityId));
  const res: ForecastDay[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(d.today, i);
    // an overdue item has not been paid yet, so it still lands on today
    const items = d.plan.filter((p) => (i === 0 ? p.date <= date : p.date === date) && p.status !== 'paid' && ents.has(p.entityId));
    const inc = items.filter((p) => p.flow === 'in').reduce((x, p) => x + p.amount, 0);
    const exp = items.filter((p) => p.flow === 'out').reduce((x, p) => x + p.amount, 0);
    balance += inc - exp;
    res.push({ date, in: inc, out: exp, balance });
  }
  return res;
}

export const REQUEST_LABEL: Record<RequestStatus, string> = {
  pending: 'Ждёт решения', approved: 'К оплате', noted: 'К оплате', clarify: 'Нужен ответ', rejected: 'Отклонена', paid: 'Оплачена',
};
export const REQUEST_TONE: Record<RequestStatus, Tone> = {
  pending: 'warning', approved: 'hue', noted: 'hue', clarify: 'negative', rejected: 'neutral', paid: 'positive',
};
export type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'hue';

/* --------------------------------------------------------- needs & supply */

export const ROUTE_LABEL: Record<Route, string> = {
  stock: 'Со склада', order: 'Заказ', supplier: 'Через снабженца', clarify: 'Вопрос прорабу',
};
export const ROUTE_SHORT: Record<Route, string> = { stock: 'склад', order: 'заказ', supplier: 'снабженец', clarify: 'вопрос' };
export const PART_LABEL: Record<PartStatus, string> = {
  reserved: 'Отложено на складе', ordered: 'Заказано', handed: 'У снабженца', shipped: 'Едет', received: 'Получено', clarify: 'Нужен ответ прораба',
};

export interface LineStats { allocated: number; open: number; received: number; shipped: number; pending: number }
export function lineStats(l: NeedLine): LineStats {
  const allocated = l.parts.reduce((s, p) => s + p.qty, 0);
  const received = l.parts.reduce((s, p) => s + (p.received ?? 0), 0);
  const shipped = l.parts.filter((p) => p.status === 'shipped').reduce((s, p) => s + p.qty, 0);
  return { allocated, open: Math.max(0, l.qty - allocated), received, shipped, pending: Math.max(0, l.qty - received) };
}

/** The fate of one position, in the words the foreman sees. */
export type LineState = 'check' | 'stock' | 'order' | 'handed' | 'shipping' | 'partial' | 'clarify' | 'done';
export function lineState(l: NeedLine): LineState {
  const s = lineStats(l);
  const every = l.parts.length > 0 && l.parts.every((p) => p.status === 'received');
  if (every && s.open === 0) return 'done';
  if (l.parts.some((p) => p.status === 'clarify')) return 'clarify';
  if (s.received > 0) return 'partial';
  if (l.parts.some((p) => p.status === 'shipped')) return 'shipping';
  if (l.parts.length === 0) return 'check';
  if (l.parts.some((p) => p.status === 'handed')) return 'handed';
  if (l.parts.some((p) => p.status === 'ordered')) return 'order';
  return 'stock';
}
export const LINE_LABEL: Record<LineState, string> = {
  check: 'Ждёт', stock: 'Есть на складе', order: 'Заказано', handed: 'Заказано', shipping: 'Едет', partial: 'Частично', clarify: 'Нужен ответ', done: 'Получено',
};
export const LINE_TONE: Record<LineState, Tone> = {
  check: 'warning', stock: 'hue', order: 'hue', handed: 'hue', shipping: 'hue', partial: 'hue', clarify: 'negative', done: 'positive',
};

export type NeedState = 'new' | 'work' | 'clarify' | 'done';
export function needState(n: Need): NeedState {
  const states = n.lines.map(lineState);
  if (states.every((s) => s === 'done')) return 'done';
  if (states.includes('clarify') && !n.question?.answer) return 'clarify';
  if (n.lines.every((l) => l.parts.length === 0)) return 'new';
  return 'work';
}
export const NEED_LABEL: Record<NeedState, string> = { new: 'Ждёт', work: 'В работе', clarify: 'Нужен ответ', done: 'Готово' };
export const NEED_TONE: Record<NeedState, Tone> = { new: 'warning', work: 'hue', clarify: 'negative', done: 'positive' };
/** Share of the need that has physically arrived, by quantity of each line. */
export function needProgress(n: Need): number {
  const parts = n.lines.map((l) => Math.min(1, lineStats(l).received / l.qty));
  return parts.reduce((a, b) => a + b, 0) / Math.max(1, parts.length);
}
export function needOpenQty(n: Need): number {
  return n.lines.reduce((s, l) => s + lineStats(l).open, 0);
}

export interface StockView { total: number; reserved: number; available: number; expected: number; place: string }
export function stockView(d: Data, materialId: string): StockView {
  const st = d.stock.find((x) => x.materialId === materialId);
  const expected = d.tradeOrders
    .filter((o) => o.materialId === materialId && o.status !== 'arrived')
    .reduce((s, o) => s + o.qty, 0);
  const total = st?.total ?? 0;
  const reserved = st?.reserved ?? 0;
  return { total, reserved, available: Math.max(0, total - reserved), expected, place: st?.place ?? '—' };
}

export interface SiteRow { material: Material; received: number; moved: number; issued: number; used: number; lost: number; returned: number; left: number }
/** Materials physically on a site. "Issued" is handed to a crew and still on site until it is used. */
export function siteStock(d: Data, objectId: string): SiteRow[] {
  const map = new Map<string, SiteRow>();
  for (const m of d.siteMoves.filter((x) => x.objectId === objectId)) {
    let row = map.get(m.materialId);
    if (!row) {
      row = { material: material(d, m.materialId), received: 0, moved: 0, issued: 0, used: 0, lost: 0, returned: 0, left: 0 };
      map.set(m.materialId, row);
    }
    if (m.kind === 'receive') row.received += m.qty;
    if (m.kind === 'move') row.moved += m.qty;
    if (m.kind === 'issue') row.issued += m.qty;
    if (m.kind === 'use') row.used += m.qty;
    if (m.kind === 'loss') row.lost += m.qty;
    if (m.kind === 'return') row.returned += m.qty;
  }
  const rows = [...map.values()];
  // a move to another place of the same site keeps the material on the object; only a move away from the site reduces what is left
  const away = (id: string) => d.siteMoves.filter((m) => m.objectId === objectId && m.materialId === id && m.kind === 'move' && !m.place).reduce((s, m) => s + m.qty, 0);
  for (const r of rows) r.left = r.received - away(r.material.id) - r.used - r.lost - r.returned;
  return rows.sort((a, b) => a.material.name.localeCompare(b.material.name, 'ru'));
}
export const MOVE_LABEL: Record<SiteMove['kind'], string> = {
  receive: 'Получено', move: 'Перемещено', issue: 'Выдано бригаде', use: 'Использовано', return: 'Возврат', loss: 'Потеря или повреждение',
};

export const PURCHASE_LABEL: Record<Purchase['status'], string> = {
  new: 'Новая', sourcing: 'Ищем поставщика', ordered: 'Заказано', shipped: 'Едет', received: 'Получено',
};
export const PURCHASE_TONE: Record<Purchase['status'], Tone> = {
  new: 'warning', sourcing: 'hue', ordered: 'hue', shipped: 'hue', received: 'positive',
};

/* ------------------------------------------------------------------ works */

export const workDone = (w: Work): number => w.facts.reduce((s, f) => s + f.qty, 0);
/** Done and not yet inside any act: what the foreman can present for acceptance. */
export function workToPresent(d: Data, w: Work): number {
  const inActs = d.avrs
    .filter((a) => a.status !== 'returned')
    .flatMap((a) => a.lines)
    .filter((l) => l.workId === w.id)
    .reduce((s, l) => s + l.qty, 0);
  return Math.max(0, round1(workDone(w) - inActs));
}
export type WorkState = 'accepted' | 'done' | 'late' | 'progress' | 'todo';
export function workState(w: Work, today: string): WorkState {
  const done = workDone(w);
  if (w.accepted >= w.plan - 1e-9) return 'accepted';
  if (done >= w.plan - 1e-9) return 'done';
  if (w.deadline < today) return 'late';
  return done > 0 ? 'progress' : 'todo';
}
export const WORK_LABEL: Record<WorkState, string> = {
  accepted: 'Принято', done: 'Ждёт приёмки', late: 'Срок прошёл', progress: 'В работе', todo: 'Не начато',
};
export const WORK_TONE: Record<WorkState, Tone> = { accepted: 'positive', done: 'warning', late: 'negative', progress: 'hue', todo: 'neutral' };
export const round1 = (v: number): number => Math.round(v * 10) / 10;

export const roomFloor = (r: { length: number; width: number }): number => round1(r.length * r.width);
export function roomWalls(r: { length: number; width: number; height: number; openings: { w: number; h: number }[] }): number {
  const gross = 2 * (r.length + r.width) * r.height;
  const holes = r.openings.reduce((s, o) => s + o.w * o.h, 0);
  return round1(gross - holes);
}
export const roomVolume = (r: { length: number; width: number; height: number }): number => round1(r.length * r.width * r.height);

export const ISSUE_LABEL: Record<IssueKind, string> = {
  defect: 'Дефект', rework: 'Переделка', loss: 'Потеря', damage: 'Повреждение материала',
  geometry: 'Несоответствие геометрии', delay: 'Задержка поставки', blocker: 'Препятствие для работ',
};

/* ---------------------------------------------------------------- objects */

export interface ObjectView {
  object: BuildObject;
  income: number;
  spent: number;
  progress: number;
  accepted: number;
  openLines: number;
  lateWorks: number;
  openIssues: number;
  expectedResult: number;
}
export function objectView(d: Data, o: BuildObject): ObjectView {
  const ops = d.operations.filter((x) => x.objectId === o.id);
  const works = d.works.filter((w) => w.objectId === o.id);
  const ratio = (f: (w: Work) => number) => (works.length ? works.reduce((s, w) => s + Math.min(1, f(w) / w.plan), 0) / works.length : 0);
  const needs = d.needs.filter((n) => n.objectId === o.id);
  return {
    object: o,
    income: sumIn(ops),
    spent: sumOut(ops),
    progress: ratio(workDone),
    accepted: ratio((w) => w.accepted),
    openLines: needs.reduce((s, n) => s + n.lines.filter((l) => lineState(l) !== 'done').length, 0),
    lateWorks: works.filter((w) => workState(w, d.today) === 'late').length,
    openIssues: d.issues.filter((i) => i.objectId === o.id && i.status !== 'done').length,
    expectedResult: o.contractSum - o.planCost,
  };
}

/* ------------------------------------------------- tasks and notifications */

export interface Task { id: string; title: string; sub: string; to: string; tone: Tone }

export function tasksFor(d: Data, u: User): Task[] {
  const t: Task[] = [];
  const mine = new Set(u.objectIds ?? []);
  if (u.role === 'foreman') {
    for (const dl of d.deliveries.filter((x) => x.status === 'expected' && mine.has(x.objectId) && x.eta <= d.today))
      t.push({ id: dl.id, title: `Принять поставку: ${dl.source}`, sub: `${objectName(d, dl.objectId)} · ${count(dl.lines.length, 'позиция', 'позиции', 'позиций')}`, to: `/foreman/deliveries/${dl.id}`, tone: 'hue' });
    for (const f of d.floors.filter((x) => mine.has(x.objectId))) {
      const v = currentGeo(d, f.objectId, f.name);
      if (v?.status === 'draft' && roomsOn(d, f.objectId, f.name).length)
        t.push({ id: v.id, title: `Отправить замеры на проверку: ${f.name}`, sub: `${objectName(d, f.objectId)}${v.note ? ' · вернули: ' + v.note : v.reason ? ' · ' + v.reason : ''}`, to: '/foreman/geometry', tone: v.note ? 'warning' : 'neutral' });
    }
    for (const n of d.needs.filter((x) => mine.has(x.objectId) && x.question && !x.question.answer))
      t.push({ id: n.id, title: `Ответить менеджеру по заявке № ${n.num}`, sub: n.question!.text, to: `/foreman/needs/${n.id}`, tone: 'warning' });
    for (const w of d.works.filter((x) => mine.has(x.objectId))) {
      const st = workState(w, d.today);
      if (st === 'late') t.push({ id: w.id, title: `Срок прошёл: ${w.name}`, sub: `${objectName(d, w.objectId)} · выполнено ${qty(workDone(w), w.unit)} из ${qty(w.plan, w.unit)}`, to: '/foreman/works', tone: 'negative' });
      else if (workToPresent(d, w) > 0) t.push({ id: w.id, title: `Сдать работу: ${w.name}`, sub: `${objectName(d, w.objectId)} · ${qty(workToPresent(d, w), w.unit)} без акта`, to: '/foreman/works', tone: 'neutral' });
    }
  }
  if (u.role === 'owner') {
    for (const r of d.requests.filter((x) => x.status === 'pending'))
      t.push({ id: r.id, title: `Согласовать: ${money(r.amount)}`, sub: `${r.basis} · оплатить до ${dShort(r.due)}`, to: '/owner/approvals', tone: 'warning' });
    for (const o of transits(d).filter((x) => daysBetween(x.date, d.today) >= 2))
      t.push({ id: o.id, title: `Перевод ${money(o.amount)} ${transitAge(d, o)}`, sub: `${byId(d.registers, o.registerId)?.name} → ${byId(d.registers, o.toRegisterId)?.name}`, to: '/owner/money', tone: 'negative' });
  }
  if (u.role === 'manager') {
    for (const n of d.needs.filter((x) => needOpenQty(x) > 0))
      t.push({ id: n.id, title: `Обеспечить заявку № ${n.num}`, sub: `${objectName(d, n.objectId)} · ${count(n.lines.filter((l) => lineStats(l).open > 0).length, 'позиция', 'позиции', 'позиций')} не обеспечено`, to: `/manager/needs/${n.id}`, tone: n.urgent ? 'negative' : 'hue' });
    // what is already held on the warehouse for a site and only waits to be sent
    for (const n of d.needs.filter((x) => x.lines.some((l) => l.parts.some((p) => p.status === 'reserved'))))
      t.push({ id: n.id + 's', title: `Отправить на объект: заявка № ${n.num}`, sub: `${objectName(d, n.objectId)} · отложено на складе`, to: `/manager/needs/${n.id}`, tone: 'hue' });
    for (const o of d.tradeOrders.filter((x) => x.status === 'delayed'))
      t.push({ id: o.id, title: `Задержка заказа № ${o.num}: ${o.supplier}`, sub: `${material(d, o.materialId).name} · ждали ${dShort(o.eta)}`, to: `/manager/orders?open=${o.id}`, tone: 'negative' });
    for (const n of d.needs.filter((x) => x.question?.answer && x.lines.some((l) => l.parts.some((p) => p.status === 'clarify'))))
      t.push({ id: n.id + 'a', title: `Прораб ответил по заявке № ${n.num}`, sub: n.question!.answer!, to: `/manager/needs/${n.id}`, tone: 'hue' });
  }
  if (u.role === 'supplier') {
    for (const p of d.purchases.filter((x) => x.status === 'new'))
      t.push({ id: p.id, title: `Новая закупка № ${p.num}`, sub: `${material(d, p.materialId).name} · ${qty(p.qty, material(d, p.materialId).unit)} · ${objectName(d, p.objectId)}`, to: `/supplier/purchase/${p.id}`, tone: 'hue' });
    for (const p of d.purchases.filter((x) => x.status === 'sourcing'))
      t.push({ id: p.id, title: `Выбрать поставщика: закупка № ${p.num}`, sub: `${material(d, p.materialId).name} · нужно к ${dShort(p.wantDate)}`, to: `/supplier/purchase/${p.id}`, tone: p.wantDate <= addDays(d.today, 2) ? 'negative' : 'warning' });
  }
  if (u.role === 'admin') {
    for (const o of transits(d))
      t.push({ id: o.id, title: `Подтвердить перевод ${money(o.amount)}`, sub: `${byId(d.registers, o.registerId)?.name} → ${byId(d.registers, o.toRegisterId)?.name} · отправлен ${dShort(o.date)}`, to: '/admin/money?tab=transfers', tone: daysBetween(o.date, d.today) >= 2 ? 'negative' : 'warning' });
    const unmatched = d.operations.filter((o) => o.bank === 'unmatched');
    if (unmatched.length) t.push({ id: 'bank', title: `Сверить с банком: ${count(unmatched.length, 'операция', 'операции', 'операций')}`, sub: `На сумму ${money(unmatched.reduce((s, o) => s + o.amount, 0))}`, to: '/admin/money?tab=transfers', tone: 'warning' });
    for (const r of d.requests.filter((x) => x.status === 'approved' || x.status === 'noted'))
      t.push({ id: r.id, title: `Оплатить согласованную заявку № ${r.num}`, sub: `${money(r.amount)} · ${r.basis}`, to: '/admin/requests', tone: r.due <= d.today ? 'negative' : 'hue' });
    for (const f of d.floors) {
      const v = currentGeo(d, f.objectId, f.name);
      if (v?.status === 'review')
        t.push({ id: v.id, title: `Проверить замеры: ${objectName(d, f.objectId)}, ${f.name}`, sub: `версия ${v.num} · передана ${dShort(v.sentAt ?? v.createdAt)}`, to: `/admin/objects/${f.objectId}?tab=geometry`, tone: 'hue' });
    }
    const queue = d.sources.filter((x) => x.status !== 'matched');
    if (queue.length) t.push({ id: 'catalog', title: `Новые позиции поставщиков: ${count(queue.length, 'позиция', 'позиции', 'позиций')}`, sub: queue.slice(0, 2).map((x) => x.name).join('; '), to: '/admin/refs?tab=queue', tone: 'neutral' });
    for (const a of d.avrs.filter((x) => x.status === 'review'))
      t.push({ id: a.id, title: `Проверить АВР № ${a.num}`, sub: `${objectName(d, a.objectId)} · от ${dShort(a.date)}`, to: `/admin/objects/${a.objectId}?tab=avr`, tone: 'hue' });
  }
  return t;
}

export interface Notice { id: string; at: string; title: string; sub: string; to: string }
/** Recent events worth knowing about. Owners get only the significant ones. */
export function noticesFor(d: Data, u: User): Notice[] {
  const n: Notice[] = [];
  const mine = new Set(u.objectIds ?? []);
  if (u.role === 'owner' || u.role === 'admin') {
    const fc = forecast(d, 14);
    const low = fc.reduce((a, b) => (b.balance < a.balance ? b : a), fc[0]);
    if (low && low.balance < 0) n.push({ id: 'gap', at: d.today, title: `Кассовый разрыв ${dShort(low.date)}`, sub: `Прогноз остатка ${money(low.balance)}`, to: u.role === 'owner' ? '/owner/money?tab=calendar' : '/admin/money?tab=plan' });
    for (const o of d.tradeOrders.filter((x) => x.status === 'delayed'))
      n.push({ id: o.id, at: o.eta, title: `Задержка поставки: ${material(d, o.materialId).name}`, sub: `${o.supplier}, заказ № ${o.num}. Срок был ${dShort(o.eta)}`, to: u.role === 'owner' ? '/owner/objects' : '/admin' });
    for (const o of d.objects) {
      const v = objectView(d, o);
      if (v.spent > o.planCost) n.push({ id: o.id, at: d.today, title: `Превышен бюджет: ${o.name}`, sub: `Затраты ${money(v.spent)} при плане ${money(o.planCost)}`, to: u.role === 'owner' ? '/owner/objects' : `/admin/objects/${o.id}` });
    }
    for (const r of d.requests.filter((x) => x.status === 'pending'))
      n.push({ id: r.id, at: r.date, title: `Заявка на ${money(r.amount)} ждёт решения`, sub: `${userName(d, r.authorId)} · ${r.basis}`, to: u.role === 'owner' ? '/owner/approvals' : '/admin/requests' });
  }
  if (u.role === 'foreman') {
    for (const need of d.needs.filter((x) => mine.has(x.objectId))) {
      for (const l of need.lines) for (const p of l.parts.filter((x) => x.status === 'shipped'))
        n.push({ id: p.id, at: p.eta ?? need.date, title: `Едет на объект: ${material(d, l.materialId).name}`, sub: `${qty(p.qty, material(d, l.materialId).unit)} · заявка № ${need.num}`, to: '/foreman/materials?tab=deliveries' });
      if (need.question && !need.question.answer) n.push({ id: need.id + 'q', at: need.date, title: `Вопрос по заявке № ${need.num}`, sub: `${need.question.by}: ${need.question.text}`, to: `/foreman/needs/${need.id}` });
    }
    for (const v of d.geoVersions.filter((x) => mine.has(x.objectId) && (x.status === 'confirmed' || (x.status === 'draft' && x.note))))
      n.push({ id: v.id, at: v.confirmedAt ?? v.createdAt, title: v.status === 'confirmed' ? `Замеры приняты: ${v.floor}` : `Замеры вернули на доработку: ${v.floor}`, sub: `${objectName(d, v.objectId)}${v.note ? ' · ' + v.note : ''}`, to: '/foreman/geometry' });
    for (const a of d.avrs.filter((x) => mine.has(x.objectId) && x.status !== 'review'))
      n.push({ id: a.id, at: a.date, title: `Акт № ${a.num}: ${a.status === 'accepted' ? 'объёмы приняты' : 'возвращён на доработку'}`, sub: objectName(d, a.objectId), to: '/foreman/works' });
    for (const r of d.requests.filter((x) => x.authorId === u.id && x.decisions.length))
      n.push({ id: r.id, at: r.decisions[r.decisions.length - 1].at, title: `Заявка № ${r.num}: ${REQUEST_LABEL[r.status].toLowerCase()}`, sub: `${money(r.amount)} · ${r.basis}`, to: '/foreman' });
  }
  if (u.role === 'manager') {
    for (const need of d.needs.filter((x) => needState(x) === 'new'))
      n.push({ id: need.id, at: need.date, title: `Новая заявка № ${need.num}`, sub: `${objectName(d, need.objectId)} · ${count(need.lines.length, 'позиция', 'позиции', 'позиций')}`, to: `/manager/needs/${need.id}` });
    for (const dl of d.deliveries.filter((x) => x.status === 'problem'))
      n.push({ id: dl.id, at: dl.receivedAt ?? dl.eta, title: `Расхождение при получении, поставка № ${dl.num}`, sub: `${objectName(d, dl.objectId)}${dl.comment ? ' · ' + dl.comment : ''}`, to: `/manager/orders?delivery=${dl.id}` });
  }
  if (u.role === 'supplier') {
    for (const p of d.purchases.filter((x) => x.status !== 'received'))
      n.push({ id: p.id, at: p.history[p.history.length - 1]?.at ?? d.today, title: `Закупка № ${p.num}: ${PURCHASE_LABEL[p.status].toLowerCase()}`, sub: `${material(d, p.materialId).name} · ${objectName(d, p.objectId)}`, to: `/supplier/purchase/${p.id}` });
    for (const r of d.requests.filter((x) => x.authorId === u.id && x.decisions.length))
      n.push({ id: r.id, at: r.decisions[r.decisions.length - 1].at, title: `Заявка № ${r.num}: ${REQUEST_LABEL[r.status].toLowerCase()}`, sub: `${money(r.amount)} · ${r.basis}`, to: '/supplier?view=pay' });
  }
  return n.sort((a, b) => b.at.localeCompare(a.at));
}

/* ----------------------------------------------------------------- search */

export interface Hit { id: string; kind: string; title: string; sub: string; to: string }
export function search(d: Data, u: User, q: string): Hit[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const has = (...parts: (string | undefined)[]) => parts.some((p) => p?.toLowerCase().includes(s));
  const home = `/${u.role}`;
  const hits: Hit[] = [];
  const canMoney = u.role === 'owner' || u.role === 'admin';
  const objs = u.role === 'foreman' ? d.objects.filter((o) => u.objectIds?.includes(o.id)) : d.objects;
  for (const o of objs) if (has(o.name, o.address, o.customer))
    hits.push({ id: o.id, kind: 'Объект', title: o.name, sub: o.address, to: u.role === 'admin' ? `/admin/objects/${o.id}` : u.role === 'foreman' ? `/foreman/object/${o.id}` : u.role === 'owner' ? '/owner/objects' : home });
  for (const m of d.materials) if (has(m.name, m.group)) {
    const st = stockView(d, m.id);
    hits.push({ id: m.id, kind: 'Материал', title: m.name, sub: `${m.group} · на складе доступно ${qty(st.available, m.unit)}`, to: u.role === 'manager' ? `/manager/stock?open=${m.id}` : u.role === 'admin' ? '/admin/refs' : u.role === 'foreman' ? '/foreman/materials?tab=stock' : home });
  }
  if (u.role !== 'owner') for (const n of d.needs) {
    if (u.role === 'foreman' && !u.objectIds?.includes(n.objectId)) continue;
    if (has(`№ ${n.num}`, `потребность ${n.num}`, `заявка ${n.num}`, n.comment, ...n.lines.map((l) => material(d, l.materialId).name)))
      hits.push({ id: n.id, kind: 'Заявка на материалы', title: `Заявка № ${n.num}`, sub: `${objectName(d, n.objectId)} · ${NEED_LABEL[needState(n)]}`, to: u.role === 'manager' ? `/manager/needs/${n.id}` : u.role === 'foreman' ? `/foreman/needs/${n.id}` : u.role === 'supplier' ? '/supplier' : `/admin/requests?tab=tmc&open=${n.id}` });
  }
  if (canMoney) for (const o of d.operations) if (has(o.counterparty, o.comment))
    hits.push({ id: o.id, kind: 'Операция', title: `${o.kind === 'in' ? '+' : o.kind === 'out' ? '−' : ''}${money(o.amount)} · ${o.counterparty ?? 'Перевод'}`, sub: `${dShort(o.date)} · ${o.comment ?? ''}`, to: u.role === 'admin' ? '/admin/money?tab=ops' : '/owner/money' });
  if (canMoney || u.role === 'supplier') for (const r of d.requests) if (has(r.basis, `заявка ${r.num}`))
    hits.push({ id: r.id, kind: 'Заявка на оплату', title: `№ ${r.num} · ${money(r.amount)}`, sub: `${r.basis} · ${REQUEST_LABEL[r.status]}`, to: u.role === 'owner' ? '/owner/approvals' : u.role === 'admin' ? '/admin/requests' : '/supplier?view=pay' });
  return hits.slice(0, 40);
}

/* ------------------------------------------- geometry: floors and versions */

export const GEO_LABEL: Record<GeoStatus, string> = { draft: 'Черновик', review: 'На проверке', confirmed: 'Принято', replaced: 'Заменено' };
export const GEO_TONE: Record<GeoStatus, Tone> = { draft: 'neutral', review: 'warning', confirmed: 'positive', replaced: 'neutral' };
export const METHOD_LABEL: Record<MeasureMethod, string> = { manual: 'Ручной ввод', laser: 'Лазерный дальномер', phone: 'Измерение телефоном' };
export const ELEMENT_LABEL: Record<SurfaceElement['kind'], string> = { niche: 'Ниша', ledge: 'Выступ или короб', slope: 'Откосы', other: 'Другая поверхность' };

/** Floors of an object in the order they were added; a floor that only exists on a room is included too. */
export function floorsOf(d: Data, objectId: string): string[] {
  const names = d.floors.filter((f) => f.objectId === objectId).map((f) => f.name);
  for (const r of d.rooms) if (r.objectId === objectId && !names.includes(r.floor)) names.push(r.floor);
  return names;
}
export const roomsOn = (d: Data, objectId: string, floor: string): Room[] => d.rooms.filter((r) => r.objectId === objectId && r.floor === floor);
export function floorVersions(d: Data, objectId: string, floor: string): GeoVersion[] {
  return d.geoVersions.filter((v) => v.objectId === objectId && v.floor === floor).sort((a, b) => b.num - a.num);
}
/** The version being worked on: the newest one. */
export const currentGeo = (d: Data, objectId: string, floor: string): GeoVersion | undefined => floorVersions(d, objectId, floor)[0];
/** The version calculations may rely on: the newest confirmed one. */
export const confirmedGeo = (d: Data, objectId: string, floor: string): GeoVersion | undefined =>
  floorVersions(d, objectId, floor).find((v) => v.status === 'confirmed');

export const elementArea = (e: SurfaceElement): number => round1(e.length * e.height * e.count);
/** Reveals of doors and windows are their own surface and are not part of the walls. */
export const roomSlopes = (r: Room): number => round1((r.elements ?? []).filter((e) => e.kind === 'slope').reduce((s, e) => s + elementArea(e), 0));
/** The surface a work is calculated from. Walls include niches and ledges measured in the room. */
export function roomSurface(r: Room, base: 'walls' | 'floor' | 'ceiling'): number {
  if (base !== 'walls') return roomFloor(r);
  const extra = (r.elements ?? []).filter((e) => e.kind === 'niche' || e.kind === 'ledge' || e.kind === 'other').reduce((s, e) => s + elementArea(e), 0);
  return round1(roomWalls(r) + extra);
}
export function totalsOf(rooms: Room[]): GeoTotals {
  const sum = (f: (r: Room) => number) => round1(rooms.reduce((s, r) => s + f(r), 0));
  return { rooms: rooms.length, floor: sum(roomFloor), walls: sum((r) => roomSurface(r, 'walls')), ceiling: sum(roomFloor), perimeter: sum((r) => 2 * (r.length + r.width)) };
}
/**
 * The room as it was measured in the confirmed version of its floor. Volumes for planning are taken from here,
 * so a draft that is still being edited never leaks into a calculation.
 */
export function basisRoom(d: Data, room: Room): Room | undefined {
  return confirmedGeo(d, room.objectId, room.floor)?.snapshot?.find((r) => r.id === room.id);
}
/** True when the floor has a newer version than the confirmed one: the basis is about to change. */
export function basisIsOld(d: Data, objectId: string, floor: string): boolean {
  const c = confirmedGeo(d, objectId, floor);
  return !!c && currentGeo(d, objectId, floor)?.id !== c.id;
}
export const geoVersionLabel = (v?: GeoVersion): string => (v ? `${v.floor}, версия ${v.num}` : 'геометрия не подтверждена');

/** Storage places on a site: the site store and every floor. */
export function sitePlaces(d: Data, objectId: string): string[] {
  return ['Склад на объекте', ...floorsOf(d, objectId)];
}

/* ------------------------------------------------------------- documents */

export interface Doc { id: string; kind: string; title: string; sub: string; date: string; status: string; tone: Tone; to: string; objectId?: string }
/**
 * Documents and working records as results of processes. Each one keeps its status, author, date and
 * the link to the record it came from; the list shows only what the role may see.
 */
export function documents(d: Data, u: User): Doc[] {
  const docs: Doc[] = [];
  const mine = (objectId: string) => u.role !== 'foreman' || !!u.objectIds?.includes(objectId);
  const role = u.role;
  if (role === 'foreman' || role === 'admin') {
    for (const a of d.acts.filter((x) => mine(x.objectId))) {
      const v = byId(d.geoVersions, a.versionId);
      docs.push({ id: a.id, kind: 'Замеры', title: `Акт замеров № ${a.num}${a.floor ? ', ' + a.floor : ''}`, sub: `${objectName(d, a.objectId)} · ${a.by}`, date: a.date,
        status: v ? GEO_LABEL[v.status] : 'Сформирован', tone: v ? GEO_TONE[v.status] : 'neutral', objectId: a.objectId,
        to: role === 'admin' ? `/admin/objects/${a.objectId}?tab=geometry` : (a.floor ? `/foreman/geometry/${encodeURIComponent(a.floor)}` : '/foreman/geometry') });
    }
    for (const a of d.avrs.filter((x) => mine(x.objectId)))
      docs.push({ id: a.id, kind: role === 'foreman' ? 'Акт' : 'АВР', title: `Акт выполненных работ № ${a.num}`, sub: `${objectName(d, a.objectId)} · ${a.by}`, date: a.date,
        status: a.status === 'accepted' ? 'Объёмы приняты' : a.status === 'review' ? 'На проверке' : 'Возвращён', tone: a.status === 'accepted' ? 'positive' : a.status === 'review' ? 'warning' : 'negative',
        objectId: a.objectId, to: role === 'admin' ? `/admin/objects/${a.objectId}?tab=avr` : '/foreman/works' });
    for (const i of d.issues.filter((x) => mine(x.objectId)))
      docs.push({ id: i.id, kind: 'Замечание', title: i.text, sub: `${objectName(d, i.objectId)} · ${i.place}`, date: i.date,
        status: i.status === 'done' ? 'Решено' : i.status === 'work' ? 'Решается' : 'Открыто', tone: i.status === 'done' ? 'positive' : i.status === 'work' ? 'warning' : 'negative',
        objectId: i.objectId, to: role === 'admin' ? `/admin/objects/${i.objectId}` : '/foreman/issues' });
  }
  if (role !== 'owner') {
    for (const n of d.needs.filter((x) => mine(x.objectId)))
      docs.push({ id: n.id, kind: 'Заявка на материалы', title: `Заявка на материалы № ${n.num}`, sub: `${objectName(d, n.objectId)} · ${userName(d, n.authorId)}`, date: n.date,
        status: NEED_LABEL[needState(n)], tone: NEED_TONE[needState(n)], objectId: n.objectId,
        to: role === 'foreman' ? `/foreman/needs/${n.id}` : role === 'manager' ? `/manager/needs/${n.id}` : role === 'supplier' ? '/supplier' : `/admin/requests?tab=tmc&open=${n.id}` });
    for (const dl of d.deliveries.filter((x) => mine(x.objectId)))
      docs.push({ id: dl.id, kind: 'Поставка', title: `Поставка № ${dl.num}: ${dl.source}`, sub: objectName(d, dl.objectId), date: dl.receivedAt ?? dl.eta,
        status: dl.status === 'expected' ? 'Ждёт получения' : dl.status === 'problem' ? 'С расхождением' : 'Получена', tone: dl.status === 'expected' ? 'hue' : dl.status === 'problem' ? 'negative' : 'positive',
        objectId: dl.objectId, to: role === 'foreman' ? `/foreman/deliveries/${dl.id}` : role === 'manager' ? `/manager/orders?delivery=${dl.id}` : role === 'supplier' ? '/supplier/deliveries' : `/admin/objects/${dl.objectId}?tab=materials` });
  }
  if (role === 'owner' || role === 'admin' || role === 'supplier' || role === 'foreman') {
    for (const r of d.requests.filter((x) => role === 'owner' || role === 'admin' || x.authorId === u.id))
      docs.push({ id: r.id, kind: 'Заявка на оплату', title: `Заявка № ${r.num} на ${money(r.amount)}`, sub: `${r.basis} · ${userName(d, r.authorId)}`, date: r.date,
        status: REQUEST_LABEL[r.status], tone: REQUEST_TONE[r.status], objectId: r.objectId,
        to: role === 'owner' ? '/owner/approvals' : role === 'admin' ? '/admin/requests' : role === 'supplier' ? '/supplier?view=pay' : '/foreman' });
  }
  return docs.sort((a, b) => b.date.localeCompare(a.date));
}
