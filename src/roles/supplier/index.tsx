// The supplier's workspace: Закупки (what to buy, with history and his payment requests) and Поставки.
// Every purchase keeps its link to the material request it came from.
import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { act, useData, useUser } from '../../data/store';
import { byId, material, objectName, PURCHASE_LABEL, PURCHASE_TONE } from '../../data/select';
import { Btn, Card, Chips, DataTable, Details, Empty, Go, More, Page, Pill, Status, Two, toast, useSticky, useWide, type Col } from '../../ui/kit';
import { TodoCard } from '../../shared/common';
import { NoteSheet, RequestCard } from '../../shared/money';
import { count, dRel, dShort, money, qty } from '../../lib/format';
import type { Delivery, Material, MoneyRequest, Purchase } from '../../data/types';
import { DELIVERY, NameCell, atRisk, cost, dash, n1, rub, sumCost, wantLate } from './lib';
import { PurchasePage } from './purchase';

type Filter = 'new' | 'work' | 'ordered' | 'received' | 'all';
const FILTER: Record<Filter, (p: Purchase) => boolean> = {
  new: (p) => p.status === 'new',
  work: (p) => p.status === 'sourcing',
  ordered: (p) => p.status === 'ordered' || p.status === 'shipped',
  received: (p) => p.status === 'received',
  all: () => true,
};

/** Purchases that still need work come first, the nearest wanted date on top; closed ones go to the end, newest first. */
const byWant = (a: Purchase, b: Purchase): number =>
  Number(a.status === 'received') - Number(b.status === 'received')
  || (a.status === 'received' ? b.num - a.num : a.wantDate.localeCompare(b.wantDate));
const sumOf = (list: MoneyRequest[]): number => list.reduce((s, r) => s + r.amount, 0);

/* ------------------------------------------------------------- purchases */
function PurchaseList({ f }: { f: Filter }) {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  const [q, setQ] = useSticky('supplier.q', '');
  const s = q.trim().toLowerCase();
  const mat = (p: Purchase): Material => material(d, p.materialId);
  const found = d.purchases.filter((p) => !s || [mat(p).name, p.supplier ?? '', objectName(d, p.objectId), `№ ${p.num}`, String(p.num)].some((x) => x.toLowerCase().includes(s)));
  const rows = found.filter(FILTER[f]).sort(byWant);

  // the search found one material: its average price over the purchases with a known price, weighted by quantity
  const mats = [...new Set(found.map((p) => p.materialId))];
  const priced = found.filter((p) => p.price !== undefined);
  const one = s && mats.length === 1 && priced.length ? material(d, mats[0]) : undefined;
  const prices = priced.map((p) => p.price ?? 0);
  const avg = one ? sumCost(priced) / priced.reduce((x, p) => x + p.qty, 0) : 0;

  const status = (p: Purchase): ReactNode => <Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>;
  const urgent = (p: Purchase): ReactNode => (p.priority === 'high' && p.status !== 'received' ? <><Status kind="problem">Срочно</Status> </> : null);
  const want = (p: Purchase, prefix = ''): ReactNode => <span className={wantLate(d, p) ? 'neg' : ''}>{prefix}{dShort(p.wantDate)}</span>;
  const cols: Col<Purchase>[] = wide ? [
    { head: 'Материал', cell: (p) => <Two a={<>{urgent(p)}{mat(p).name}</>} b={`№ ${p.num} · ${objectName(d, p.objectId)}`} /> },
    { head: 'Количество', num: true, cell: (p) => qty(p.qty, mat(p).unit) },
    { head: 'Нужно к', cell: (p) => want(p) },
    { head: 'Поставщик', cell: (p) => p.supplier ?? dash },
    { head: 'Сумма', num: true, cell: (p) => { const c = cost(p); return c === undefined ? dash : money(c); } },
    { head: 'Состояние', cell: status },
  ] : [
    { head: 'Материал', phone: 'title', cell: (p) => mat(p).name },
    { head: 'Объект', phone: 'sub', cell: (p) => <>{urgent(p)}{objectName(d, p.objectId)} · {want(p, 'нужно к ')}</> },
    { head: 'Количество', phone: 'value', num: true, cell: (p) => qty(p.qty, mat(p).unit) },
    { head: 'Состояние', phone: 'meta', cell: status },
  ];

  return (
    <>
      <div style={{ position: 'relative' }}>
        <SearchIcon size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input" style={{ paddingLeft: 38 }} type="search" placeholder="Материал, поставщик, объект или номер" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Поиск по закупкам" />
      </div>
      {one && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span>Средняя цена: {one.name}</span>
            <b className="num nowrap" style={{ fontWeight: 600 }}>{rub(Math.round(avg * 100) / 100)} за {one.unit}</b>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {count(priced.length, 'закупка', 'закупки', 'закупок')}{priced.length > 1 ? ` · от ${rub(Math.min(...prices))} до ${rub(Math.max(...prices))}` : ''} · по справочнику {rub(one.price)}
          </p>
        </Card>
      )}
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(p) => p.id} onRow={(p) => nav(`/supplier/purchase/${p.id}`)}
          empty={s ? `По запросу «${q.trim()}» закупок нет.` : 'Здесь пока ничего нет.'} />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------- payments */
