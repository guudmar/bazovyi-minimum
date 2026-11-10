// The trade manager's workspace. Needs of the sites come in, every position is sent down one or several routes
// (warehouse, trade order, supplier, a question to the foreman), and all parts stay tied to the original need.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { act, useData } from '../../data/store';
import { lineStats, material, needOpenQty, needProgress, needState, objectName, NEED_LABEL, NEED_TONE, type NeedState } from '../../data/select';
import { Btn, Card, Chips, DataTable, Empty, List, More, Page, Pill, Row, Seg, Stats, Two, toast, useWide, type Col } from '../../ui/kit';
import { addDays, count, dRel, dShort, pct, qty } from '../../lib/format';
import type { Data, Need } from '../../data/types';
import { allLines, nearestWant, needTitle } from './lib';
import { NeedPage } from './need';
import { Orders, Stock } from './stock';
import { Analytics, Handoff, Supply } from './supply';

/* ------------------------------------------------------------------ home */
function Home() {
  const d = useData();
  const waiting = d.needs
    .filter((n) => needOpenQty(n) > 0)
    .sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || a.date.localeCompare(b.date));
  const urgent = waiting.filter((n) => n.urgent).length;
  const fresh = d.needs.filter((n) => needState(n) === 'new').length;
  const openLines = allLines(d).filter((r) => lineStats(r.line).open > 0).length;
  const ready = d.needs.filter((n) => n.lines.some((l) => l.parts.some((p) => p.status === 'reserved')));
  const reservedParts = allLines(d).reduce((s, r) => s + r.line.parts.filter((p) => p.status === 'reserved').length, 0);
  const coming = d.tradeOrders.filter((o) => o.status !== 'arrived').sort((a, b) => a.eta.localeCompare(b.eta));
  const delayed = coming.filter((o) => o.status === 'delayed').length;
  const asked = d.needs.flatMap((n) => (n.question ? [{ n, q: n.question }] : [])).sort((a, b) => b.n.date.localeCompare(a.n.date));

  const ship = (n: Need) => {
    act.shipFromStock(n.id);
    toast(`Потребность № ${n.num}: резерв отправлен на объект`);
  };

  return (
    <Page
      title="Потребности объектов"
      sub={waiting.length
        ? `${count(waiting.length, 'потребность ждёт', 'потребности ждут', 'потребностей ждут')} распределения, ${
          urgent === 0 ? 'срочных среди них нет' : urgent === 1 ? (waiting.length === 1 ? 'она срочная' : 'одна из них срочная') : `${urgent} из них срочные`}.`
        : 'Все потребности распределены по маршрутам.'}
    >
      <Stats items={[
        { label: 'Новые потребности', value: fresh, zero: !fresh },
        { label: 'Позиции без маршрута', value: openLines, zero: !openLines, hint: openLines ? `в ${count(waiting.length, 'потребности', 'потребностях', 'потребностях')}` : undefined },
        { label: 'Готово к отправке', value: reservedParts, zero: !reservedParts, hint: reservedParts ? 'в резерве на складе' : undefined },
        { label: 'Задержки заказов', value: <span className={delayed ? 'neg' : ''}>{delayed}</span>, zero: !delayed },
      ]} />

      <div className="grid cols-2">
        <Card title="Ждут распределения" action={<More to="/manager/needs">Вся очередь</More>} flush>
          {waiting.length ? (
            <List>
              {waiting.map((n) => {
                const open = n.lines.filter((l) => lineStats(l).open > 0);
                const want = open.map((l) => l.wantDate).sort()[0];
                return (
                  <Row key={n.id} to={`/manager/needs/${n.id}`} title={needTitle(d, n)}
                    sub={<>{count(open.length, 'позиция', 'позиции', 'позиций')} без маршрута · нужно к <span className={want < d.today ? 'neg' : ''}>{dShort(want)}</span></>}
                    side={n.urgent ? <Pill tone="negative">Срочно</Pill> : undefined} />
                );
              })}
            </List>
          ) : <Empty>Нераспределённых потребностей нет.</Empty>}
        </Card>
        <Card title="Готово к отправке со склада" flush>
          {ready.length ? (
            <List>
              {ready.map((n) => {
                const parts = n.lines.flatMap((l) => l.parts
                  .filter((p) => p.status === 'reserved')
                  .map((p) => `${material(d, l.materialId).name}, ${qty(p.qty, material(d, l.materialId).unit)}`));
                return <Row key={n.id} title={needTitle(d, n)} sub={parts.join(' · ')} side={<Btn onClick={() => ship(n)}>Отправить</Btn>} />;
              })}
            </List>
          ) : <Empty>В резерве под потребности сейчас ничего не лежит.</Empty>}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Ждём на складе" action={<More to="/manager/orders">Все заказы</More>} flush>
          {coming.length ? (
            <List>
              {coming.map((o) => {
                const m = material(d, o.materialId);
                const need = d.needs.find((n) => n.id === o.needId);
                return (
                  <Row key={o.id} to="/manager/orders" title={m.name}
                    sub={`Заказ № ${o.num} · ${o.supplier} · ${qty(o.qty, m.unit)}`}
                    value={<span className={o.eta < d.today ? 'neg' : ''}>{dRel(o.eta, d.today)}</span>}
                    meta={o.status === 'delayed' ? <Pill tone="negative">Задержка</Pill> : need ? `для № ${need.num}` : 'на склад'} />
                );
              })}
            </List>
          ) : <Empty>Открытых заказов на склад нет.</Empty>}
        </Card>
        <Card title="Вопросы прорабам" flush>
          {asked.length ? (
            <List>
              {asked.map(({ n, q }) => (
                <Row key={n.id} to={`/manager/needs/${n.id}`} wrap
                  title={(
                    <>
                      <div>{q.text}</div>
                      <div style={{ fontWeight: 400, marginTop: 2 }}>{q.answer ? <>Ответ: {q.answer}</> : <span className="muted">ответа пока нет</span>}</div>
                    </>
                  )}
                  sub={`${needTitle(d, n)} · спросил ${q.by}`} />
              ))}
            </List>
          ) : <Empty>Вопросов прорабам нет.</Empty>}
        </Card>
      </div>
    </Page>
  );
}

