// The summary side of the manager's work: what each site still waits for, what went to the supplier, and how supply performs.
// A delivery and a purchase open by their address (?open=<id>), so every part of a need leads to the record behind it.
import { type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { act, useData } from '../../data/store';
import {
  byId, lineState, lineStats, material, objectName, stockView, LINE_LABEL, LINE_TONE, PURCHASE_LABEL, PURCHASE_TONE, type LineState,
} from '../../data/select';
import { Btn, Card, DataTable, Empty, List, More, Page, Pill, Row, Sheet, Stats, Track, Two, toast, useWide, type Col } from '../../ui/kit';
import { count, dFull, dRel, dShort, daysBetween, money, pct, qty } from '../../lib/format';
import type { Delivery, DeliveryLine, Need, Purchase, Route } from '../../data/types';
import {
  DELIVERY_STATE, ISSUE_TEXT, LineCell, NameCell, allLines, dash, deficits, deliveryDiffers, deliveryOfPart, n1, needTitle, type Deficit, type LineRow,
} from './lib';

/* ---------------------------------------------------------------- supply */
// from what needs the manager's attention to what is finished
const STATE_ORDER: LineState[] = ['clarify', 'check', 'partial', 'stock', 'order', 'handed', 'shipping', 'done'];

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
          <dt>Источник</dt><dd>{dl.source}</dd>
          <dt>{waiting ? 'Ждут на объекте' : 'Получена'}</dt>
          <dd><span className={waiting && dl.eta < d.today ? 'neg' : ''}>{dFull(waiting ? dl.eta : dl.receivedAt ?? dl.eta)}</span></dd>
          <dt>Место хранения</dt><dd>{dl.place ?? dash}</dd>
          <dt>Комментарий прораба</dt><dd>{dl.comment ?? dash}</dd>
        </dl>

        <div className="section-title">Позиции</div>
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
                <Row key={x.id} wrap title={x.sourceName} sub={`${x.sourceCode ? `код ${x.sourceCode}` : 'кода в документе нет'} · временная запись, в обеспечение не засчитана`}
                  value={qty(x.qty, x.unit)} />
              ))}
            </div>
          </>
        ) : null}

        <div className="section-title">Связанные записи</div>
        <div className="list" style={{ margin: '0 -16px' }}>
          {needs.map((n) => <Row key={n.id} to={`/manager/needs/${n.id}`} title={`Потребность ${needTitle(d, n)}`} sub={`от ${dShort(n.date)}`} />)}
          {purchases.map((p) => (
            <Row key={p.id} to={`/manager/handoff?open=${p.id}`} title={`Закупка № ${p.num}`} sub={p.supplier ?? 'поставщик не выбран'}
              meta={<Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>} />
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Отправка ещё не получение: получение подтверждает прораб на объекте.</p>
      </div>
    </Sheet>
  );
}

export function Supply() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  const [sp, setSp] = useSearchParams();
  const lines = allLines(d);
  const open = lines.filter((r) => lineState(r.line) !== 'done');
  const late = open.filter((r) => r.line.wantDate < d.today).length;
  const sites = new Set(open.map((r) => r.need.objectId)).size;
  const problems = d.deliveries.filter(deliveryDiffers).sort((a, b) => (b.receivedAt ?? b.eta).localeCompare(a.receivedAt ?? a.eta));
  const deliveries = [...d.deliveries].sort((a, b) =>
    Number(a.status !== 'expected') - Number(b.status !== 'expected')
    || (a.status === 'expected' ? a.eta.localeCompare(b.eta) : (b.receivedAt ?? b.eta).localeCompare(a.receivedAt ?? a.eta)));
  const shown = byId(d.deliveries, sp.get('open'));
  const show = (dl: Delivery) => setSp({ open: dl.id }, { replace: true });

  const state = (r: LineRow): ReactNode => { const s = lineState(r.line); return <Pill tone={LINE_TONE[s]}>{LINE_LABEL[s]}</Pill>; };
  const want = (r: LineRow, prefix = ''): ReactNode => <span className={r.line.wantDate < d.today ? 'neg' : ''}>{prefix}{dShort(r.line.wantDate)}</span>;
  const cols: Col<LineRow>[] = wide ? [
    { head: 'Материал', cell: (r) => <LineCell name={r.mat.name} line={r.line} /> },
    { head: 'Потребность', width: '120px', cell: (r) => `№ ${r.need.num}` },
    { head: 'Нужно', num: true, width: '110px', cell: (r) => qty(r.line.qty, r.mat.unit) },
    { head: 'Получено', num: true, width: '110px', cell: (r) => qty(lineStats(r.line).received, r.mat.unit) },
    { head: 'Состояние', width: '190px', cell: state },
    { head: 'Нужно к', width: '100px', cell: (r) => want(r) },
  ] : [
    { head: 'Материал', phone: 'title', cell: (r) => <LineCell name={r.mat.name} line={r.line} /> },
    { head: 'Потребность', phone: 'sub', cell: (r) => `№ ${r.need.num}` },
    { head: 'Нужно к', phone: 'sub', cell: (r) => want(r, 'нужно к ') },
    { head: 'Получено', phone: 'value', num: true, cell: (r) => `${n1(lineStats(r.line).received)} из ${qty(r.line.qty, r.mat.unit)}` },
    { head: 'Состояние', phone: 'meta', cell: state },
  ];

  const dlState = (dl: Delivery): ReactNode => <Pill tone={DELIVERY_STATE[dl.status].tone}>{DELIVERY_STATE[dl.status].label}</Pill>;
  const dlWhen = (dl: Delivery): ReactNode => (dl.status === 'expected'
    ? <span className={dl.eta < d.today ? 'neg' : ''}>ждут {dRel(dl.eta, d.today).toLowerCase()}</span>
    : `получена ${dShort(dl.receivedAt ?? dl.eta)}`);
  const dlWhat = (dl: Delivery): string => {
    const first = material(d, dl.lines[0].materialId).name;
    return dl.lines.length > 1 ? `${first} и ещё ${dl.lines.length - 1}` : first;
  };
  const dlCols: Col<Delivery>[] = wide ? [
    { head: 'Поставка', cell: (dl) => <Two a={`№ ${dl.num}`} b={dl.source} /> },
    { head: 'Объект', cell: (dl) => objectName(d, dl.objectId) },
    { head: 'Позиции', cell: dlWhat },
    { head: 'Место хранения', cell: (dl) => dl.place ?? dash },
    { head: 'Срок или получение', cell: dlWhen },
    { head: 'Состояние', cell: dlState },
  ] : [
    { head: 'Поставка', phone: 'title', cell: (dl) => `№ ${dl.num} · ${dl.source}` },
    { head: 'Объект', phone: 'sub', cell: (dl) => objectName(d, dl.objectId) },
    { head: 'Позиции', phone: 'sub', cell: dlWhat },
    { head: 'Срок или получение', phone: 'value', cell: dlWhen },
    { head: 'Состояние', phone: 'meta', cell: dlState },
  ];

  const problemCard = (
    <Card title="Расхождения при получении" flush>
      {problems.length ? (
        <List>
          {problems.map((dl) => {
            const bad = dl.lines.filter((l) => l.issue || (l.received !== undefined && l.received !== l.qty));
            return (
              <Row key={dl.id} wrap onClick={() => show(dl)}
                title={(
                  <>
                    <div>Поставка № {dl.num} · {objectName(d, dl.objectId)}</div>
                    {bad.map((l, i) => {
                      const m = material(d, l.materialId);
                      return (
                        <div key={i} style={{ fontWeight: 400, marginTop: 2 }}>
                          {m.name}: получено {n1(l.received ?? 0)} из {qty(l.qty, m.unit)}{l.issue ? `, ${ISSUE_TEXT[l.issue]}` : ''}
                        </div>
                      );
                    })}
                    {(dl.extras ?? []).map((x) => (
                      <div key={x.id} style={{ fontWeight: 400, marginTop: 2 }}>Вне заказа: {x.sourceName}, {qty(x.qty, x.unit)}</div>
                    ))}
                  </>
                )}
                sub={`${dl.source}${dl.comment ? ` · прораб: ${dl.comment}` : ''}`}
                value={dShort(dl.receivedAt ?? dl.eta)} />
            );
          })}
        </List>
      ) : <Empty>Все поставки приняты прорабами без расхождений.</Empty>}
    </Card>
  );

  return (
    <Page
      title="Обеспечение объектов"
      sub={open.length
        ? `${count(open.length, 'позиция не обеспечена', 'позиции не обеспечены', 'позиций не обеспечено')} на ${count(sites, 'объекте', 'объектах', 'объектах')}, ${
          late ? `по ${late} из них срок уже прошёл` : 'просроченных среди них нет'}.`
        : 'Все позиции по всем объектам обеспечены.'}
    >
      {problems.length > 0 && problemCard}
      {d.objects.map((o) => {
        const mine = lines.filter((r) => r.need.objectId === o.id);
        const rows = mine.filter((r) => lineState(r.line) !== 'done').sort((a, b) => a.line.wantDate.localeCompare(b.line.wantDate));
        const done = mine.length - rows.length;
        return (
          <Card key={o.id} title={o.name} note={mine.length ? `обеспечено ${done} из ${mine.length}` : undefined} flush>
            {mine.length > 0 && (
              <div className="card-body">
                <div className="btn-row">
                  {STATE_ORDER.map((s) => {
                    const n = mine.filter((r) => lineState(r.line) === s).length;
                    return n ? <Pill key={s} tone={LINE_TONE[s]}>{LINE_LABEL[s]} <b className="num" style={{ fontWeight: 600 }}>{n}</b></Pill> : null;
                  })}
                </div>
              </div>
            )}
            <DataTable cols={cols} rows={rows} keyOf={(r) => r.line.id} onRow={(r) => nav(`/manager/needs/${r.need.id}`)}
              empty={mine.length ? 'Все позиции объекта обеспечены.' : 'Потребностей по объекту пока не было.'} />
          </Card>
        );
      })}
      <Card title="Поставки на объекты" note={count(deliveries.length, 'поставка', 'поставки', 'поставок')} flush>
        <DataTable cols={dlCols} rows={deliveries} keyOf={(dl) => dl.id} onRow={show} empty="Поставок на объекты ещё не было." />
      </Card>
      {problems.length === 0 && problemCard}
      {shown && <DeliverySheet key={shown.id} dl={shown} onClose={() => setSp({}, { replace: true })} />}
    </Page>
  );
}