function Payments() {
  const d = useData();
  const u = useUser();
  const [answer, setAnswer] = useState<MoneyRequest | null>(null);
  const mine = d.requests.filter((r) => r.authorId === u.id)
    .sort((a, b) => Number(b.status === 'clarify') - Number(a.status === 'clarify') || b.date.localeCompare(a.date) || b.num - a.num);
  return (
    <>
      {mine.length === 0 && <Card><Empty>Заявок на оплату пока нет.</Empty></Card>}
      <div className="grid cols-2">
        {mine.map((r) => {
          const pu = byId(d.purchases, r.purchaseId);
          return (
            <RequestCard key={r.id} r={r}>
              {pu && <div><More to={`/supplier/purchase/${pu.id}`}>Закупка № {pu.num}: {PURCHASE_LABEL[pu.status].toLowerCase()}</More></div>}
              {r.status === 'clarify' && <Btn kind="primary" block onClick={() => setAnswer(r)}>Ответить</Btn>}
            </RequestCard>
          );
        })}
      </div>
      <NoteSheet open={!!answer} title={answer ? `Ответ по заявке № ${answer.num}` : ''} label="Что ответить" action="Отправить" required
        onClose={() => setAnswer(null)}
        onSubmit={(text) => {
          if (answer) { act.answerRequest(answer.id, text); toast(`Ответ отправлен, заявка № ${answer.num} снова на согласовании`); }
          setAnswer(null);
        }} />
    </>
  );
}

function Home() {
  const d = useData();
  const u = useUser();
  const [sp, setSp] = useSearchParams();
  const pay = sp.get('view') === 'pay';
  const raw = sp.get('f');
  const f: Filter = raw === 'new' || raw === 'work' || raw === 'ordered' || raw === 'received' ? raw : 'all';
  const choose = (v: Filter | 'pay') => setSp(v === 'pay' ? { view: 'pay' } : { f: v }, { replace: true });
  const cnt = (k: Filter) => d.purchases.filter(FILTER[k]).length;
  const mine = d.requests.filter((r) => r.authorId === u.id);
  const clarify = mine.filter((r) => r.status === 'clarify');
  const waiting = mine.filter((r) => r.status === 'pending');
  const approved = mine.filter((r) => r.status === 'approved' || r.status === 'noted');
  const risk = d.purchases.filter((p) => atRisk(d, p)).length;

  const sub = pay
    ? clarify.length ? `Ждут вашего ответа: ${count(clarify.length, 'заявка', 'заявки', 'заявок')}`
      : waiting.length ? `На согласовании ${money(sumOf(waiting))}${approved.length ? `, ждёт оплаты ${money(sumOf(approved))}` : ''}`
        : approved.length ? `Согласовано, ждёт оплаты ${money(sumOf(approved))}` : undefined
    : risk ? `${count(risk, 'закупка нужна', 'закупки нужны', 'закупок нужны')} в ближайшие два дня, заказ не размещён` : undefined;

  return (
    <Page title="Закупки" sub={sub}>
      <TodoCard limit={3} />
      <Chips value={pay ? 'pay' : f} onChange={choose} options={[
        { value: 'new', label: 'Новые', count: cnt('new') },
        { value: 'work', label: 'В работе', count: cnt('work') },
        { value: 'ordered', label: 'Заказаны', count: cnt('ordered') },
        { value: 'received', label: 'Получены', count: cnt('received') },
        { value: 'all', label: 'Все', count: d.purchases.length },
        { value: 'pay', label: 'Оплаты', count: clarify.length || undefined },
      ]} />
      {pay ? <Payments /> : <PurchaseList f={f} />}
    </Page>
  );
}