/* ----------------------------------------------------------------- queue */
type Filter = 'all' | NeedState;
type Grouping = 'date' | 'object' | 'urgency';
interface Bucket { key: string; title: string; rows: Need[] }

/** Grouping is a sort order plus headings: the same needs, cut by date, by object or by how soon they are wanted. */
function buckets(d: Data, needs: Need[], by: Grouping): Bucket[] {
  const out: Bucket[] = [];
  const put = (key: string, title: string, n: Need) => {
    let b = out.find((x) => x.key === key);
    if (!b) { b = { key, title, rows: [] }; out.push(b); }
    b.rows.push(n);
  };
  const newest = (a: Need, b: Need) => b.date.localeCompare(a.date) || b.num - a.num;
  if (by === 'date') {
    for (const n of [...needs].sort(newest)) {
      if (n.date >= d.today) put('today', 'Сегодня', n);
      else if (n.date >= addDays(d.today, -7)) put('week', 'За последние 7 дней', n);
      else put('old', 'Раньше', n);
    }
  }
  if (by === 'object') {
    for (const o of d.objects) for (const n of needs.filter((x) => x.objectId === o.id).sort(newest)) put(o.id, o.name, n);
  }
  if (by === 'urgency') {
    const soon = addDays(d.today, 2);
    const rank = (n: Need) => (needState(n) === 'done' ? 3 : n.urgent ? 0 : (nearestWant(n) ?? '9') <= soon ? 1 : 2);
    const titles = ['Срочные', `Нужно до ${dShort(soon)}`, 'Позже', 'Обеспечены'];
    const sorted = [...needs].sort((a, b) => rank(a) - rank(b) || (nearestWant(a) ?? a.date).localeCompare(nearestWant(b) ?? b.date));
    for (const n of sorted) put(String(rank(n)), titles[rank(n)], n);
  }
  return out;
}