/* --------------------------------------------------------------- handoff */
/** A purchase as the manager sees it: read-only, with the need it came from and the delivery it turned into. */
function PurchaseSheet({ p, onClose }: { p: Purchase; onClose: () => void }) {
  const d = useData();
  const m = material(d, p.materialId);
  const need = byId(d.needs, p.needId);
  const dl = deliveryOfPart(d, p.partId);
  return (
    <Sheet open title={`Закупка № ${p.num}`} onClose={onClose}>
      <div className="stack">
        <div style={{ fontWeight: 600, fontSize: 16 }}>{m.name}</div>
        <dl className="kv left">
          <dt>Статус</dt><dd><Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill></dd>
          <dt>Количество</dt><dd>{qty(p.qty, m.unit)}</dd>
          <dt>Объект</dt><dd>{objectName(d, p.objectId)}</dd>
          <dt>Нужно к</dt><dd className={p.status !== 'received' && p.wantDate < d.today ? 'neg' : ''}>{dFull(p.wantDate)}</dd>
          <dt>Причина</dt><dd>{p.reason}</dd>
          <dt>Поставщик</dt><dd>{p.supplier ?? dash}</dd>
          <dt>Цена</dt><dd>{p.price !== undefined ? `${money(p.price)} за ${m.unit}, всего ${money(p.price * p.qty)}` : dash}</dd>
          <dt>Срок поставки</dt><dd>{p.eta ? dFull(p.eta) : dash}</dd>
          <dt>Потребность</dt><dd>{need ? <More to={`/manager/needs/${need.id}`}>{needTitle(d, need)}</More> : dash}</dd>
          <dt>Поставка</dt>
          <dd>
            {dl
              ? <><More to={`/manager/supply?open=${dl.id}`}>№ {dl.num}</More> <Pill tone={DELIVERY_STATE[dl.status].tone}>{DELIVERY_STATE[dl.status].label}</Pill></>
              : <span className="muted">появится, когда поставщик отгрузит</span>}
          </dd>
        </dl>
        <div className="section-title">История</div>
        {p.history.length
          ? <div className="stack" style={{ gap: 6 }}>{p.history.map((h, i) => <p key={i}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)}</div>
          : <p className="muted">Событий по закупке пока нет.</p>}
        <p className="muted" style={{ fontSize: 13 }}>Закупку ведёт снабженец. Здесь видно её состояние, условия меняет он.</p>
      </div>
    </Sheet>
  );
}

