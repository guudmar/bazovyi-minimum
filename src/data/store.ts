// The demo's whole state lives in the browser (localStorage). No server.
// Screens read with useStore(selector) and change data only through `act`.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, daysBetween, todayISO, money, qty as fmtQty, dShort } from '../lib/format';
import { makeSeed } from './seed';
import { byId, lineStats, material, stockView, workDone, objectName } from './select';
import type {
  Data, Session, Operation, AuditArea, Route, NeedPart, Room, IssueKind, Issue, SiteMove, Purchase, NormLine, PlanItem, User,
} from './types';

export type State = Data & { session: Session };

const KEY = 'bazovyi-minimum-demo';
const fresh = (): State => ({ ...makeSeed(todayISO()), session: { userId: null, objectId: null } });

// When the shape of the demo data changes, bump the version: an older saved demo is replaced by a fresh one.
export const useStore = create<State>()(persist(fresh, { name: KEY, version: 4, migrate: () => fresh() }));

/** Shift every ISO date in the saved demo so that "today" in the data is the real today. */
function rebase<T>(v: T, delta: number): T {
  if (typeof v === 'string') return (/^\d{4}-\d{2}-\d{2}$/.test(v) ? addDays(v, delta) : v) as T;
  if (Array.isArray(v)) return v.map((x) => rebase(x, delta)) as T;
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = rebase(x, delta);
    return o as T;
  }
  return v;
}
{
  const s = useStore.getState();
  const delta = daysBetween(s.today, todayISO());
  if (delta !== 0) useStore.setState(rebase(s, delta), true);
}

function mutate<R = void>(fn: (d: State) => R): R {
  let result!: R;
  useStore.setState((s) => {
    const c = structuredClone(s);
    result = fn(c);
    return c;
  }, true);
  return result;
}

const me = (d: State): User => byId(d.users, d.session.userId) ?? d.users[d.users.length - 1];
const nid = (d: State, prefix: string): string => `${prefix}${++d.seq}`;
function nextNum(list: { num: number }[]): number {
  return list.reduce((m, x) => Math.max(m, x.num), 0) + 1;
}
function log(d: State, area: AuditArea, text: string, before?: string, after?: string): void {
  d.audit.unshift({ id: nid(d, 'au'), at: d.today, by: me(d).name, area, text, before, after });
}
function findPart(d: State, needId?: string, lineId?: string, partId?: string): NeedPart | undefined {
  return byId(d.needs, needId)?.lines.find((l) => l.id === lineId)?.parts.find((p) => p.id === partId);
}

export interface OperationInput {
  kind: Operation['kind'];
  amount: number;
  registerId: string;
  toRegisterId?: string;
  articleId?: string;
  objectId?: string;
  counterparty?: string;
  comment?: string;
  date?: string;
}