function Queue() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  const [filter, setFilter] = useState<Filter>('all');
  const [by, setBy] = useState<Grouping>('date');
  const cnt = (s: NeedState) => d.needs.filter((n) => needState(n) === s).length;
  const shown = filter === 'all' ? d.needs : d.needs.filter((n) => needState(n) === filter);
  const groups = buckets(d, shown, by);
  const open = d.needs.length - cnt('done');

  const urgent = (n: Need): ReactNode => (n.urgent && needState(n) !== 'done' ? <Pill tone="negative">Срочно</Pill> : null);
  const state = (n: Need): ReactNode => { const s = needState(n); return <Pill tone={NEED_TONE[s]}>{NEED_LABEL[s]}</Pill>; };
  const cols: Col<Need>[] = wide ? [
    { head: 'Потребность', cell: (n) => <Two a={<>№ {n.num}{urgent(n) && <span style={{ marginLeft: 8 }}>{urgent(n)}</span>}</>} b={objectName(d, n.objectId)} /> },
    { head: 'Дата', width: '120px', cell: (n) => dRel(n.date, d.today) },
    { head: 'Позиции', num: true, width: '100px', cell: (n) => n.lines.length },
    { head: 'Состояние', width: '180px', cell: state },
    { head: 'Обеспечено', num: true, width: '120px', cell: (n) => pct(needProgress(n)) },
  ] : [
    { head: 'Потребность', phone: 'title', cell: (n) => needTitle(d, n) },
    { head: 'Дата', phone: 'sub', cell: (n) => <>{urgent(n)}{urgent(n) && ' '}{dRel(n.date, d.today)}</> },
    { head: 'Позиции', phone: 'sub', cell: (n) => count(n.lines.length, 'позиция', 'позиции', 'позиций') },
    { head: 'Обеспечено', phone: 'sub', cell: (n) => `обеспечено ${pct(needProgress(n))}` },
    { head: 'Состояние', phone: 'value', cell: state },
  ];

  return (
    <Page
      title="Очередь потребностей"
      sub={open
        ? `В очереди ${count(open, 'потребность', 'потребности', 'потребностей')}: ${count(cnt('new'), 'новая', 'новые', 'новых')}, ${count(cnt('clarify'), 'ждёт', 'ждут', 'ждут')} ответа прораба.`
        : 'Все потребности обеспечены.'}
    >
      <Chips value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'Все', count: d.needs.length },
        { value: 'new', label: 'Новые', count: cnt('new') },
        { value: 'work', label: 'В работе', count: cnt('work') },
        { value: 'clarify', label: 'Ждут уточнения', count: cnt('clarify') },
        { value: 'done', label: 'Обеспечены', count: cnt('done') },
      ]} />
      <div className="toolbar">
        <Seg wide={!wide} value={by} onChange={setBy} options={[
          { value: 'date', label: wide ? 'По дате' : 'Дата' },
          { value: 'object', label: wide ? 'По объекту' : 'Объект' },
          { value: 'urgency', label: wide ? 'По срочности' : 'Срочность' },
        ]} />
      </div>
      {groups.length === 0 && <Card title="Потребности"><Empty>Потребностей в этом состоянии сейчас нет.</Empty></Card>}
      {groups.map((g) => (
        <Card key={g.key} title={g.title} note={count(g.rows.length, 'потребность', 'потребности', 'потребностей')} flush>
          <DataTable cols={cols} rows={g.rows} keyOf={(n) => n.id} onRow={(n) => nav(`/manager/needs/${n.id}`)} />
        </Card>
      ))}
    </Page>
  );
}

export const routes: { path: string; element: ReactNode }[] = [
  { path: '/manager', element: <Home /> },
  { path: '/manager/needs', element: <Queue /> },
  { path: '/manager/needs/:id', element: <NeedPage /> },
  { path: '/manager/stock', element: <Stock /> },
  { path: '/manager/orders', element: <Orders /> },
  { path: '/manager/supply', element: <Supply /> },
  { path: '/manager/handoff', element: <Handoff /> },
  { path: '/manager/analytics', element: <Analytics /> },
];