export function Handoff() {
  const d = useData();
  const wide = useWide();
  const [sp, setSp] = useSearchParams();
  // the warehouse has nothing to give for these positions, so the supplier is the next route to consider
  const can = allLines(d)
    .filter((r) => lineStats(r.line).open > 0 && stockView(d, r.mat.id).available === 0)
    .sort((a, b) => Number(!!b.need.urgent) - Number(!!a.need.urgent) || a.line.wantDate.localeCompare(b.line.wantDate));
  const purchases = [...d.purchases].sort((a, b) =>
    Number(a.status === 'received') - Number(b.status === 'received') || a.wantDate.localeCompare(b.wantDate));
  const active = purchases.filter((p) => p.status !== 'received').length;
  const shown = byId(d.purchases, sp.get('open'));

  const hand = (r: LineRow) => {
    const open = lineStats(r.line).open;
    act.routeLine(r.need.id, r.line.id, 'supplier', open, { text: 'На складе торгового направления нет в наличии' });
    toast(`Передано снабженцу: ${r.mat.name}, ${qty(open, r.mat.unit)}`);
  };

  const needNum = (p: Purchase) => d.needs.find((n) => n.id === p.needId)?.num;
  const late = (p: Purchase) => p.status !== 'received' && p.wantDate < d.today;
  const status = (p: Purchase): ReactNode => <Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>;
  const cols: Col<Purchase>[] = wide ? [
    { head: 'Материал', cell: (p) => <Two a={material(d, p.materialId).name} b={`закупка № ${p.num}`} /> },
    { head: 'Количество', num: true, cell: (p) => qty(p.qty, material(d, p.materialId).unit) },
    { head: 'Объект', cell: (p) => objectName(d, p.objectId) },
    { head: 'Потребность', cell: (p) => (needNum(p) ? `№ ${needNum(p)}` : dash) },
    { head: 'Нужно к', cell: (p) => <span className={late(p) ? 'neg' : ''}>{dShort(p.wantDate)}</span> },
    { head: 'Статус закупки', cell: status },
    { head: 'Поставщик и срок', cell: (p) => (p.supplier ? <Two a={p.supplier} b={p.eta ? `срок ${dShort(p.eta)}` : 'срок не назван'} /> : dash) },
  ] : [
    { head: 'Материал', phone: 'title', cell: (p) => material(d, p.materialId).name },
    { head: 'Потребность и объект', phone: 'sub', cell: (p) => `№ ${needNum(p) ?? '—'} · ${objectName(d, p.objectId)}` },
    { head: 'Нужно к', phone: 'sub', cell: (p) => <span className={late(p) ? 'neg' : ''}>к {dShort(p.wantDate)}</span> },
    { head: 'Поставщик и срок', phone: 'sub', cell: (p) => (p.supplier ? `${p.supplier}${p.eta ? `, срок ${dShort(p.eta)}` : ''}` : 'поставщик не выбран') },
    { head: 'Количество', phone: 'value', num: true, cell: (p) => qty(p.qty, material(d, p.materialId).unit) },
    { head: 'Статус закупки', phone: 'meta', cell: status },
  ];

  return (
    <Page
      title="Передача снабженцу"
      sub={`${active ? `У снабженца ${count(active, 'закупка', 'закупки', 'закупок')} в работе` : 'Закупок в работе у снабженца нет'}${
        can.length ? `, ещё ${count(can.length, 'позицию', 'позиции', 'позиций')} склад закрыть не может` : ''}.`}
    >
      <Card title="Можно передать" note={can.length ? 'на складе нет в наличии' : undefined} flush>
        {can.length ? (
          <List>
            {can.map((r) => {
              const open = lineStats(r.line).open;
              const expected = stockView(d, r.mat.id).expected;
              const urgent = r.need.urgent ? <Pill tone="negative">Срочно</Pill> : undefined;
              // on a phone the button takes the room of the value column, so the quantity moves to the grey line
              return (
                <Row key={r.line.id} wrap title={<LineCell name={r.mat.name} line={r.line} />}
                  sub={(
                    <>
                      {!wide && <>{urgent}{urgent && ' '}{qty(open, r.mat.unit)} · </>}
                      {needTitle(d, r.need)} · нужно к <span className={r.line.wantDate < d.today ? 'neg' : ''}>{dShort(r.line.wantDate)}</span>
                      {expected > 0 && ` · на склад едет ${qty(expected, r.mat.unit)}`}
                    </>
                  )}
                  value={wide ? qty(open, r.mat.unit) : undefined}
                  meta={wide ? urgent : undefined}
                  side={<Btn onClick={() => hand(r)}>Передать</Btn>} />
              );
            })}
          </List>
        ) : <Empty>Позиций, которые склад не может закрыть, сейчас нет.</Empty>}
      </Card>
      <Card title="Передано снабженцу" note={count(purchases.length, 'закупка', 'закупки', 'закупок')} flush>
        <DataTable cols={cols} rows={purchases} keyOf={(p) => p.id} onRow={(p) => setSp({ open: p.id }, { replace: true })}
          empty="Снабженцу пока ничего не передавали." />
      </Card>
      {shown && <PurchaseSheet key={shown.id} p={shown} onClose={() => setSp({}, { replace: true })} />}
    </Page>
  );
}

