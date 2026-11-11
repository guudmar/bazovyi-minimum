// Заказы: orders that refill the warehouse and deliveries to the sites, plus the supply report.
// Records open by their address: ?open=<orderId>, ?delivery=<deliveryId>, and a purchase on the home list by ?open=<purchaseId>.
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { act, useData } from '../../data/store';
import { byId, lineState, material, objectName, PURCHASE_LABEL, PURCHASE_TONE } from '../../data/select';
import {
  Btn, Card, DataTable, Details, Empty, Field, More, Page, Pill, Row, Seg, Sheet, Stats, Status, Track, Two, toast, useWide, type Col,
} from '../../ui/kit';
import { addDays, count, dFull, dRel, dShort, daysBetween, money, pct, qty } from '../../lib/format';
import type { Delivery, DeliveryLine, Need, Purchase, Route, TradeOrder } from '../../data/types';
import {
  DELIVERY_STATE, ISSUE_TEXT, NameCell, allLines, dash, deficits, deliveryDiffers, deliveryOfPart, n1, needTitle, orderState, to, type Deficit,
} from './lib';

/* ---------------------------------------------------------------- orders */
export function OrderSheet({ order: o, onClose }: { order: TradeOrder; onClose: () => void }) {
  const d = useData();
  const m = material(d, o.materialId);
  const need = byId(d.needs, o.needId);
  const [eta, setEta] = useState(o.eta < d.today ? addDays(d.today, 2) : o.eta);
  const open = o.status !== 'arrived';
  const st = orderState(o);
  const arrived = () => {
    act.tradeOrderArrived(o.id);
    toast(need ? `Заказ № ${o.num} поступил и отложен под заявку № ${need.num}` : `Заказ № ${o.num} поступил на склад`);
    onClose();
  };
  const move = () => {
    act.setTradeOrder(o.id, { eta, status: 'ordered' });
    toast(`Срок заказа № ${o.num} перенесён на ${dShort(eta)}`);
    onClose();
  };
  const delay = () => {
    act.setTradeOrder(o.id, { status: 'delayed' });
    toast(`Заказ № ${o.num} отмечен как задержанный`);
    onClose();
  };
  return (
    <Sheet open title={`Заказ № ${o.num}`} onClose={onClose}
      foot={open ? (
        <>
          {o.status === 'ordered' && <Btn onClick={delay}>Отметить задержку</Btn>}
          <Btn kind="primary" onClick={arrived}>Поступил на склад</Btn>
        </>
      ) : undefined}>
      <div className="stack">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontWeight: 600, fontSize: 16 }}>{m.name}</b>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        <dl className="kv left">
          <dt>Количество</dt><dd>{qty(o.qty, m.unit)}</dd>
          <dt>Поставщик</dt><dd>{o.supplier}</dd>
          <dt>{open ? 'Ждём' : 'Срок был'}</dt><dd><span className={open && o.eta < d.today ? 'neg' : ''}>{dFull(o.eta)}</span></dd>
          <dt>Для кого</dt><dd>{need ? <More to={to.need(need.id)}>Заявка {needTitle(d, need)}</More> : 'На склад'}</dd>
        </dl>
        {open && (
          <Field label="Новый срок">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} type="date" min={d.today} value={eta} onChange={(e) => setEta(e.target.value)} />
              <Btn style={{ height: 'auto' }} disabled={!eta || (eta === o.eta && o.status === 'ordered')} onClick={move}>Перенести срок</Btn>
            </div>
          </Field>
        )}
        <Details>
          <dl className="kv left">
            <dt>Заказан</dt><dd>{dFull(o.date)}</dd>
            <dt>Склад</dt><dd><More to={to.stock(m.id)}>Материал на складе</More></dd>
          </dl>
        </Details>
      </div>
    </Sheet>
  );
}

