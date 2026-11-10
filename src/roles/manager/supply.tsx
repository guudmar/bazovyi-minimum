// The summary side of the manager's work: what each site still waits for, what went to the supplier, and how supply performs.
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { act, useData } from '../../data/store';
import {
  lineState, lineStats, material, objectName, stockView, LINE_LABEL, LINE_TONE, PURCHASE_LABEL, PURCHASE_TONE, type LineState,
} from '../../data/select';
import { Btn, Card, DataTable, Empty, List, Page, Pill, Row, Stats, Track, Two, toast, useWide, type Col } from '../../ui/kit';
import { count, dShort, daysBetween, pct, qty } from '../../lib/format';
import type { Delivery, DeliveryLine, Purchase, Route } from '../../data/types';
import { ISSUE_TEXT, LineCell, NameCell, allLines, dash, deficits, n1, needTitle, type Deficit, type LineRow } from './lib';

/* ---------------------------------------------------------------- supply */
// from what needs the manager's attention to what is finished
const STATE_ORDER: LineState[] = ['clarify', 'check', 'partial', 'stock', 'order', 'handed', 'shipping', 'done'];

export function Supply() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  const lines = allLines(d);
  const open = lines.filter((r) => lineState(r.line) !== 'done');
  const late = open.filter((r) => r.line.wantDate < d.today).length;
  const sites = new Set(open.map((r) => r.need.objectId)).size;
  const problems = d.deliveries.filter((x) => x.status === 'problem').sort((a, b) => (b.receivedAt ?? b.eta).localeCompare(a.receivedAt ?? a.eta));

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

  const problemCard = (
    <Card title="Расхождения при получении" flush>
      {problems.length ? (
        <List>
          {problems.map((dl) => {
            const bad = dl.lines.filter((l) => l.issue || (l.received !== undefined && l.received !== l.qty));
            return (
              <Row key={dl.id} wrap
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
      {problems.length === 0 && problemCard}
    </Page>
  );
}

/* --------------------------------------------------------------- handoff */
export function Handoff() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  // the warehouse has nothing to give for these positions, so the supplier is the next route to consider
  const can = allLines(d)
    .filter((r) => lineStats(r.line).open > 0 && stockView(d, r.mat.id).available === 0)
    .sort((a, b) => Number(!!b.need.urgent) - Number(!!a.need.urgent) || a.line.wantDate.localeCompare(b.line.wantDate));
  const purchases = [...d.purchases].sort((a, b) =>
    Number(a.status === 'received') - Number(b.status === 'received') || a.wantDate.localeCompare(b.wantDate));
  const active = purchases.filter((p) => p.status !== 'received').length;

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
        <DataTable cols={cols} rows={purchases} keyOf={(p) => p.id} onRow={(p) => nav(`/manager/needs/${p.needId}`)}
          empty="Снабженцу пока ничего не передавали." />
      </Card>
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
        ? `Обеспечено ${pct(share)} позиций${top && top.n ? `, чаще всего материалы идут ${top.how}: ${pct(top.n / parts.length)} частей` : ''}.`
        : 'Потребностей пока не было, считать нечего.'}
    >
      <Stats items={[
        { label: 'Обеспечено позиций', value: pct(share), lead: true, hint: `${done} из ${lines.length}` },
        { label: 'Задержки', value: <span className={delays.length ? 'neg' : ''}>{delays.length}</span>, zero: !delays.length, hint: `заказов ${lateOrders.length} · позиций ${lateLines.length}` },
        { label: 'Недопоставки', value: shorts.length, zero: !shorts.length, hint: 'строк поставок с расхождением' },
        { label: 'Дефицитные материалы', value: lack.length, zero: !lack.length, hint: 'спрос больше остатка' },
      ]} />

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