/* ------------------------------------------------------------- analytics */
interface DelayRow { id: string; what: string; ref: string; date: string; days: number }
interface ShortRow { id: string; dl: Delivery; line: DeliveryLine }

const SOURCES: { route: Exclude<Route, 'clarify'>; label: string; how: string }[] = [
  { route: 'stock', label: 'Со склада', how: 'со склада' },
  { route: 'order', label: 'Заказ через торговое направление', how: 'через заказ торгового направления' },
  { route: 'supplier', label: 'Через снабженца', how: 'через снабженца' },
];
/** The share of supply the trade direction is expected to cover: its warehouse plus its own orders. A guide, not a gate. */
const TRADE_TARGET = 0.9;

/** Everything here is counted in positions and parts: units differ, so quantities are never summed across materials. */
export function Analytics() {
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
    id: r.line.id, what: r.mat.name, ref: `Потребность ${needTitle(d, r.need)}`, date: r.line.wantDate, days: daysBetween(r.line.wantDate, d.today),
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
    { head: 'Материал', phone: 'title', cell: (r) => <NameCell a={r.mat.name} b={`потребности ${[...new Set(r.rows.map((x) => `№ ${x.need.num}`))].join(', ')}`} /> },
    { head: 'Без маршрута', num: true, phone: 'sub', cell: (r) => `${tag('без маршрута')}${qty(r.demand, r.mat.unit)}` },
    { head: 'Доступно', num: true, phone: 'sub', cell: (r) => `${tag('доступно')}${n1(r.available)}` },
    { head: 'Ожидается', num: true, phone: 'sub', cell: (r) => `${tag('ожидается')}${n1(r.expected)}` },
    { head: 'Не хватает', num: true, phone: 'value', cell: (r) => <b className="neg" style={{ fontWeight: 600 }}>{qty(r.demand - r.available, r.mat.unit)}</b> },
    ...(wide ? [] : [{ head: 'Подпись', phone: 'meta' as const, cell: () => 'не хватает' }]),
  ];

  return (
    <Page
      title="Аналитика обеспечения"
      sub={lines.length
        ? `Обеспечено ${pct(share)} позиций${parts.length ? `; через торговое направление идёт ${pct(tradeShare)} частей при цели около ${pct(TRADE_TARGET)}` : ''}.`
        : 'Потребностей пока не было, считать нечего.'}
    >
      <Stats items={[
        { label: 'Обеспечено позиций', value: pct(share), lead: true, hint: `${done} из ${lines.length}` },
        { label: 'Через торговое направление', value: parts.length ? pct(tradeShare) : dash, hint: `цель около ${pct(TRADE_TARGET)}` },
        { label: 'Задержки', value: <span className={delays.length ? 'neg' : ''}>{delays.length}</span>, zero: !delays.length, hint: `заказов ${lateOrders.length} · позиций ${lateLines.length}` },
        { label: 'Недопоставки', value: shorts.length, zero: !shorts.length, hint: 'строк поставок с расхождением' },
        { label: 'Дефицитные материалы', value: lack.length, zero: !lack.length, hint: 'спрос больше остатка' },
      ]} />

      <Card title="Доля торгового направления" note="склад и заказы, по числу частей">
        {parts.length ? (
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <span>Обеспечено со склада и заказами торгового направления</span><span className="num">{pct(tradeShare)}</span>
              </div>
              <Track value={trade} max={parts.length} hue />
              <div className="track-ends">
                <span>{count(trade, 'часть', 'части', 'частей')} из {parts.length}</span>
                <span>цель: около {pct(TRADE_TARGET)}</span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, maxWidth: '76ch' }}>
              Цель: около {pct(TRADE_TARGET)} обеспечения через торговое направление.{' '}
              {gap > 0 ? `Сейчас до неё не хватает ${count(gap, 'процентного пункта', 'процентных пунктов', 'процентных пунктов')}.` : 'Сейчас цель выполнена.'}{' '}
              Цель не блокирует другой маршрут: если склад и заказ не закрывают позицию в срок, она передаётся снабженцу.
            </p>
          </div>
        ) : <Empty>Ни одна позиция ещё не распределена, долю считать не из чего.</Empty>}
      </Card>

      <div className="grid cols-2">
        <Card title="Обеспеченность по объектам" note="по числу позиций">
          <div className="stack" style={{ gap: 16 }}>
            {d.objects.map((o) => {
              const mine = lines.filter((r) => r.need.objectId === o.id);
              const ok = mine.filter((r) => lineState(r.line) === 'done').length;
              return (
                <div key={o.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <span>{o.name}</span><span className="num">{mine.length ? pct(ok / mine.length) : dash}</span>
                  </div>
                  <Track value={ok} max={mine.length} />
                  <div className="track-ends"><span>обеспечено {ok}</span><span>всего {count(mine.length, 'позиция', 'позиции', 'позиций')}</span></div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Источники обеспечения" note="по числу частей">
          {parts.length ? (
            <div className="stack" style={{ gap: 16 }}>
              {sources.map((s) => (
                <div key={s.route}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <span>{s.label}</span><span className="num">{pct(s.n / parts.length)}</span>
                  </div>
                  <Track value={s.n} max={parts.length} hue={s === top} />
                  <div className="track-ends"><span>{count(s.n, 'часть', 'части', 'частей')}</span><span>из {parts.length}</span></div>
                </div>
              ))}
            </div>
          ) : <Empty>Ни одна позиция ещё не распределена.</Empty>}
        </Card>
      </div>

      <Card title="Задержки" note="заказы на склад и позиции с прошедшим сроком" flush>
        <DataTable cols={delayCols} rows={delays} keyOf={(r) => r.id} empty="Задержек нет: заказы идут в срок, просроченных позиций нет." />
      </Card>
      <div className="grid cols-2">
        <Card title="Недопоставки" flush>
          <DataTable cols={shortCols} rows={shorts} keyOf={(r) => r.id} empty="Расхождений при получении не было." />
        </Card>
        <Card title="Дефицитные материалы" flush>
          <DataTable cols={lackCols} rows={lack} keyOf={(r) => r.mat.id} empty="Доступного остатка хватает на все нераспределённые позиции." />
        </Card>
      </div>
    </Page>
  );
}
