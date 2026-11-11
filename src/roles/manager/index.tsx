// The trade manager's workspace: Заявки (material requests from the sites), Склад, Заказы.
// Every position of a request is provided from the warehouse, by an order or through the supplier, and all parts stay tied to it.
import { type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { act, useData } from '../../data/store';
import { byId, lineState, lineStats, material, needState, stockView, LINE_LABEL, LINE_TONE, NEED_LABEL, NEED_TONE, PURCHASE_LABEL, PURCHASE_TONE } from '../../data/select';
import { Btn, Card, Chips, DataTable, Details, Empty, Go, List, More, Page, Pill, Row, Status, Two, toast, useWide, type Col } from '../../ui/kit';
import { TodoCard } from '../../shared/common';
import { count, dShort, qty } from '../../lib/format';
import type { Need, Purchase } from '../../data/types';
import { NEED_FILTER, allLines, dash, nearestWant, needTitle, readyToShip, to, type LineRow, type NeedFilter } from './lib';
import { NeedPage } from './need';
import { Stock } from './stock';
import { OrdersPage, PurchaseSheet, Report } from './supply';

type Filter = NeedFilter | 'all' | 'supplier';

/** One request in the list. A request with a reserve on the warehouse gets its «Отправить» right in the row. */
function NeedRow({ n }: { n: Need }) {
  const d = useData();
  const s = needState(n);
  const open = n.lines.filter((l) => lineStats(l).open > 0).length;
  const want = nearestWant(n);
  const urgent = n.urgent && s !== 'done';
  const q = n.question;
  const sub: ReactNode = (
    <>
      {urgent && <><Status kind="problem">Срочно</Status> </>}
      {open ? `${count(open, 'позиция ждёт', 'позиции ждут', 'позиций ждут')}` : count(n.lines.length, 'позиция', 'позиции', 'позиций')}
      {want ? <> · нужно к <span className={want < d.today ? 'neg' : ''}>{dShort(want)}</span></> : ` · от ${dShort(n.date)}`}
      {q && !q.answer && <> · вопрос прорабу: {q.text}</>}
      {q?.answer && s !== 'done' && n.lines.some((l) => l.parts.some((p) => p.status === 'clarify')) && <> · прораб ответил: {q.answer}</>}
    </>
  );
  if (readyToShip(n)) {
    const ship = () => { act.shipFromStock(n.id); toast(`Заявка № ${n.num}: отправлено на объект`); };
    return (
      <div className="row">
        <Link to={to.need(n.id)} className="row-main">
          <div className="row-title">{needTitle(d, n)}</div>
          <div className="row-sub">{sub}</div>
        </Link>
        <Btn small onClick={ship}>Отправить</Btn>
      </div>
    );
  }
  return <Row to={to.need(n.id)} title={needTitle(d, n)} sub={sub} side={<Pill tone={NEED_TONE[s]}>{NEED_LABEL[s]}</Pill>} />;
}

/** What went to the supplier, and the positions the warehouse cannot give at all. */
function SupplierView({ onOpen }: { onOpen: (p: Purchase) => void }) {
  const d = useData();
  const wide = useWide();
  const purchases = [...d.purchases].sort((a, b) => Number(a.status === 'received') - Number(b.status === 'received') || a.wantDate.localeCompare(b.wantDate));
  const can = allLines(d)
    .filter((r) => lineStats(r.line).open > 0 && stockView(d, r.mat.id).available === 0)
    .sort((a, b) => Number(!!b.need.urgent) - Number(!!a.need.urgent) || a.line.wantDate.localeCompare(b.line.wantDate));
  const hand = (r: LineRow) => {
    const open = lineStats(r.line).open;
    act.routeLine(r.need.id, r.line.id, 'supplier', open, { text: 'На складе торгового направления нет в наличии' });
    toast(`Передано снабженцу: ${r.mat.name}, ${qty(open, r.mat.unit)}`);
  };
  const needNum = (p: Purchase) => byId(d.needs, p.needId)?.num;
  const late = (p: Purchase) => p.status !== 'received' && p.wantDate < d.today;
  const status = (p: Purchase): ReactNode => <Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>;
  const cols: Col<Purchase>[] = wide ? [
    { head: 'Материал', cell: (p) => <Two a={material(d, p.materialId).name} b={`закупка № ${p.num} · заявка № ${needNum(p) ?? '—'}`} /> },
    { head: 'Количество', num: true, cell: (p) => qty(p.qty, material(d, p.materialId).unit) },
    { head: 'Нужно к', cell: (p) => <span className={late(p) ? 'neg' : ''}>{dShort(p.wantDate)}</span> },
    { head: 'Поставщик', cell: (p) => (p.supplier ? <Two a={p.supplier} b={p.eta ? `срок ${dShort(p.eta)}` : 'срок не назван'} /> : dash) },
    { head: 'Состояние', cell: status },
  ] : [
    { head: 'Материал', phone: 'title', cell: (p) => material(d, p.materialId).name },
    { head: 'Заявка', phone: 'sub', cell: (p) => <>№ {needNum(p) ?? '—'} · <span className={late(p) ? 'neg' : ''}>нужно к {dShort(p.wantDate)}</span></> },
    { head: 'Количество', phone: 'value', num: true, cell: (p) => qty(p.qty, material(d, p.materialId).unit) },
    { head: 'Состояние', phone: 'meta', cell: status },
  ];
  return (
    <>
      <Card flush>
        <DataTable cols={cols} rows={purchases} keyOf={(p) => p.id} onRow={onOpen} empty="Снабженцу пока ничего не передавали." />
      </Card>
      {can.length > 0 && (
        <Details label={`На складе нет, можно передать снабженцу · ${can.length}`}>
          <Card flush>
            <List>
              {can.map((r) => (
                <Row key={r.line.id} wrap title={r.mat.name}
                  sub={<>{r.need.urgent && <><Status kind="problem">Срочно</Status> </>}{qty(lineStats(r.line).open, r.mat.unit)} · {needTitle(d, r.need)} · нужно к {dShort(r.line.wantDate)}</>}
                  side={<Btn small onClick={() => hand(r)}>Передать</Btn>} />
              ))}
            </List>
          </Card>
        </Details>
      )}
    </>
  );
}

/** Positions that are not on site yet, object by object. */
function ByObject() {
  const d = useData();
  const lines = allLines(d);
  const objects = d.objects.filter((o) => lines.some((r) => r.need.objectId === o.id));
  return (
    <div className="grid cols-2">
      {objects.map((o) => {
        const mine = lines.filter((r) => r.need.objectId === o.id);
        const rows = mine.filter((r) => lineState(r.line) !== 'done').sort((a, b) => a.line.wantDate.localeCompare(b.line.wantDate));
        return (
          <Card key={o.id} title={o.name} note={`обеспечено ${mine.length - rows.length} из ${mine.length}`} flush>
            {rows.length ? (
              <List>
                {rows.map((r) => {
                  const s = lineState(r.line);
                  return (
                    <Row key={r.line.id} to={to.need(r.need.id)} title={r.mat.name}
                      sub={<>№ {r.need.num} · нужно к <span className={r.line.wantDate < d.today ? 'neg' : ''}>{dShort(r.line.wantDate)}</span></>}
                      side={<Pill tone={LINE_TONE[s]}>{LINE_LABEL[s]}</Pill>} />
                  );
                })}
              </List>
            ) : <div className="card-body"><Empty>Всё получено.</Empty></div>}
          </Card>
        );
      })}
    </div>
  );
}

function Home() {
  const d = useData();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('f');
  const f: Filter = raw === 'work' || raw === 'clarify' || raw === 'done' || raw === 'all' || raw === 'supplier' ? raw : 'wait';
  const set = (k: string, v?: string) => {
    const q = new URLSearchParams(sp);
    if (v) q.set(k, v); else q.delete(k);
    if (k === 'f') q.delete('open');
    setSp(q, { replace: true });
  };
  const purchase = byId(d.purchases, sp.get('open'));
  const n = (k: NeedFilter) => d.needs.filter(NEED_FILTER[k]).length;
  const wait = d.needs.filter(NEED_FILTER.wait);
  const urgent = wait.filter((x) => x.urgent).length;
  const ready = d.needs.filter(readyToShip).length;
  const activePurchases = d.purchases.filter((p) => p.status !== 'received').length;

  const shown = (f === 'all' ? d.needs : f === 'supplier' ? [] : d.needs.filter(NEED_FILTER[f])).slice().sort((a, b) => {
    const done = (x: Need) => Number(needState(x) === 'done');
    return done(a) - done(b)
      || (done(a) ? b.date.localeCompare(a.date) : 0)
      || Number(readyToShip(b)) - Number(readyToShip(a))
      || Number(!!b.urgent) - Number(!!a.urgent)
      || (nearestWant(a) ?? a.date).localeCompare(nearestWant(b) ?? b.date)
      || a.num - b.num;
  });

  const sub = [
    wait.length ? count(wait.length, 'заявка ждёт', 'заявки ждут', 'заявок ждут') : 'Новых заявок нет',
    urgent ? `срочных ${urgent}` : '',
    ready ? `к отправке ${ready}` : '',
  ].filter(Boolean).join(', ');

  return (
    <Page title="Заявки" sub={sub}>
      <TodoCard limit={3} />
      <Chips value={f} onChange={(v) => set('f', v)} options={[
        { value: 'wait', label: 'Ждут', count: n('wait') },
        { value: 'work', label: 'В работе', count: n('work') },
        { value: 'clarify', label: 'Нужен ответ', count: n('clarify') },
        { value: 'done', label: 'Готово', count: n('done') },
        { value: 'all', label: 'Все', count: d.needs.length },
        { value: 'supplier', label: 'У снабженца', count: activePurchases },
      ]} />
      {f === 'supplier' ? (
        <SupplierView onOpen={(p) => set('open', p.id)} />
      ) : (
        <Card flush>
          {shown.length ? <List>{shown.map((x) => <NeedRow key={x.id} n={x} />)}</List> : <div className="card-body"><Empty>Здесь пока ничего нет.</Empty></div>}
        </Card>
      )}
      <Details label="По объектам"><ByObject /></Details>
      <div><More to="/manager/report">Отчёт по обеспечению</More></div>
      {purchase && <PurchaseSheet key={purchase.id} p={purchase} onClose={() => set('open')} />}
    </Page>
  );
}

/** The old summary page opened a delivery by ?open=; on the Заказы page it is ?delivery=. */
function SupplyRedirect() {
  const { search } = useLocation();
  const q = new URLSearchParams(search);
  const open = q.get('open');
  if (open) { q.delete('open'); q.set('delivery', open); }
  if (!q.has('tab')) q.set('tab', 'deliveries');
  return <Navigate to={`/manager/orders?${q.toString()}`} replace />;
}

export const routes: { path: string; element: ReactNode }[] = [
  { path: '/manager', element: <Home /> },
  { path: '/manager/needs/:id', element: <NeedPage /> },
  { path: '/manager/stock', element: <Stock /> },
  { path: '/manager/orders', element: <OrdersPage /> },
  { path: '/manager/report', element: <Report /> },
  // old addresses
  { path: '/manager/needs', element: <Go to="/manager" /> },
  { path: '/manager/handoff', element: <Go to="/manager" add={{ f: 'supplier' }} /> },
  { path: '/manager/supply', element: <SupplyRedirect /> },
  { path: '/manager/analytics', element: <Go to="/manager/report" /> },
];