/* ------------------------------------------------------------ deliveries */
function Deliveries() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  // a delivery belongs here when at least one of its lines carries a part that a purchase was made for
  const bought = new Set(d.purchases.map((p) => p.partId));
  const rows = d.deliveries
    .filter((dl) => dl.lines.some((l) => l.partId && bought.has(l.partId)))
    .sort((a, b) => DELIVERY[a.status].rank - DELIVERY[b.status].rank
      || (a.status === 'expected' ? a.eta.localeCompare(b.eta) : (b.receivedAt ?? b.eta).localeCompare(a.receivedAt ?? a.eta)));
  const top = rows.filter((x) => x.status !== 'received');
  const done = rows.filter((x) => x.status === 'received');
  const problems = rows.filter((x) => x.status === 'problem').length;
  const open = (dl: Delivery) => { const pu = d.purchases.find((p) => dl.lines.some((l) => l.partId === p.partId)); if (pu) nav(`/supplier/purchase/${pu.id}`); };

  const state = (dl: Delivery): ReactNode => <Pill tone={DELIVERY[dl.status].tone}>{DELIVERY[dl.status].label}</Pill>;
  const when = (dl: Delivery): ReactNode => (dl.status === 'expected'
    ? <span className={dl.eta < d.today ? 'neg' : ''}>ждём {dRel(dl.eta, d.today).toLowerCase()}</span>
    : `получено ${dShort(dl.receivedAt ?? dl.eta)}`);
  const what = (dl: Delivery): ReactNode => dl.lines.map((l, i) => {
    const m = material(d, l.materialId);
    return (
      <span key={i}>
        {i > 0 && '; '}{m.name}{l.received === undefined ? `, ${qty(l.qty, m.unit)}` : <>: получено <span className={l.received < l.qty ? 'neg' : ''}>{n1(l.received)}</span> из {qty(l.qty, m.unit)}</>}
      </span>
    );
  });
  const cols: Col<Delivery>[] = wide ? [
    { head: 'Поставка', cell: (dl) => <Two a={dl.source} b={`№ ${dl.num} · ${objectName(d, dl.objectId)}`} /> },
    { head: 'Что', cell: what },
    { head: 'Когда', cell: when },
    { head: 'Состояние', cell: state },
  ] : [
    { head: 'Поставка', phone: 'title', cell: (dl) => <NameCell a={dl.source} b={`№ ${dl.num} · ${objectName(d, dl.objectId)}`} /> },
    { head: 'Что', phone: 'sub', cell: what },
    { head: 'Когда', phone: 'value', cell: when },
    { head: 'Состояние', phone: 'meta', cell: state },
  ];

  return (
    <Page title="Поставки" sub={problems ? `Расхождение: ${count(problems, 'поставка', 'поставки', 'поставок')}` : undefined}>
      <Card flush>
        <DataTable cols={cols} rows={top} keyOf={(dl) => dl.id} onRow={open} empty="Поставок в пути нет." />
      </Card>
      {done.length > 0 && (
        <Details label={`Получены · ${done.length}`}>
          <Card flush><DataTable cols={cols} rows={done} keyOf={(dl) => dl.id} onRow={open} /></Card>
        </Details>
      )}
    </Page>
  );
}

export const routes: { path: string; element: ReactNode }[] = [
  { path: '/supplier', element: <Home /> },
  { path: '/supplier/purchase/:id', element: <PurchasePage /> },
  { path: '/supplier/deliveries', element: <Deliveries /> },
  // old addresses
  { path: '/supplier/queue', element: <Go to="/supplier" /> },
  { path: '/supplier/orders', element: <Go to="/supplier" add={{ f: 'ordered' }} /> },
  { path: '/supplier/history', element: <Go to="/supplier" add={{ f: 'all' }} /> },
  { path: '/supplier/money', element: <Go to="/supplier" add={{ view: 'pay' }} /> },
];