export const act = {
  /* --------------------------------------------------------------- session */
  login(userId: string) {
    mutate((d) => {
      const u = byId(d.users, userId);
      d.session = { userId, objectId: u?.objectIds?.[0] ?? null };
    });
  },
  logout() {
    mutate((d) => { d.session = { userId: null, objectId: null }; });
  },
  setObject(objectId: string) {
    mutate((d) => { d.session.objectId = objectId; });
  },
  resetDemo() {
    const session = useStore.getState().session;
    useStore.setState({ ...fresh(), session }, true);
  },

  /* ----------------------------------------------------------------- money */
  addOperation(input: OperationInput): string {
    return mutate((d) => {
      const reg = byId(d.registers, input.registerId)!;
      const op: Operation = {
        id: nid(d, 'op'), date: input.date ?? d.today, kind: input.kind, amount: input.amount, registerId: input.registerId,
        articleId: input.kind === 'transfer' ? undefined : input.articleId, objectId: input.objectId || undefined,
        counterparty: input.counterparty || undefined, comment: input.comment || undefined, authorId: me(d).id, history: [],
      };
      if (input.kind === 'transfer') { op.toRegisterId = input.toRegisterId; op.transit = 'sent'; }
      if (reg.kind === 'bank') op.bank = 'unmatched';
      d.operations.push(op);
      const what = input.kind === 'in' ? 'Поступление' : input.kind === 'out' ? 'Расход' : 'Перевод';
      log(d, 'Деньги', `${what} ${money(input.amount)}: ${reg.name}${op.toRegisterId ? ' → ' + byId(d.registers, op.toRegisterId)?.name : ''}`);
      return op.id;
    });
  },
  editOperation(id: string, patch: Partial<Pick<Operation, 'amount' | 'articleId' | 'objectId' | 'counterparty' | 'comment' | 'date'>>) {
    mutate((d) => {
      const op = byId(d.operations, id);
      if (!op) return;
      const changes: string[] = [];
      const name = (k: string, v: unknown): string =>
        k === 'articleId' ? byId(d.articles, v as string)?.name ?? '—'
          : k === 'objectId' ? (v ? objectName(d, v as string) : 'без объекта')
            : k === 'amount' ? money(v as number) : k === 'date' ? dShort(v as string) : String(v ?? '—');
      const title: Record<string, string> = { amount: 'Сумма', articleId: 'Статья', objectId: 'Объект', counterparty: 'Контрагент', comment: 'Комментарий', date: 'Дата' };
      for (const [k, v] of Object.entries(patch)) {
        const old = (op as unknown as Record<string, unknown>)[k];
        if ((old ?? '') === (v ?? '')) continue;
        changes.push(`${title[k]}: ${name(k, old)} → ${name(k, v)}`);
        (op as unknown as Record<string, unknown>)[k] = v || undefined;
      }
      if (!changes.length) return;
      op.history.push({ at: d.today, by: me(d).name, text: changes.join('; ') });
      log(d, 'Деньги', `Операция от ${dShort(op.date)}, ${op.counterparty ?? 'перевод'}: исправлена`, undefined, changes.join('; '));
    });
  },
  confirmTransit(id: string) {
    mutate((d) => {
      const op = byId(d.operations, id);
      if (!op || op.transit !== 'sent') return;
      op.transit = 'received';
      op.receivedDate = d.today;
      op.history.push({ at: d.today, by: me(d).name, text: 'Получение подтверждено' });
      log(d, 'Деньги', `Перевод ${money(op.amount)} получен: ${byId(d.registers, op.toRegisterId)?.name}`);
    });
  },
  matchBank(id: string) {
    mutate((d) => {
      const op = byId(d.operations, id);
      if (!op) return;
      op.bank = 'matched';
      op.history.push({ at: d.today, by: me(d).name, text: 'Сопоставлено с банковской выпиской' });
    });
  },

  /* -------------------------------------------------------- money requests */
  createRequest(input: { amount: number; basis: string; articleId: string; entityId: string; objectId?: string; due: string; purchaseId?: string }): string {
    return mutate((d) => {
      const id = nid(d, 'rq');
      const num = nextNum(d.requests);
      d.requests.push({ id, num, date: d.today, authorId: me(d).id, status: 'pending', decisions: [], ...input, objectId: input.objectId || undefined });
      d.plan.push({ id: nid(d, 'pl'), date: input.due, flow: 'out', amount: input.amount, title: input.basis, entityId: input.entityId, status: 'plan', requestId: id, objectId: input.objectId || undefined });
      log(d, 'Заявки', `Заявка № ${num} на ${money(input.amount)}: создана`, undefined, input.basis);
      return id;
    });
  },
  decideRequest(id: string, action: 'approved' | 'noted' | 'clarify' | 'rejected', note?: string) {
    mutate((d) => {
      const r = byId(d.requests, id);
      if (!r) return;
      const label = { approved: 'Согласовано', noted: 'Согласовано с замечаниями', clarify: 'Запрошено уточнение', rejected: 'Отклонено' }[action];
      r.status = action;
      r.decisions.push({ at: d.today, by: me(d).name, action: label, note: note || undefined });
      const item = d.plan.find((p) => p.requestId === id);
      if (action === 'rejected') d.plan = d.plan.filter((p) => p.requestId !== id);
      else if (item) item.status = action === 'clarify' ? 'plan' : 'approved';
      log(d, 'Заявки', `Заявка № ${r.num} на ${money(r.amount)}: ${label.toLowerCase()}`, undefined, note || undefined);
    });
  },
  answerRequest(id: string, note: string) {
    mutate((d) => {
      const r = byId(d.requests, id);
      if (!r) return;
      r.status = 'pending';
      r.decisions.push({ at: d.today, by: me(d).name, action: 'Дано уточнение', note });
    });
  },
  payRequest(id: string, registerId: string) {
    mutate((d) => {
      const r = byId(d.requests, id);
      const reg = byId(d.registers, registerId);
      if (!r || !reg) return;
      const op: Operation = {
        id: nid(d, 'op'), date: d.today, kind: 'out', amount: r.amount, registerId, articleId: r.articleId, objectId: r.objectId,
        comment: `Заявка № ${r.num}: ${r.basis}`, authorId: me(d).id, requestId: r.id, history: [], bank: reg.kind === 'bank' ? 'unmatched' : undefined,
      };
      d.operations.push(op);
      r.status = 'paid';
      r.decisions.push({ at: d.today, by: me(d).name, action: 'Оплачено', note: reg.name });
      const item = d.plan.find((p) => p.requestId === id);
      if (item) { item.status = 'paid'; item.date = d.today; }
      log(d, 'Заявки', `Заявка № ${r.num} на ${money(r.amount)}: оплачена`, undefined, reg.name);
    });
  },
  addPlanItem(input: Omit<PlanItem, 'id' | 'status'>) {
    mutate((d) => { d.plan.push({ id: nid(d, 'pl'), status: 'plan', ...input }); });
  },

  /* ----------------------------------------------------------------- needs */
  createNeed(input: { objectId: string; comment?: string; urgent?: boolean; lines: { materialId: string; qty: number; wantDate: string; comment?: string }[] }): string {
    return mutate((d) => {
      const id = nid(d, 'n');
      const num = nextNum(d.needs);
      d.needs.push({
        id, num, objectId: input.objectId, date: d.today, authorId: me(d).id, comment: input.comment || undefined, urgent: input.urgent || undefined,
        lines: input.lines.map((l, i) => ({ id: `${id}l${i + 1}`, materialId: l.materialId, qty: l.qty, wantDate: l.wantDate, comment: l.comment || undefined, parts: [] })),
      });
      log(d, 'ТМЦ', `Потребность № ${num}, ${objectName(d, input.objectId)}: создана`);
      return id;
    });
  },
  /** Send a part of a position down one route. The part stays linked to the original need. */
  routeLine(needId: string, lineId: string, route: Route, amount: number, opts: { supplier?: string; eta?: string; text?: string } = {}) {
    mutate((d) => {
      const need = byId(d.needs, needId);
      const line = need?.lines.find((l) => l.id === lineId);
      if (!need || !line) return;
      const mat = material(d, line.materialId);
      let q = Math.min(amount, lineStats(line).open);
      if (route === 'stock') q = Math.min(q, stockView(d, line.materialId).available);
      if (q <= 0) return;
      const part: NeedPart = { id: nid(d, 'p'), route, qty: q, status: 'reserved' };
      if (route === 'stock') {
        const st = d.stock.find((s) => s.materialId === line.materialId)!;
        st.reserved += q;
        part.eta = addDays(d.today, 1);
      }
      if (route === 'order') {
        part.status = 'ordered';
        part.eta = opts.eta ?? addDays(d.today, 5);
        d.tradeOrders.push({
          id: nid(d, 'to'), num: nextNum(d.tradeOrders), materialId: line.materialId, qty: q, supplier: opts.supplier || 'Поставщик уточняется',
          date: d.today, eta: part.eta, status: 'ordered', needId, lineId, partId: part.id, objectId: need.objectId,
        });
      }
      if (route === 'supplier') {
        part.status = 'handed';
        d.purchases.push({
          id: nid(d, 'pu'), num: nextNum(d.purchases), needId, lineId, partId: part.id, objectId: need.objectId, materialId: line.materialId, qty: q,
          wantDate: line.wantDate, reason: opts.text || 'Торговое направление обеспечить не может', priority: need.urgent ? 'high' : 'normal', status: 'new',
          history: [{ at: d.today, by: me(d).name, text: `Передано снабженцу: ${fmtQty(q, mat.unit)} из ${fmtQty(line.qty, mat.unit)}` }],
        });
      }
      if (route === 'clarify') {
        part.status = 'clarify';
        need.question = { text: opts.text || 'Уточните потребность', by: me(d).name };
      }
      line.parts.push(part);
      const label = { stock: 'резерв со склада', order: 'заказ через торговое направление', supplier: 'передано снабженцу', clarify: 'запрошено уточнение' }[route];
      log(d, 'ТМЦ', `Потребность № ${need.num}, ${mat.name}: ${label}`, undefined, fmtQty(q, mat.unit));
    });
  },
  /** Take back a part that has not moved yet (a reserve or an open question), so the quantity can be routed again. */
  removePart(needId: string, lineId: string, partId: string) {
    mutate((d) => {
      const line = byId(d.needs, needId)?.lines.find((l) => l.id === lineId);
      const part = line?.parts.find((p) => p.id === partId);
      if (!line || !part || (part.status !== 'reserved' && part.status !== 'clarify')) return;
      // any reserved part holds warehouse stock, whether it was reserved directly or arrived with a trade order
      if (part.status === 'reserved') {
        const st = d.stock.find((s) => s.materialId === line.materialId);
        if (st) st.reserved = Math.max(0, st.reserved - part.qty);
      }
      line.parts = line.parts.filter((p) => p.id !== partId);
    });
  },
  answerQuestion(needId: string, text: string) {
    mutate((d) => {
      const need = byId(d.needs, needId);
      if (need?.question) need.question.answer = text;
    });
  },
  /** Ship everything reserved for this need from the trade warehouse to the site. */
  shipFromStock(needId: string) {
    mutate((d) => {
      const need = byId(d.needs, needId);
      if (!need) return;
      const lines: { materialId: string; qty: number; needId: string; lineId: string; partId: string }[] = [];
      for (const l of need.lines) for (const p of l.parts) {
        if (p.status !== 'reserved') continue;
        const st = d.stock.find((s) => s.materialId === l.materialId);
        if (st) { st.total -= p.qty; st.reserved = Math.max(0, st.reserved - p.qty); }
        p.status = 'shipped';
        p.eta = addDays(d.today, 1);
        lines.push({ materialId: l.materialId, qty: p.qty, needId, lineId: l.id, partId: p.id });
      }
      if (!lines.length) return;
      const num = nextNum(d.deliveries);
      d.deliveries.push({ id: nid(d, 'dl'), num, objectId: need.objectId, source: 'Склад торгового направления', eta: addDays(d.today, 1), status: 'expected', lines });
      log(d, 'ТМЦ', `Поставка № ${num} отправлена на объект: ${objectName(d, need.objectId)}`);
    });
  },
  setTradeOrder(id: string, patch: { eta?: string; status?: 'ordered' | 'delayed' }) {
    mutate((d) => {
      const o = byId(d.tradeOrders, id);
      if (!o) return;
      Object.assign(o, patch);
      const part = findPart(d, o.needId, o.lineId, o.partId);
      if (part && patch.eta) part.eta = patch.eta;
    });
  },
  /** A trade order arrived at the warehouse. If it was ordered for a need, it arrives already reserved for it. */
  tradeOrderArrived(id: string) {
    mutate((d) => {
      const o = byId(d.tradeOrders, id);
      if (!o || o.status === 'arrived') return;
      o.status = 'arrived';
      let st = d.stock.find((s) => s.materialId === o.materialId);
      if (!st) { st = { materialId: o.materialId, total: 0, reserved: 0, place: 'Зона приёмки' }; d.stock.push(st); }
      st.total += o.qty;
      const part = findPart(d, o.needId, o.lineId, o.partId);
      if (part && part.status === 'ordered') { part.status = 'reserved'; st.reserved += o.qty; }
      log(d, 'ТМЦ', `Заказ № ${o.num} поступил на склад: ${material(d, o.materialId).name}`, undefined, fmtQty(o.qty, material(d, o.materialId).unit));
    });
  },

  /* ------------------------------------------------------------- purchases */
  updatePurchase(id: string, patch: Partial<Pick<Purchase, 'supplier' | 'price' | 'terms' | 'eta' | 'invoice' | 'alt'>>, note: string) {
    mutate((d) => {
      const p = byId(d.purchases, id);
      if (!p) return;
      Object.assign(p, patch);
      if (p.status === 'new') p.status = 'sourcing';
      p.history.push({ at: d.today, by: me(d).name, text: note });
      const part = findPart(d, p.needId, p.lineId, p.partId);
      if (part && patch.eta) part.eta = patch.eta;
    });
  },
  setPurchaseStatus(id: string, status: 'sourcing' | 'ordered' | 'shipped') {
    mutate((d) => {
      const p = byId(d.purchases, id);
      if (!p) return;
      p.status = status;
      const mat = material(d, p.materialId);
      if (status === 'sourcing') p.history.push({ at: d.today, by: me(d).name, text: 'Взято в работу' });
      if (status === 'ordered') {
        p.orderDate = d.today;
        p.history.push({ at: d.today, by: me(d).name, text: `Заказ размещён: ${p.supplier ?? 'поставщик не указан'}` });
        log(d, 'ТМЦ', `Закупка № ${p.num}: заказ размещён`, undefined, `${p.supplier ?? '—'} · ${fmtQty(p.qty, mat.unit)}`);
      }
      if (status === 'shipped') {
        const eta = p.eta && p.eta >= d.today ? p.eta : addDays(d.today, 1);
        p.eta = eta;
        p.history.push({ at: d.today, by: me(d).name, text: `Поставщик отгрузил, ждём ${dShort(eta)}` });
        const part = findPart(d, p.needId, p.lineId, p.partId);
        if (part) { part.status = 'shipped'; part.eta = eta; }
        d.deliveries.push({
          id: nid(d, 'dl'), num: nextNum(d.deliveries), objectId: p.objectId, source: p.supplier ?? 'Поставщик', eta, status: 'expected',
          lines: [{ materialId: p.materialId, qty: p.qty, needId: p.needId, lineId: p.lineId, partId: p.partId }],
        });
      }
    });
  },

  /* ------------------------------------------------------------- site side */
  /** The foreman confirms what actually arrived, line by line. */
  confirmDelivery(id: string, lines: { received: number; issue?: 'short' | 'wrong' | 'damaged' }[], comment?: string, photos = 0) {
    mutate((d) => {
      const dl = byId(d.deliveries, id);
      if (!dl || dl.status !== 'expected') return;
      let problem = false;
      dl.lines.forEach((l, i) => {
        const got = lines[i] ?? { received: l.qty };
        l.received = got.received;
        l.issue = got.issue;
        if (got.issue || got.received !== l.qty) problem = true;
        const part = findPart(d, l.needId, l.lineId, l.partId);
        if (part) {
          part.status = 'received';
          part.received = got.received;
          // a short delivery frees the missing quantity: it becomes unrouted again and the manager can cover it another way
          if (got.received < part.qty) part.qty = got.received;
        }
        if (got.received > 0) d.siteMoves.push({ id: nid(d, 'sm'), objectId: dl.objectId, materialId: l.materialId, date: d.today, kind: 'receive', qty: got.received, note: `Поставка № ${dl.num}, ${dl.source}`, by: me(d).name });
        const pu = d.purchases.find((p) => p.partId === l.partId);
        if (pu) {
          pu.status = 'received';
          pu.history.push({ at: d.today, by: me(d).name, text: `Получено на объекте: ${fmtQty(got.received, material(d, l.materialId).unit)}` });
        }
      });
      for (const n of d.needs) for (const line of n.lines) line.parts = line.parts.filter((p) => p.qty > 0);
      dl.status = problem ? 'problem' : 'received';
      dl.receivedAt = d.today;
      dl.comment = comment || undefined;
      dl.photos = photos;
      log(d, 'ТМЦ', `Поставка № ${dl.num}, ${objectName(d, dl.objectId)}: ${problem ? 'получена с расхождением' : 'получена полностью'}`, undefined, comment || undefined);
    });
  },
  addSiteMove(input: Pick<SiteMove, 'objectId' | 'materialId' | 'kind' | 'qty' | 'note'>) {
    mutate((d) => {
      d.siteMoves.push({ id: nid(d, 'sm'), date: d.today, by: me(d).name, ...input, note: input.note || undefined });
    });
  },
  saveRoom(input: Omit<Room, 'id' | 'history' | 'measuredAt' | 'measuredBy'> & { id?: string }) {
    mutate((d) => {
      const old = byId(d.rooms, input.id);
      if (!old) {
        d.rooms.push({ ...input, id: nid(d, 'rm'), measuredAt: d.today, measuredBy: me(d).name, history: [{ at: d.today, by: me(d).name, text: 'Первичный замер' }] });
        log(d, 'Геометрия', `${input.name}, ${objectName(d, input.objectId)}: добавлено помещение`);
        return;
      }
      const diff: string[] = [];
      const cmp = (label: string, a: number | undefined, b: number | undefined, unit: string) => {
        if ((a ?? 0) !== (b ?? 0)) diff.push(`${label}: ${a ?? 0} ${unit} → ${b ?? 0} ${unit}`);
      };
      cmp('Длина', old.length, input.length, 'м');
      cmp('Ширина', old.width, input.width, 'м');
      cmp('Высота', old.height, input.height, 'м');
      cmp('Отклонение', old.deviation, input.deviation, 'мм');
      if (old.openings.length !== input.openings.length) diff.push(`Проёмы: ${old.openings.length} → ${input.openings.length}`);
      Object.assign(old, input, { id: old.id });
      if (diff.length) {
        // measurements are never silently overwritten: every change is a line in the history
        old.history.push({ at: d.today, by: me(d).name, text: diff.join('; ') });
        old.measuredAt = d.today;
        log(d, 'Геометрия', `${old.name}, ${objectName(d, old.objectId)}: замер изменён`, undefined, diff.join('; '));
      }
    });
  },
  makeAct(objectId: string) {
    mutate((d) => {
      const rooms = d.rooms.filter((r) => r.objectId === objectId);
      const num = nextNum(d.acts);
      d.acts.push({ id: nid(d, 'act'), num, objectId, date: d.today, by: me(d).name, rooms: rooms.length, floorArea: Math.round(rooms.reduce((s, r) => s + r.length * r.width, 0) * 10) / 10 });
      log(d, 'Геометрия', `Акт геометрии № ${num}: ${objectName(d, objectId)}`);
    });
  },
  addFact(workId: string, amount: number, note?: string, photos = 0) {
    mutate((d) => {
      const w = byId(d.works, workId);
      if (!w) return;
      const q = Math.min(amount, Math.round((w.plan - workDone(w)) * 10) / 10);
      if (q <= 0) return;
      w.facts.push({ date: d.today, qty: q, by: me(d).name, note: note || undefined, photos });
    });
  },
  createAvr(objectId: string, lines: { workId: string; qty: number }[]) {
    mutate((d) => {
      const num = nextNum(d.avrs);
      d.avrs.push({ id: nid(d, 'avr'), num, objectId, date: d.today, by: me(d).name, status: 'review', lines: lines.filter((l) => l.qty > 0) });
      log(d, 'АВР', `АВР № ${num}, ${objectName(d, objectId)}: сформирован и отправлен на проверку`);
    });
  },
  /** Accepted volume is recorded separately from the volume the foreman reported. */
  decideAvr(id: string, status: 'accepted' | 'returned', accepted: Record<string, number> = {}, note?: string) {
    mutate((d) => {
      const a = byId(d.avrs, id);
      if (!a || a.status !== 'review') return;
      a.status = status;
      a.note = note || undefined;
      if (status === 'accepted') for (const l of a.lines) {
        const w = byId(d.works, l.workId);
        l.accepted = Math.min(l.qty, accepted[l.workId] ?? l.qty);
        if (w) w.accepted = Math.round((w.accepted + l.accepted) * 10) / 10;
      }
      log(d, 'АВР', `АВР № ${a.num}, ${objectName(d, a.objectId)}: ${status === 'accepted' ? 'объёмы приняты' : 'возвращён на доработку'}`, undefined, note || undefined);
    });
  },
  addIssue(input: { objectId: string; place: string; kind: IssueKind; text: string; photos: number }) {
    mutate((d) => {
      d.issues.unshift({ id: nid(d, 'is'), date: d.today, status: 'open', by: me(d).name, ...input });
    });
  },
  setIssueStatus(id: string, status: Issue['status']) {
    mutate((d) => {
      const i = byId(d.issues, id);
      if (i) i.status = status;
    });
  },

  /* ------------------------------------------------------------ references */
  /** A change of a norm creates a new version; needs that were already calculated keep the old one. */
  saveNorm(id: string, lines: NormLine[]) {
    mutate((d) => {
      const n = byId(d.norms, id);
      if (!n) return;
      const text = (ls: NormLine[]) => ls.map((l) => `${material(d, l.materialId).name}: ${String(l.perUnit).replace('.', ',')} ${material(d, l.materialId).unit}/${n.unit}`).join('; ');
      const before = text(n.lines);
      const after = text(lines);
      if (before === after) return;
      n.previous.unshift({ version: n.version, updated: n.updated, text: before });
      n.lines = lines;
      n.version += 1;
      n.updated = d.today;
      n.by = me(d).name;
      log(d, 'Нормативы', `${n.work}: версия ${n.version}`, before, after);
    });
  },
  addMaterial(input: { name: string; unit: string; group: string; price: number }) {
    mutate((d) => {
      d.materials.push({ id: nid(d, 'm'), ...input });
      log(d, 'Справочники', `Материал добавлен: ${input.name}`);
    });
  },
  addArticle(input: { name: string; flow: 'in' | 'out' }) {
    mutate((d) => {
      d.articles.push({ id: nid(d, 'a'), ...input });
      log(d, 'Справочники', `Статья добавлена: ${input.name}`);
    });
  },
  setUserObjects(userId: string, objectIds: string[]) {
    mutate((d) => {
      const u = byId(d.users, userId);
      if (!u) return;
      const before = (u.objectIds ?? []).map((x) => objectName(d, x)).join(', ') || 'нет объектов';
      u.objectIds = objectIds;
      log(d, 'Доступ', `${u.name}: изменён доступ к объектам`, before, objectIds.map((x) => objectName(d, x)).join(', ') || 'нет объектов');
    });
  },
};

/* ------------------------------------------------------------------ hooks */

export function useUser(): User {
  return useStore((s) => byId(s.users, s.session.userId) ?? s.users[0]);
}
/** The whole data object. Screens are small and the demo data is tiny, so re-rendering on any change is fine. */
export function useData(): State {
  return useStore();
}