function OrdersList({ onOpen }: { onOpen: (o: TradeOrder) => void }) {
  const d = useData();
  const wide = useWide();
  const open = d.tradeOrders.filter((o) => o.status !== 'arrived')
    .sort((a, b) => Number(b.status === 'delayed') - Number(a.status === 'delayed') || a.eta.localeCompare(b.eta));
  const arrived = d.tradeOrders.filter((o) => o.status === 'arrived').sort((a, b) => b.eta.localeCompare(a.eta));
  const whom = (o: TradeOrder) => { const n = byId(d.needs, o.needId); return n ? `для № ${n.num}` : 'на склад'; };
  const late = (o: TradeOrder) => o.status !== 'arrived' && o.eta < d.today;
  const flag = (o: TradeOrder) => (o.status === 'delayed' ? <Status kind="problem">Задержка</Status> : null);
  const cols = (done: boolean): Col<TradeOrder>[] => (wide ? [
    { head: 'Заказ', cell: (o) => <Two a={material(d, o.materialId).name} b={`№ ${o.num} · ${whom(o)}`} /> },
    { head: 'Количество', num: true, cell: (o) => qty(o.qty, material(d, o.materialId).unit) },
    { head: 'Поставщик', cell: (o) => o.supplier },
    { head: done ? 'Срок был' : 'Ждём', cell: (o) => <span className="nowrap"><span className={late(o) ? 'neg' : ''}>{dShort(o.eta)}</span> {flag(o)}</span> },
  ] : [
    { head: 'Заказ', phone: 'title', cell: (o) => material(d, o.materialId).name },
    { head: 'Поставщик', phone: 'sub', cell: (o) => <>№ {o.num} · {o.supplier} · <span className={late(o) ? 'neg' : ''}>{done ? 'срок был' : 'ждём'} {dShort(o.eta)}</span></> },
    { head: 'Количество', phone: 'value', num: true, cell: (o) => qty(o.qty, material(d, o.materialId).unit) },
    { head: 'Задержка', phone: 'meta', cell: flag },
  ]);
  return (
    <>
      <Card flush>
        <DataTable cols={cols(false)} rows={open} keyOf={(o) => o.id} onRow={onOpen} empty="Открытых заказов на склад нет." />
      </Card>
      {arrived.length > 0 && (
        <Details label={`Поступили · ${arrived.length}`}>
          <Card flush><DataTable cols={cols(true)} rows={arrived} keyOf={(o) => o.id} onRow={onOpen} /></Card>
        </Details>
      )}
    </>
  );
}

/* ------------------------------------------------------------ deliveries */
/** One delivery, read-only: what was sent, what the foreman confirmed, where it was put and what arrived outside the order. */
function DeliverySheet({ dl, onClose }: { dl: Delivery; onClose: () => void }) {
  const d = useData();
  const st = DELIVERY_STATE[dl.status];
  const needs = [...new Set(dl.lines.map((l) => l.needId))].map((id) => byId(d.needs, id)).filter((n): n is Need => !!n);
  const purchases = d.purchases.filter((p) => dl.lines.some((l) => l.partId === p.partId));
  const waiting = dl.status === 'expected';
  return (
    <Sheet open title={`Поставка № ${dl.num}`} onClose={onClose}>
      <div className="stack">
        <dl className="kv left">
          <dt>Состояние</dt><dd><Pill tone={st.tone}>{st.label}</Pill></dd>
          <dt>Объект</dt><dd>{objectName(d, dl.objectId)}</dd>
          <dt>{waiting ? 'Ждут на объекте' : 'Получена'}</dt>
          <dd><span className={waiting && dl.eta < d.today ? 'neg' : ''}>{dFull(waiting ? dl.eta : dl.receivedAt ?? dl.eta)}</span></dd>
          {dl.comment && <><dt>Прораб</dt><dd>{dl.comment}</dd></>}
        </dl>
        <div className="list" style={{ margin: '0 -16px' }}>
          {dl.lines.map((l, i) => {
            const m = material(d, l.materialId);
            const short = l.received !== undefined && l.received !== l.qty;
            return (
              <Row key={i} wrap title={m.name}
                sub={[l.sourceName ? `в документе: ${l.sourceName}${l.sourceCode ? `, код ${l.sourceCode}` : ''}` : m.code, l.issue ? ISSUE_TEXT[l.issue] : ''].filter(Boolean).join(' · ') || undefined}
                value={l.received === undefined ? qty(l.qty, m.unit) : <span className={short ? 'neg' : ''}>{qty(l.received, m.unit)}</span>}
                meta={l.received === undefined ? 'отправлено' : `из ${qty(l.qty, m.unit)}`} />
            );
          })}
        </div>
        {dl.extras?.length ? (
          <>
            <div className="section-title">Пришло вне заказа</div>
            <div className="list" style={{ margin: '0 -16px' }}>
              {dl.extras.map((x) => (
                <Row key={x.id} wrap title={x.sourceName} sub={`${x.sourceCode ? `код ${x.sourceCode}` : 'без кода'} · в обеспечение не засчитано`} value={qty(x.qty, x.unit)} />
              ))}
            </div>
          </>
        ) : null}
        <Details>
          <dl className="kv left">
            <dt>Откуда</dt><dd>{dl.source}</dd>
            <dt>Место хранения</dt><dd>{dl.place ?? dash}</dd>
          </dl>
          <div className="list" style={{ margin: '0 -16px' }}>
            {needs.map((n) => <Row key={n.id} to={to.need(n.id)} title={`Заявка ${needTitle(d, n)}`} sub={`от ${dShort(n.date)}`} />)}
            {purchases.map((p) => (
              <Row key={p.id} to={to.purchase(p.id)} title={`Закупка № ${p.num}`} sub={p.supplier ?? 'поставщик не выбран'}
                meta={<Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>} />
            ))}
          </div>
        </Details>
      </div>
    </Sheet>
  );
}

