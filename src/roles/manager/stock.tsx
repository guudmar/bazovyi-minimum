// The trade warehouse and the orders that refill it.
import { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { act, useData } from '../../data/store';
import { byId, lineStats, material, stockView, type StockView } from '../../data/select';
import { Btn, Card, Chips, DataTable, Field, Page, Pill, Row, Sheet, Stats, Tabs, Two, toast, useWide, type Col } from '../../ui/kit';
import { addDays, count, dFull, dRel, dShort, qty } from '../../lib/format';
import type { Material, TradeOrder } from '../../data/types';
import { allLines, dash, deficits, n1, needTitle } from './lib';

/* ----------------------------------------------------------------- stock */
interface StockRow { m: Material; v: StockView; lack: number }

export function MaterialSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const d = useData();
  const m = byId(d.materials, id);
  if (!m) return null;
  const v = stockView(d, m.id);
  const lines = allLines(d).filter((r) => r.mat.id === m.id);
  const holds = lines.flatMap((r) => r.line.parts.filter((p) => p.status === 'reserved').map((part) => ({ ...r, part })));
  const orders = d.tradeOrders.filter((o) => o.materialId === m.id && o.status !== 'arrived').sort((a, b) => a.eta.localeCompare(b.eta));
  const wants = lines.filter((r) => lineStats(r.line).open > 0);
  return (
    <Sheet open title={m.name} onClose={onClose}>
      <div className="stack">
        <p className="muted">{m.group} · {v.place === '—' ? 'на складе не хранится' : v.place}</p>
        <Stats items={[
          { label: 'Доступно', value: qty(v.available, m.unit), lead: true, zero: !v.available },
          { label: 'Всего', value: n1(v.total), zero: !v.total },
          { label: 'В резерве', value: n1(v.reserved), zero: !v.reserved },
          { label: 'Ожидается', value: n1(v.expected), zero: !v.expected },
        ]} />

        <div className="section-title">Резерв держат</div>
        {holds.length ? (
          <div className="list" style={{ margin: '0 -16px' }}>
            {holds.map((h) => (
              <Row key={h.part.id} to={`/manager/needs/${h.need.id}`} title={needTitle(d, h.need)}
                sub={`нужно к ${dShort(h.line.wantDate)}`} value={qty(h.part.qty, m.unit)} />
            ))}
          </div>
        ) : <p className="muted">Под потребности ничего не зарезервировано.</p>}

        <div className="section-title">Открытые заказы</div>
        {orders.length ? (
          <div className="list" style={{ margin: '0 -16px' }}>
            {orders.map((o) => (
              <Row key={o.id} to="/manager/orders" title={`Заказ № ${o.num} · ${o.supplier}`}
                sub={<>ждём <span className={o.eta < d.today ? 'neg' : ''}>{dShort(o.eta)}</span>{o.needId ? ` · для № ${byId(d.needs, o.needId)?.num ?? '—'}` : ' · на склад'}</>}
                value={qty(o.qty, m.unit)} meta={o.status === 'delayed' ? <Pill tone="negative">Задержка</Pill> : undefined} />
            ))}
          </div>
        ) : <p className="muted">Открытых заказов по этому материалу нет.</p>}

        {wants.length > 0 && (
          <>
            <div className="section-title">Ждут распределения</div>
            <div className="list" style={{ margin: '0 -16px' }}>
              {wants.map((r) => (
                <Row key={r.line.id} to={`/manager/needs/${r.need.id}`} title={needTitle(d, r.need)}
                  sub={`нужно к ${dShort(r.line.wantDate)}`} value={qty(lineStats(r.line).open, m.unit)} />
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function Stock() {
  const d = useData();
  const wide = useWide();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const short = deficits(d);
  const all: StockRow[] = d.materials.map((m) => {
    const lack = short.find((x) => x.mat.id === m.id);
    return { m, v: stockView(d, m.id), lack: lack ? lack.demand - lack.available : 0 };
  });
  const groups = [...new Set(d.materials.map((m) => m.group))].sort((a, b) => a.localeCompare(b, 'ru'));
  const s = q.trim().toLowerCase();
  const rows = all
    .filter((r) => (group === 'all' || r.m.group === group)
      && (!s || r.m.name.toLowerCase().includes(s) || r.m.group.toLowerCase().includes(s) || r.v.place.toLowerCase().includes(s)))
    .sort((a, b) => a.m.name.localeCompare(b.m.name, 'ru'));
  const out = all.filter((r) => r.v.available === 0).length;

  const lackNote = (r: StockRow) => (r.lack > 0 ? <span className="neg">не хватает {qty(r.lack, r.m.unit)}</span> : null);
  const cols: Col<StockRow>[] = wide ? [
    { head: 'Наименование', cell: (r) => <Two a={r.m.name} b={<>{r.m.group}{r.lack > 0 && <> · {lackNote(r)}</>}</>} /> },
    { head: 'Ед.', cell: (r) => r.m.unit },
    { head: 'Всего', num: true, cell: (r) => n1(r.v.total) },
    { head: 'Резерв', num: true, cell: (r) => n1(r.v.reserved) },
    { head: 'Доступно', num: true, cell: (r) => <b style={{ fontWeight: 600 }}>{n1(r.v.available)}</b> },
    { head: 'Ожидается', num: true, cell: (r) => n1(r.v.expected) },
    { head: 'Место хранения', cell: (r) => (r.v.place === '—' ? dash : r.v.place) },
  ] : [
    { head: 'Наименование', phone: 'title', cell: (r) => r.m.name },
    { head: 'Остатки', phone: 'sub', cell: (r) => <>{r.lack > 0 && <>{lackNote(r)} · </>}всего {n1(r.v.total)} · резерв {n1(r.v.reserved)} · ожидается {n1(r.v.expected)}</> },
    { head: 'Место хранения', phone: 'sub', cell: (r) => (r.v.place === '—' ? 'на складе не хранится' : r.v.place) },
    { head: 'Доступно', phone: 'value', num: true, cell: (r) => qty(r.v.available, r.m.unit) },
    { head: 'Подпись', phone: 'meta', cell: () => 'доступно' },
  ];

  return (
    <Page
      title="Складские остатки"
      sub={short.length
        ? `Доступного остатка не хватает на потребности объектов по ${count(short.length, 'материалу', 'материалам', 'материалам')}.`
        : out ? `${count(out, 'наименование закончилось', 'наименования закончились', 'наименований закончилось')}, нераспределённых потребностей на них нет.`
          : 'Доступного остатка хватает на все нераспределённые потребности.'}
    >
      <div style={{ position: 'relative' }}>
        <SearchIcon size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input" style={{ paddingLeft: 38 }} type="search" placeholder="Материал, группа или место хранения" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Поиск по складу" />
      </div>
      <Chips value={group} onChange={setGroup} options={[{ value: 'all', label: 'Все группы' }, ...groups.map((g) => ({ value: g, label: g }))]} />
      <Card title="Остатки" note={count(rows.length, 'наименование', 'наименования', 'наименований')} flush>
        <DataTable cols={cols} rows={rows} keyOf={(r) => r.m.id} onRow={(r) => setOpenId(r.m.id)} empty="По этому запросу материалов нет." />
      </Card>
      <MaterialSheet id={openId} onClose={() => setOpenId(null)} />
    </Page>
  );
}

/* ---------------------------------------------------------------- orders */
export function OrderSheet({ order: o, onClose }: { order: TradeOrder; onClose: () => void }) {
  const d = useData();
  const m = material(d, o.materialId);
  const need = byId(d.needs, o.needId);
  const [eta, setEta] = useState(o.eta < d.today ? addDays(d.today, 2) : o.eta);
  const open = o.status !== 'arrived';
  const arrived = () => {
    act.tradeOrderArrived(o.id);
    toast(need ? `Заказ № ${o.num} поступил и зарезервирован под потребность № ${need.num}` : `Заказ № ${o.num} поступил на склад`);
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
        <div style={{ fontWeight: 600, fontSize: 16 }}>{m.name}</div>
        <dl className="kv left">
          <dt>Количество</dt><dd>{qty(o.qty, m.unit)}</dd>
          <dt>Поставщик</dt><dd>{o.supplier}</dd>
          <dt>Заказан</dt><dd>{dFull(o.date)}</dd>
          <dt>{open ? 'Ждём' : 'Срок был'}</dt>
          <dd><span className={open && o.eta < d.today ? 'neg' : ''}>{dFull(o.eta)}</span>{o.status === 'delayed' && <> <Pill tone="negative">Задержка</Pill></>}</dd>
          <dt>Для кого</dt><dd>{need ? `потребность ${needTitle(d, need)}` : 'на склад, без привязки к потребности'}</dd>
          <dt>Состояние</dt><dd>{open ? 'В пути на склад' : 'Поступил на склад'}</dd>
        </dl>
        {open && (
          <Field label="Новый срок поставки" help={need ? 'Срок части в потребности изменится вместе со сроком заказа.' : undefined}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} type="date" min={d.today} value={eta} onChange={(e) => setEta(e.target.value)} />
              <Btn style={{ height: 'auto' }} disabled={!eta || (eta === o.eta && o.status === 'ordered')} onClick={move}>Перенести срок</Btn>
            </div>
          </Field>
        )}
      </div>
    </Sheet>
  );
}

export function Orders() {
  const d = useData();
  const wide = useWide();
  const [tab, setTab] = useState<'open' | 'arrived'>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const open = d.tradeOrders.filter((o) => o.status !== 'arrived').sort((a, b) => a.eta.localeCompare(b.eta));
  const arrived = d.tradeOrders.filter((o) => o.status === 'arrived').sort((a, b) => b.eta.localeCompare(a.eta));
  const delayed = open.filter((o) => o.status === 'delayed');
  const rows = tab === 'open' ? open : arrived;
  const order = byId(d.tradeOrders, openId);

  const whom = (o: TradeOrder) => { const n = byId(d.needs, o.needId); return n ? needTitle(d, n) : 'на склад'; };
  const late = (o: TradeOrder) => o.status !== 'arrived' && o.eta < d.today;
  const cols: Col<TradeOrder>[] = wide ? [
    { head: 'Заказ', cell: (o) => <Two a={material(d, o.materialId).name} b={`№ ${o.num}`} /> },
    { head: 'Количество', num: true, cell: (o) => qty(o.qty, material(d, o.materialId).unit) },
    { head: 'Поставщик', cell: (o) => o.supplier },
    { head: 'Заказан', cell: (o) => dShort(o.date) },
    { head: tab === 'open' ? 'Ждём' : 'Срок был', cell: (o) => (
      <span className="nowrap"><span className={late(o) ? 'neg' : ''}>{dShort(o.eta)}</span>{o.status === 'delayed' && <> <Pill tone="negative">Задержка</Pill></>}</span>
    ) },
    { head: 'Для кого', cell: whom },
  ] : [
    { head: 'Заказ', phone: 'title', cell: (o) => material(d, o.materialId).name },
    { head: 'Номер и поставщик', phone: 'sub', cell: (o) => `№ ${o.num} · ${o.supplier}` },
    { head: 'Срок', phone: 'sub', cell: (o) => <span className={late(o) ? 'neg' : ''}>{tab === 'open' ? 'ждём' : 'срок был'} {dShort(o.eta)}</span> },
    { head: 'Для кого', phone: 'sub', cell: (o) => (o.needId ? `для ${whom(o)}` : 'на склад') },
    { head: 'Количество', phone: 'value', num: true, cell: (o) => qty(o.qty, material(d, o.materialId).unit) },
    { head: 'Задержка', phone: 'meta', cell: (o) => (o.status === 'delayed' ? <Pill tone="negative">Задержка</Pill> : null) },
  ];

  return (
    <Page
      title="Заказы и поставки"
      sub={delayed.length === 1
        ? `Заказ № ${delayed[0].num} задерживается: поставщик «${delayed[0].supplier}», срок по заказу ${dShort(delayed[0].eta)}.`
        : delayed.length
          ? `${count(delayed.length, 'заказ задерживается', 'заказа задерживаются', 'заказов задерживаются')}, самый ранний срок по ним ${dShort(delayed[0].eta)}.`
          : open.length
            ? `В пути ${count(open.length, 'заказ', 'заказа', 'заказов')}, ближайший ждём ${dRel(open[0].eta, d.today).toLowerCase()}.`
            : 'Все заказы поступили на склад.'}
    >
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'В пути', count: open.length }, { value: 'arrived', label: 'Поступили', count: arrived.length }]} />
      <Card title={tab === 'open' ? 'Ждём на складе' : 'Поступили на склад'} flush>
        <DataTable cols={cols} rows={rows} keyOf={(o) => o.id} onRow={(o) => setOpenId(o.id)}
          empty={tab === 'open' ? 'Открытых заказов на склад нет.' : 'Поступивших заказов пока нет.'} />
      </Card>
      {order && <OrderSheet key={order.id} order={order} onClose={() => setOpenId(null)} />}
    </Page>
  );
}
