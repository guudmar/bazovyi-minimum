// The supplier's workspace: buys what the trade direction cannot give. Every purchase keeps its link to the need it came from.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { act, useData, useUser } from '../../data/store';
import { byId, material, objectName, PURCHASE_LABEL, PURCHASE_TONE, REQUEST_LABEL, REQUEST_TONE } from '../../data/select';
import { Btn, Card, Chips, DataTable, Empty, List, More, Page, Pill, Row, Stats, Two, toast, useWide, type Col } from '../../ui/kit';
import { NoteSheet, RequestCard } from '../../shared/money';
import { count, dRel, dShort, daysBetween, money, qty } from '../../lib/format';
import type { Delivery, Material, MoneyRequest, Purchase } from '../../data/types';
import { NameCell, atRisk, cost, dash, n1, rub, sumCost, wantLate } from './lib';
import { PurchasePage } from './purchase';

type Status = Purchase['status'];
const STATUSES: Status[] = ['new', 'sourcing', 'ordered', 'shipped', 'received'];

/** Purchases that still need work come first, the nearest wanted date on top; closed ones go to the end. */
const byWant = (a: Purchase, b: Purchase): number =>
  Number(a.status === 'received') - Number(b.status === 'received') || a.wantDate.localeCompare(b.wantDate);
const sumOf = (list: MoneyRequest[]): number => list.reduce((s, r) => s + r.amount, 0);