function DeliveriesList({ onOpen }: { onOpen: (dl: Delivery) => void }) {
  const d = useData();
  const wide = useWide();
  const rank = (dl: Delivery) => (deliveryDiffers(dl) ? 0 : dl.status === 'expected' ? 1 : 2);
  const when = (dl: Delivery) => dl.receivedAt ?? dl.eta;
  const all = [...d.deliveries].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? a.eta.localeCompare(b.eta) : when(b).localeCompare(when(a))));
  const top = all.filter((dl) => rank(dl) < 2);
  const done = all.filter((dl) => rank(dl) === 2);

  const what = (dl: Delivery): ReactNode => {
    if (deliveryDiffers(dl)) {
      const bad = dl.lines.filter((l) => l.issue || (l.received !== undefined && l.received !== l.qty)).map((l) => {
        const m = material(d, l.materialId);
        return `${m.name}: ${n1(l.received ?? 0)} из ${qty(l.qty, m.unit)}${l.issue ? `, ${ISSUE_TEXT[l.issue]}` : ''}`;
      });
      const extra = (dl.extras ?? []).map((x) => `вне заказа: ${x.sourceName}`);
      return <span className="neg">{[...bad, ...extra].join('; ')}</span>;
    }
    const first = material(d, dl.lines[0].materialId).name;
    return dl.lines.length > 1 ? `${first} и ещё ${dl.lines.length - 1}` : first;
  };
  const date = (dl: Delivery): ReactNode => (dl.status === 'expected'
    ? <span className={dl.eta < d.today ? 'neg' : ''}>ждут {dRel(dl.eta, d.today).toLowerCase()}</span>
    : `получена ${dShort(when(dl))}`);
  const state = (dl: Delivery): ReactNode => <Pill tone={DELIVERY_STATE[dl.status].tone}>{DELIVERY_STATE[dl.status].label}</Pill>;
  const cols: Col<Delivery>[] = wide ? [
    { head: 'Поставка', cell: (dl) => <Two a={`№ ${dl.num} · ${objectName(d, dl.objectId)}`} b={dl.source} /> },
    { head: 'Что', cell: what },
    { head: 'Когда', cell: date },
    { head: 'Состояние', cell: state },
  ] : [
    { head: 'Поставка', phone: 'title', cell: (dl) => `№ ${dl.num} · ${objectName(d, dl.objectId)}` },
    { head: 'Что', phone: 'sub', cell: what },
    { head: 'Когда', phone: 'value', cell: date },
    { head: 'Состояние', phone: 'meta', cell: state },
  ];
  return (
    <>
      <Card flush><DataTable cols={cols} rows={top} keyOf={(dl) => dl.id} onRow={onOpen} empty="Поставок в пути и с расхождением нет." /></Card>
      {done.length > 0 && (
        <Details label={`Получены · ${done.length}`}>
          <Card flush><DataTable cols={cols} rows={done} keyOf={(dl) => dl.id} onRow={onOpen} /></Card>
        </Details>
      )}
    </>
  );
}

type OrdersTab = 'orders' | 'deliveries';
export function OrdersPage() {
  const d = useData();
  const wide = useWide();
  const [sp, setSp] = useSearchParams();
  const tab: OrdersTab = sp.get('tab') === 'deliveries' || (!sp.get('tab') && sp.get('delivery')) ? 'deliveries' : 'orders';
  const setTab = (t: OrdersTab) => setSp({ tab: t }, { replace: true });
  const setParam = (k: string, v?: string) => {
    const q = new URLSearchParams(sp);
    if (v) q.set(k, v); else q.delete(k);
    setSp(q, { replace: true });
  };
  const order = byId(d.tradeOrders, sp.get('open'));
  const delivery = byId(d.deliveries, sp.get('delivery'));
  const delayed = d.tradeOrders.filter((o) => o.status === 'delayed').length;
  const problems = d.deliveries.filter(deliveryDiffers).length;
  const sub = [delayed && `задерживается ${count(delayed, 'заказ', 'заказа', 'заказов')}`, problems && `${count(problems, 'поставка', 'поставки', 'поставок')} с расхождением`].filter(Boolean).join(', ');
  return (
    <Page title="Заказы" sub={sub ? sub[0].toUpperCase() + sub.slice(1) : undefined}>
      <Seg wide={!wide} value={tab} onChange={setTab} options={[{ value: 'orders', label: 'Заказы' }, { value: 'deliveries', label: 'Поставки' }]} />
      {tab === 'orders' ? <OrdersList onOpen={(o) => setParam('open', o.id)} /> : <DeliveriesList onOpen={(dl) => setParam('delivery', dl.id)} />}
      {order && <OrderSheet key={order.id} order={order} onClose={() => setParam('open')} />}
      {delivery && <DeliverySheet key={delivery.id} dl={delivery} onClose={() => setParam('delivery')} />}
    </Page>
  );
}

/* ------------------------------------------------------------- purchases */
/** A purchase as the manager sees it: read-only, with the request it came from and the delivery it turned into. */
export function PurchaseSheet({ p, onClose }: { p: Purchase; onClose: () => void }) {
  const d = useData();
  const m = material(d, p.materialId);
  const need = byId(d.needs, p.needId);
  const dl = deliveryOfPart(d, p.partId);
  return (
    <Sheet open title={`Закупка № ${p.num}`} onClose={onClose}>
      <div className="stack">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontWeight: 600, fontSize: 16 }}>{m.name}</b>
          <Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>
        </div>
        <dl className="kv left">
          <dt>Количество</dt><dd>{qty(p.qty, m.unit)}</dd>
          <dt>Объект</dt><dd>{objectName(d, p.objectId)}</dd>
          <dt>Нужно к</dt><dd className={p.status !== 'received' && p.wantDate < d.today ? 'neg' : ''}>{dFull(p.wantDate)}</dd>
          <dt>Поставщик</dt><dd>{p.supplier ?? dash}</dd>
          <dt>Срок поставки</dt><dd>{p.eta ? dFull(p.eta) : dash}</dd>
        </dl>
        <Details>
          <dl className="kv left">
            <dt>Причина</dt><dd>{p.reason}</dd>
            <dt>Цена</dt><dd>{p.price !== undefined ? `${money(p.price)} за ${m.unit}, всего ${money(p.price * p.qty)}` : dash}</dd>
            <dt>Заявка</dt><dd>{need ? <More to={to.need(need.id)}>{needTitle(d, need)}</More> : dash}</dd>
            <dt>Поставка</dt>
            <dd>{dl ? <><More to={to.delivery(dl.id)}>№ {dl.num}</More> <Pill tone={DELIVERY_STATE[dl.status].tone}>{DELIVERY_STATE[dl.status].label}</Pill></> : dash}</dd>
          </dl>
          {p.history.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>{p.history.map((h, i) => <p key={i}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)}</div>
          )}
        </Details>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- report */