/* ------------------------------------------------------------------ home */
function Home() {
  const d = useData();
  const u = useUser();
  const of = (s: Status) => d.purchases.filter((p) => p.status === s);
  const todo = [...of('new'), ...of('sourcing')].sort(byWant);
  const coming = [...of('ordered'), ...of('shipped')].sort((a, b) => (a.eta ?? '9').localeCompare(b.eta ?? '9'));
  const risk = todo.filter((p) => atRisk(d, p));
  const mine = d.requests.filter((r) => r.authorId === u.id).sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num);

  let sub = 'Закупок в работе нет.';
  const top = risk[0];
  if (top) {
    const m = material(d, top.materialId);
    const n = daysBetween(d.today, top.wantDate);
    const what = `${m.name}, ${qty(top.qty, m.unit)}`;
    sub = n < 0
      ? `Срок закупки № ${top.num} прошёл ${dShort(top.wantDate)}, а заказ поставщику ещё не размещён: ${what}.`
      : `Закупка № ${top.num} нужна на объекте ${n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${count(n, 'день', 'дня', 'дней')}`}, а заказ поставщику ещё не размещён: ${what}.`;
  } else if (of('new').length) {
    sub = `${count(of('new').length, 'новая закупка ещё не взята', 'новые закупки ещё не взяты', 'новых закупок ещё не взято')} в работу.`;
  } else if (todo.length) {
    sub = `${count(todo.length, 'закупка ждёт', 'закупки ждут', 'закупок ждут')} выбора поставщика и заказа, ближайший срок ${dShort(todo[0].wantDate)}.`;
  } else if (coming.length) {
    const next = coming[0];
    sub = `Ближайшая поставка: ${next.supplier ?? 'поставщик не указан'}, ${next.eta ? `ждём ${dRel(next.eta, d.today).toLowerCase()}` : 'срок не назван'}.`;
  }

  return (
    <Page title="Закупки" sub={sub}>
      <Stats items={[
        { label: 'Срок под угрозой', value: <span className={risk.length ? 'neg' : ''}>{risk.length}</span>, lead: true, zero: !risk.length, hint: 'нужно в ближайшие два дня, заказ не размещён' },
        { label: 'Новые', value: of('new').length, zero: !of('new').length },
        { label: 'Подбор поставщика', value: of('sourcing').length, zero: !of('sourcing').length },
        { label: 'Заказано', value: of('ordered').length, zero: !of('ordered').length },
        { label: 'В пути', value: of('shipped').length, zero: !of('shipped').length },
      ]} />

      <div className="grid cols-2">
        <Card title="Требуют действий" action={<More to="/supplier/queue">Вся очередь</More>} flush>
          {todo.length ? (
            <List>
              {todo.map((p) => {
                const m = material(d, p.materialId);
                return (
                  <Row key={p.id} to={`/supplier/purchase/${p.id}`} title={m.name}
                    sub={<>№ {p.num} · {objectName(d, p.objectId)} · нужно к <span className={wantLate(d, p) ? 'neg' : ''}>{dShort(p.wantDate)}</span></>}
                    value={qty(p.qty, m.unit)} meta={<Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>} />
                );
              })}
            </List>
          ) : <Empty>Новых закупок и закупок без поставщика нет.</Empty>}
        </Card>
        <Card title="Ожидаемые поставки" action={<More to="/supplier/deliveries">Все поставки</More>} flush>
          {coming.length ? (
            <List>
              {coming.map((p) => (
                <Row key={p.id} to={`/supplier/purchase/${p.id}`} title={material(d, p.materialId).name}
                  sub={`${p.supplier ?? 'Поставщик не указан'} · ${objectName(d, p.objectId)}`}
                  value={p.eta ? <span className={p.eta < d.today ? 'neg' : ''}>{dRel(p.eta, d.today)}</span> : dash}
                  meta={<Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>} />
              ))}
            </List>
          ) : <Empty>Размещённых заказов сейчас нет.</Empty>}
        </Card>
      </div>

      <Card title="Заявки на оплату" action={<More to="/supplier/money">Финансовая потребность</More>} flush>
        {mine.length ? (
          <List>
            {mine.map((r) => (
              <Row key={r.id} to="/supplier/money" title={r.basis} sub={`№ ${r.num} от ${dShort(r.date)} · оплатить до ${dShort(r.due)}`}
                value={money(r.amount)} money meta={<Pill tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Pill>} />
            ))}
          </List>
        ) : <Empty>Заявок на оплату пока нет. Запросить оплату можно из карточки закупки.</Empty>}
      </Card>
    </Page>
  );
}

/* ----------------------------------------------------------------- queue */
function Queue() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  const [filter, setFilter] = useState<'all' | Status>('all');
  const cnt = (s: Status) => d.purchases.filter((p) => p.status === s).length;
  const rows = d.purchases.filter((p) => filter === 'all' || p.status === filter).sort(byWant);
  const open = cnt('new') + cnt('sourcing');
  const risk = d.purchases.filter((p) => atRisk(d, p)).length;

  const mat = (p: Purchase): Material => material(d, p.materialId);
  const status = (p: Purchase): ReactNode => <Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>;
  const high = (p: Purchase): ReactNode => (p.priority === 'high' ? <Pill tone="negative">Высокий</Pill> : null);
  const cols: Col<Purchase>[] = wide ? [
    { head: 'Закупка', cell: (p) => <Two a={`№ ${p.num} · ${mat(p).name}`} b={objectName(d, p.objectId)} /> },
    { head: 'Количество', num: true, cell: (p) => qty(p.qty, mat(p).unit) },
    { head: 'Нужно к', cell: (p) => <span className={wantLate(d, p) ? 'neg' : ''}>{dShort(p.wantDate)}</span> },
    { head: 'Причина', cell: (p) => p.reason },
    { head: 'Приоритет', cell: (p) => high(p) ?? <span className="muted">Обычный</span> },
    { head: 'Статус', cell: status },
  ] : [
    { head: 'Закупка', phone: 'title', cell: (p) => mat(p).name },
    { head: 'Номер и объект', phone: 'sub', cell: (p) => <>{high(p)}{high(p) && ' '}№ {p.num} · {objectName(d, p.objectId)}</> },
    { head: 'Нужно к', phone: 'sub', cell: (p) => <span className={wantLate(d, p) ? 'neg' : ''}>к {dShort(p.wantDate)}</span> },
    { head: 'Причина', phone: 'sub', cell: (p) => p.reason },
    { head: 'Количество', phone: 'value', num: true, cell: (p) => qty(p.qty, mat(p).unit) },
    { head: 'Статус', phone: 'meta', cell: status },
  ];

  return (
    <Page
      title="Очередь закупок"
      sub={open
        ? `${count(open, 'закупка ждёт', 'закупки ждут', 'закупок ждут')} заказа поставщику${risk ? (open === 1 ? ', срок под угрозой' : `, у ${risk} из них срок под угрозой`) : ''}.`
        : 'Все закупки размещены у поставщиков или получены.'}
    >
      <Chips value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'Все', count: d.purchases.length },
        ...STATUSES.map((s) => ({ value: s, label: s === 'new' ? 'Новые' : PURCHASE_LABEL[s], count: cnt(s) })),
      ]} />
      <Card title="Закупки" note={count(rows.length, 'закупка', 'закупки', 'закупок')} flush>
        <DataTable cols={cols} rows={rows} keyOf={(p) => p.id} onRow={(p) => nav(`/supplier/purchase/${p.id}`)} empty="Закупок в этом статусе нет." />
      </Card>
    </Page>
  );
}

/* ---------------------------------------------------------------- orders */
function Orders() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  const rows = d.purchases
    .filter((p) => p.status === 'ordered' || p.status === 'shipped' || p.status === 'received')
    .sort((a, b) => Number(a.status === 'received') - Number(b.status === 'received') || (a.eta ?? '9').localeCompare(b.eta ?? '9'));
  const active = rows.filter((p) => p.status !== 'received');
  const late = active.filter((p) => p.eta && p.eta < d.today).length;

  const mat = (p: Purchase): Material => material(d, p.materialId);
  const etaLate = (p: Purchase) => p.status !== 'received' && !!p.eta && p.eta < d.today;
  const price = (p: Purchase): ReactNode => { const c = cost(p); return c === undefined ? dash : money(c); };
  const status = (p: Purchase): ReactNode => <Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>;
  const cols: Col<Purchase>[] = wide ? [
    { head: 'Поставщик', cell: (p) => p.supplier ?? dash },
    { head: 'Позиция', cell: (p) => <Two a={mat(p).name} b={qty(p.qty, mat(p).unit)} /> },
    { head: 'Стоимость', num: true, cell: price },
    { head: 'Заказан', cell: (p) => (p.orderDate ? dShort(p.orderDate) : dash) },
    { head: 'Срок', cell: (p) => (p.eta ? <span className={etaLate(p) ? 'neg' : ''}>{dShort(p.eta)}</span> : dash) },
    { head: 'Объект', cell: (p) => objectName(d, p.objectId) },
    { head: 'Статус', cell: status },
  ] : [
    { head: 'Поставщик', phone: 'title', cell: (p) => p.supplier ?? 'Поставщик не указан' },
    { head: 'Позиция', phone: 'sub', cell: (p) => `${mat(p).name}, ${qty(p.qty, mat(p).unit)}` },
    { head: 'Срок', phone: 'sub', cell: (p) => (p.eta ? <span className={etaLate(p) ? 'neg' : ''}>срок {dShort(p.eta)}</span> : 'срок не назван') },
    { head: 'Объект', phone: 'sub', cell: (p) => objectName(d, p.objectId) },
    { head: 'Стоимость', phone: 'value', num: true, cell: price },
    { head: 'Статус', phone: 'meta', cell: status },
  ];

  return (
    <Page
      title="Заказы поставщикам"
      sub={active.length
        ? `У поставщиков ${count(active.length, 'открытый заказ', 'открытых заказа', 'открытых заказов')} на ${money(sumCost(active))}${
          late ? `, по ${late} из них срок поставки прошёл` : ', сроки поставки не нарушены'}.`
        : 'Открытых заказов у поставщиков нет.'}
    >
      <Card title="Заказы" note={count(rows.length, 'заказ', 'заказа', 'заказов')} flush>
        <DataTable cols={cols} rows={rows} keyOf={(p) => p.id} onRow={(p) => nav(`/supplier/purchase/${p.id}`)}
          empty="Заказов поставщикам пока не размещали." foot={['Итого', '', money(sumCost(rows)), '', '', '', '']} />
      </Card>
    </Page>
  );
}

/* ----------------------------------------------------------------- money */
function MoneyPage() {
  const d = useData();
  const u = useUser();
  const [answer, setAnswer] = useState<MoneyRequest | null>(null);
  const mine = d.requests.filter((r) => r.authorId === u.id).sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num);
  const clarify = mine.filter((r) => r.status === 'clarify');
  const waiting = mine.filter((r) => r.status === 'pending' || r.status === 'clarify');
  const approved = mine.filter((r) => r.status === 'approved' || r.status === 'noted');
  const paid = mine.filter((r) => r.status === 'paid');

  return (
    <Page
      title="Финансовая потребность"
      sub={clarify.length
        ? `По ${count(clarify.length, 'заявке', 'заявкам', 'заявкам')} на ${money(sumOf(clarify))} от вас ждут уточнения.`
        : waiting.length
          ? `${count(waiting.length, 'заявка ждёт', 'заявки ждут', 'заявок ждут')} согласования на ${money(sumOf(waiting))}${approved.length ? `, ещё ${money(sumOf(approved))} согласовано и ждёт оплаты` : ''}.`
          : approved.length ? `Согласовано и ждёт оплаты ${money(sumOf(approved))}.` : 'Открытых заявок на оплату нет.'}
    >
      <Stats items={[
        { label: 'Запрошено и ещё не оплачено', value: money(sumOf(waiting) + sumOf(approved)), lead: true, hint: count(waiting.length + approved.length, 'заявка', 'заявки', 'заявок') },
        { label: 'На согласовании', value: money(sumOf(waiting)), zero: !waiting.length },
        { label: 'Согласовано, ждёт оплаты', value: money(sumOf(approved)), zero: !approved.length },
        { label: 'Оплачено', value: money(sumOf(paid)), zero: !paid.length },
      ]} />
      {mine.length === 0 && <Card title="Заявки на оплату"><Empty>Заявок пока нет. Запросить оплату можно из карточки закупки.</Empty></Card>}
      <div className="grid cols-2">
        {mine.map((r) => {
          const pu = byId(d.purchases, r.purchaseId);
          return (
            <RequestCard key={r.id} r={r}>
              {pu && (
                <div>
                  <More to={`/supplier/purchase/${pu.id}`}>Закупка № {pu.num}: {PURCHASE_LABEL[pu.status].toLowerCase()}</More>
                </div>
              )}
              {r.status === 'clarify' && <Btn block onClick={() => setAnswer(r)}>Ответить</Btn>}
            </RequestCard>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 13, maxWidth: '76ch' }}>
        Заявка привязана к закупке, но сама по себе не означает оплату: деньги уходят, когда экономист проведёт платёж.
      </p>
      <NoteSheet open={!!answer} title={answer ? `Ответ по заявке № ${answer.num}` : ''} label="Что ответить" action="Отправить" required
        onClose={() => setAnswer(null)}
        onSubmit={(text) => {
          if (answer) { act.answerRequest(answer.id, text); toast(`Ответ отправлен, заявка № ${answer.num} снова на согласовании`); }
          setAnswer(null);
        }} />
    </Page>
  );
}

/* ------------------------------------------------------------ deliveries */
const DELIVERY: Record<Delivery['status'], { label: string; tone: 'hue' | 'positive' | 'negative'; rank: number }> = {
  expected: { label: 'В пути', tone: 'hue', rank: 0 },
  problem: { label: 'Расхождение', tone: 'negative', rank: 1 },
  received: { label: 'Получено', tone: 'positive', rank: 2 },
};

function Deliveries() {
  const d = useData();
  const wide = useWide();
  // a delivery belongs here when at least one of its lines carries a part that a purchase was made for
  const bought = new Set(d.purchases.map((p) => p.partId));
  const rows = d.deliveries
    .filter((dl) => dl.lines.some((l) => l.partId && bought.has(l.partId)))
    .sort((a, b) => DELIVERY[a.status].rank - DELIVERY[b.status].rank
      || (a.status === 'expected' ? a.eta.localeCompare(b.eta) : (b.receivedAt ?? b.eta).localeCompare(a.receivedAt ?? a.eta)));
  const expected = rows.filter((x) => x.status === 'expected');
  const problems = rows.filter((x) => x.status === 'problem');

  const state = (dl: Delivery): ReactNode => <Pill tone={DELIVERY[dl.status].tone}>{DELIVERY[dl.status].label}</Pill>;
  const when = (dl: Delivery): ReactNode => (dl.status === 'expected'
    ? <span className={dl.eta < d.today ? 'neg' : ''}>ждём {dRel(dl.eta, d.today).toLowerCase()}</span>
    : `получено ${dShort(dl.receivedAt ?? dl.eta)}`);
  const got = (l: Delivery['lines'][number]): ReactNode => {
    const m = material(d, l.materialId);
    return l.received === undefined ? dash : <span className={l.received < l.qty ? 'neg' : ''}>{qty(l.received, m.unit)}</span>;
  };
  const cols: Col<Delivery>[] = wide ? [
    { head: 'Поставка', cell: (dl) => <Two a={dl.source} b={`№ ${dl.num}`} /> },
    { head: 'Объект', cell: (dl) => objectName(d, dl.objectId) },
    { head: 'Позиции', cell: (dl) => dl.lines.map((l, i) => <div key={i}>{material(d, l.materialId).name}</div>) },
    { head: 'Заказано', num: true, cell: (dl) => dl.lines.map((l, i) => <div key={i}>{qty(l.qty, material(d, l.materialId).unit)}</div>) },
    { head: 'Получено', num: true, cell: (dl) => dl.lines.map((l, i) => <div key={i}>{got(l)}</div>) },
    { head: 'Ждём или получено', cell: when },
    { head: 'Состояние', cell: state },
  ] : [
    { head: 'Поставка', phone: 'title', cell: (dl) => dl.source },
    { head: 'Номер и объект', phone: 'sub', cell: (dl) => `№ ${dl.num} · ${objectName(d, dl.objectId)}` },
    { head: 'Позиции', phone: 'sub', cell: (dl) => dl.lines.map((l, i) => {
      const m = material(d, l.materialId);
      return (
        <span key={i}>
          {i > 0 && '; '}{m.name}: {l.received === undefined ? `заказано ${qty(l.qty, m.unit)}` : <>получено <span className={l.received < l.qty ? 'neg' : ''}>{n1(l.received)}</span> из {qty(l.qty, m.unit)}</>}
        </span>
      );
    }) },
    { head: 'Ждём или получено', phone: 'value', cell: when },
    { head: 'Состояние', phone: 'meta', cell: state },
  ];

  return (
    <Page
      title="Поставки"
      sub={problems.length
        ? `Прораб отметил расхождение по ${count(problems.length, 'поставке', 'поставкам', 'поставкам')}.`
        : expected.length
          ? `${count(expected.length, 'поставка', 'поставки', 'поставок')} в пути, ближайшую ждём ${dRel(expected[0].eta, d.today).toLowerCase()}; получение подтверждает прораб.`
          : rows.length ? 'Все поставки по закупкам получены на объектах.' : 'Поставок по закупкам пока не было.'}
    >
      <Card title="Поставки по закупкам" note={count(rows.length, 'поставка', 'поставки', 'поставок')} flush>
        <DataTable cols={cols} rows={rows} keyOf={(dl) => dl.id} empty="Поставка появится здесь, когда поставщик отгрузит заказ." />
      </Card>
    </Page>
  );
}

/* --------------------------------------------------------------- history */
function History() {
  const d = useData();
  const nav = useNavigate();
  const wide = useWide();
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const mat = (p: Purchase): Material => material(d, p.materialId);
  const rows = d.purchases
    .filter((p) => !s || [mat(p).name, p.supplier ?? '', objectName(d, p.objectId)].some((x) => x.toLowerCase().includes(s)))
    .sort((a, b) => b.num - a.num);
  const got = d.purchases.filter((p) => p.status === 'received').length;

  // a material bought at least twice gets its average price, weighted by quantity
  const priced = rows.filter((p) => p.price !== undefined);
  const avg = [...new Set(priced.map((p) => p.materialId))]
    .map((id) => {
      const list = priced.filter((p) => p.materialId === id);
      const prices = list.map((p) => p.price ?? 0);
      return {
        m: material(d, id), n: list.length, min: Math.min(...prices), max: Math.max(...prices),
        price: sumCost(list) / list.reduce((x, p) => x + p.qty, 0),
      };
    })
    .filter((x) => x.n >= 2)
    .sort((a, b) => a.m.name.localeCompare(b.m.name, 'ru'));

  const tag = (label: string) => (wide ? '' : `${label} `);
  const status = (p: Purchase): ReactNode => <Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>;
  const cols: Col<Purchase>[] = [
    { head: 'Материал', phone: 'title', cell: (p) => <NameCell a={mat(p).name} b={`№ ${p.num} · ${objectName(d, p.objectId)}`} /> },
    { head: 'Поставщик', phone: 'sub', cell: (p) => p.supplier ?? (wide ? dash : 'поставщик не выбран') },
    { head: 'Количество', num: true, phone: 'sub', cell: (p) => qty(p.qty, mat(p).unit) },
    { head: 'Цена', num: true, phone: 'sub', cell: (p) => (p.price === undefined ? (wide ? dash : 'цены нет') : `${tag('по')}${rub(p.price)}`) },
    { head: 'Сумма', num: true, phone: 'value', cell: (p) => { const c = cost(p); return c === undefined ? dash : money(c); } },
    { head: 'Заказан', phone: 'sub', cell: (p) => (p.orderDate ? `${tag('заказан')}${dShort(p.orderDate)}` : (wide ? dash : 'не заказан')) },
    { head: 'Срок', phone: 'sub', cell: (p) => (p.eta ? `${tag('срок')}${dShort(p.eta)}` : (wide ? dash : 'срок не назван')) },
    { head: 'Статус', phone: 'meta', cell: status },
  ];

  return (
    <Page
      title="История закупок"
      sub={d.purchases.length
        ? `Всего ${count(d.purchases.length, 'закупка', 'закупки', 'закупок')} на ${money(sumCost(d.purchases))} по известным ценам, получено на объектах: ${got}.`
        : 'Закупок пока не было.'}
    >
      <div style={{ position: 'relative' }}>
        <SearchIcon size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input" style={{ paddingLeft: 38 }} type="search" placeholder="Материал, поставщик или объект" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Поиск по закупкам" />
      </div>
      {avg.length > 0 && (
        <Card title="Средняя цена" note="материалы, купленные не меньше двух раз" flush>
          <List>
            {avg.map((x) => (
              <Row key={x.m.id} title={x.m.name}
                sub={`${count(x.n, 'закупка', 'закупки', 'закупок')} · от ${rub(x.min)} до ${rub(x.max)} · по справочнику ${rub(x.m.price)}`}
                value={rub(Math.round(x.price * 100) / 100)} meta={`за ${x.m.unit}`} />
            ))}
          </List>
        </Card>
      )}
      <Card title="Закупки" note={count(rows.length, 'закупка', 'закупки', 'закупок')} flush>
        <DataTable cols={cols} rows={rows} keyOf={(p) => p.id} onRow={(p) => nav(`/supplier/purchase/${p.id}`)}
          empty={s ? `По запросу «${q.trim()}» закупок нет.` : 'Закупок пока не было.'} />
      </Card>
    </Page>
  );
}

export const routes: { path: string; element: ReactNode }[] = [
  { path: '/supplier', element: <Home /> },
  { path: '/supplier/queue', element: <Queue /> },
  { path: '/supplier/purchase/:id', element: <PurchasePage /> },
  { path: '/supplier/orders', element: <Orders /> },
  { path: '/supplier/money', element: <MoneyPage /> },
  { path: '/supplier/deliveries', element: <Deliveries /> },
  { path: '/supplier/history', element: <History /> },
];