interface DelayRow { id: string; what: string; ref: string; date: string; days: number }
interface ShortRow { id: string; dl: Delivery; line: DeliveryLine }

const SOURCES: { route: Exclude<Route, 'clarify'>; label: string }[] = [
  { route: 'stock', label: 'Со склада' },
  { route: 'order', label: 'Заказ через торговое направление' },
  { route: 'supplier', label: 'Через снабженца' },
];
/** The share of supply the trade direction is expected to cover: its warehouse plus its own orders. A guide, not a gate. */
const TRADE_TARGET = 0.9;

/** Everything here is counted in positions and parts: units differ, so quantities are never summed across materials. */
export function Report() {
  const d = useData();
  const wide = useWide();
  const lines = allLines(d);
  const done = lines.filter((r) => lineState(r.line) === 'done').length;
  const share = lines.length ? done / lines.length : 0;

  const parts = lines.flatMap((r) => r.line.parts).filter((p) => p.route !== 'clarify');
  const sources = SOURCES.map((s) => ({ ...s, n: parts.filter((p) => p.route === s.route).length }));
  const top = [...sources].sort((a, b) => b.n - a.n)[0];
  const trade = parts.filter((p) => p.route === 'stock' || p.route === 'order').length;
  const tradeShare = parts.length ? trade / parts.length : 0;
  const gap = Math.round((TRADE_TARGET - tradeShare) * 100);

  const lateOrders: DelayRow[] = d.tradeOrders.filter((o) => o.status === 'delayed').map((o) => ({
    id: o.id, what: material(d, o.materialId).name, ref: `Заказ № ${o.num} · ${o.supplier}`, date: o.eta, days: daysBetween(o.eta, d.today),
  }));
  const lateLines: DelayRow[] = lines.filter((r) => lineState(r.line) !== 'done' && r.line.wantDate < d.today).map((r) => ({
    id: r.line.id, what: r.mat.name, ref: `Заявка ${needTitle(d, r.need)}`, date: r.line.wantDate, days: daysBetween(r.line.wantDate, d.today),
  }));
  const delays = [...lateOrders, ...lateLines].sort((a, b) => b.days - a.days);
  const shorts: ShortRow[] = d.deliveries.flatMap((dl) => dl.lines.filter((l) => l.issue).map((line, i) => ({ id: `${dl.id}-${i}`, dl, line })));
  const lack = deficits(d);

  // on a phone a figure loses its column heading, so it carries its own label there
  const tag = (label: string) => (wide ? '' : `${label} `);
  const delayCols: Col<DelayRow>[] = [
    { head: 'Что задерживается', phone: 'title', cell: (r) => <NameCell a={r.what} b={r.ref} /> },
    { head: 'Срок', phone: 'sub', cell: (r) => <span className={r.days > 0 ? 'neg' : ''}>{tag('срок')}{dShort(r.date)}</span> },
    // an order can be flagged as delayed before its date has come: then there are no days of delay to count yet
    { head: 'Опоздание', num: true, phone: 'value', cell: (r) => (r.days > 0 ? count(r.days, 'день', 'дня', 'дней') : <span className="muted">срок не прошёл</span>) },
  ];
  const shortCols: Col<ShortRow>[] = [
    { head: 'Материал', phone: 'title', cell: (r) => <NameCell a={material(d, r.line.materialId).name} b={`Поставка № ${r.dl.num} · ${objectName(d, r.dl.objectId)}`} /> },
    { head: 'Причина', phone: 'sub', cell: (r) => (r.line.issue ? ISSUE_TEXT[r.line.issue] : '') },
    { head: 'Заказано', num: true, phone: 'sub', cell: (r) => `${tag('заказано')}${qty(r.line.qty, material(d, r.line.materialId).unit)}` },
    { head: 'Получено', num: true, phone: 'value', cell: (r) => <span className="neg">{tag('получено')}{qty(r.line.received ?? 0, material(d, r.line.materialId).unit)}</span> },
  ];
  const lackCols: Col<Deficit>[] = [
    { head: 'Материал', phone: 'title', cell: (r) => <NameCell a={r.mat.name} b={`заявки ${[...new Set(r.rows.map((x) => `№ ${x.need.num}`))].join(', ')}`} /> },
    { head: 'Не обеспечено', num: true, phone: 'sub', cell: (r) => `${tag('не обеспечено')}${qty(r.demand, r.mat.unit)}` },
    { head: 'Доступно', num: true, phone: 'sub', cell: (r) => `${tag('доступно')}${n1(r.available)}` },
    { head: 'Ожидается', num: true, phone: 'sub', cell: (r) => `${tag('ожидается')}${n1(r.expected)}` },
    { head: 'Не хватает', num: true, phone: 'value', cell: (r) => <b className="neg" style={{ fontWeight: 600 }}>{qty(r.demand - r.available, r.mat.unit)}</b> },
    ...(wide ? [] : [{ head: 'Подпись', phone: 'meta' as const, cell: () => 'не хватает' }]),
  ];
  const bar = (label: string, value: string, n: number, max: number, ends: [string, string], hue?: boolean) => (
    <div key={label}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}><span>{label}</span><span className="num">{value}</span></div>
      <Track value={n} max={max} hue={hue} />
      <div className="track-ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>
    </div>
  );

  return (
    <Page title="Отчёт по обеспечению" path={[{ label: 'Заявки', to: '/manager' }, { label: 'Отчёт по обеспечению' }]}>
      <Stats items={[
        { label: 'Обеспечено позиций', value: pct(share), lead: true, hint: `${done} из ${lines.length}` },
        { label: 'Через торговое направление', value: parts.length ? pct(tradeShare) : dash, hint: `цель около ${pct(TRADE_TARGET)}` },
        { label: 'Задержки', value: <span className={delays.length ? 'neg' : ''}>{delays.length}</span>, zero: !delays.length },
      ]} />
      <div className="grid cols-2">
        <Card title="Через торговое направление">
          {parts.length ? (
            <div className="stack" style={{ gap: 10 }}>
              {bar('Склад и заказы', pct(tradeShare), trade, parts.length, [`${count(trade, 'часть', 'части', 'частей')} из ${parts.length}`, `цель около ${pct(TRADE_TARGET)}`], true)}
              <p className="muted" style={{ fontSize: 13 }}>{gap > 0 ? `До цели не хватает ${gap} п. п.` : 'Цель выполнена.'}</p>
            </div>
          ) : <Empty>Ни одна позиция ещё не обеспечена.</Empty>}
        </Card>
        <Card title="По объектам">
          <div className="stack" style={{ gap: 16 }}>
            {d.objects.map((o) => {
              const mine = lines.filter((r) => r.need.objectId === o.id);
              const ok = mine.filter((r) => lineState(r.line) === 'done').length;
              return bar(o.name, mine.length ? pct(ok / mine.length) : '—', ok, mine.length, [`обеспечено ${ok}`, `всего ${count(mine.length, 'позиция', 'позиции', 'позиций')}`]);
            })}
          </div>
        </Card>
      </div>
      <Details label="Откуда обеспечено">
        <Card>
          {parts.length ? (
            <div className="stack" style={{ gap: 16 }}>
              {sources.map((s) => bar(s.label, pct(s.n / parts.length), s.n, parts.length, [count(s.n, 'часть', 'части', 'частей'), `из ${parts.length}`], s === top))}
            </div>
          ) : <Empty>Ни одна позиция ещё не обеспечена.</Empty>}
        </Card>
      </Details>
      <Details label={`Задержки · ${delays.length}`}>
        <Card flush><DataTable cols={delayCols} rows={delays} keyOf={(r) => r.id} empty="Задержек нет." /></Card>
      </Details>
      <Details label={`Недопоставки · ${shorts.length}`}>
        <Card flush><DataTable cols={shortCols} rows={shorts} keyOf={(r) => r.id} empty="Расхождений при получении не было." /></Card>
      </Details>
      <Details label={`Не хватает на складе · ${lack.length}`}>
        <Card flush><DataTable cols={lackCols} rows={lack} keyOf={(r) => r.mat.id} empty="Остатка хватает на все заявки." /></Card>
      </Details>
    </Page>
  );
}
