// The trade warehouse. A material opens by its address (?open=<id>), so a link from a request lands on the exact position.
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useData } from '../../data/store';
import { byId, lineStats, stockView, type StockView } from '../../data/select';
import { Card, DataTable, Details, Page, Row, Sheet, Stats, Status, Two, useSticky, useWide, type Col } from '../../ui/kit';
import { count, dShort, qty } from '../../lib/format';
import type { Material } from '../../data/types';
import { allLines, dash, deficits, n1, needTitle, to } from './lib';

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
        <Stats items={[
          { label: 'Доступно', value: qty(v.available, m.unit), lead: true, zero: !v.available },
          { label: 'Отложено', value: n1(v.reserved), zero: !v.reserved },
          { label: 'Ожидается', value: n1(v.expected), zero: !v.expected },
        ]} />
        {wants.length > 0 && (
          <>
            <div className="section-title">Ждут этот материал</div>
            <div className="list" style={{ margin: '0 -16px' }}>
              {wants.map((r) => (
                <Row key={r.line.id} to={to.need(r.need.id)} title={needTitle(d, r.need)}
                  sub={`нужно к ${dShort(r.line.wantDate)}`} value={qty(lineStats(r.line).open, m.unit)} />
              ))}
            </div>
          </>
        )}
        <Details>
          <dl className="kv left">
            {m.code && <><dt>Код</dt><dd>{m.code}</dd></>}
            <dt>Группа</dt><dd>{m.group}</dd>
            {m.pack && <><dt>Упаковка</dt><dd>{m.pack}</dd></>}
            {m.k && m.useUnit && <><dt>Пересчёт</dt><dd>1 {m.unit} = {qty(m.k, m.useUnit)}</dd></>}
            <dt>Место</dt><dd>{v.place === '—' ? 'на складе не хранится' : v.place}</dd>
            <dt>Всего на складе</dt><dd>{qty(v.total, m.unit)}</dd>
          </dl>
          <div className="section-title">Отложено под заявки</div>
          {holds.length ? (
            <div className="list" style={{ margin: '0 -16px' }}>
              {holds.map((h) => (
                <Row key={h.part.id} to={to.need(h.need.id)} title={needTitle(d, h.need)} sub={`нужно к ${dShort(h.line.wantDate)}`} value={qty(h.part.qty, m.unit)} />
              ))}
            </div>
          ) : <p className="muted">Ничего не отложено.</p>}
          <div className="section-title">Заказы на склад</div>
          {orders.length ? (
            <div className="list" style={{ margin: '0 -16px' }}>
              {orders.map((o) => (
                <Row key={o.id} to={to.order(o.id)} title={`Заказ № ${o.num} · ${o.supplier}`}
                  sub={<>ждём <span className={o.eta < d.today ? 'neg' : ''}>{dShort(o.eta)}</span>{o.needId ? ` · для № ${byId(d.needs, o.needId)?.num ?? '—'}` : ' · на склад'}</>}
                  value={qty(o.qty, m.unit)} meta={o.status === 'delayed' ? <Status kind="problem">Задержка</Status> : undefined} />
              ))}
            </div>
          ) : <p className="muted">Открытых заказов нет.</p>}
        </Details>
      </div>
    </Sheet>
  );
}

export function Stock() {
  const d = useData();
  const wide = useWide();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useSticky('manager.stock.q', '');
  const openId = sp.get('open');
  const short = deficits(d);
  const s = q.trim().toLowerCase();
  const rows: StockRow[] = d.materials
    .map((m) => {
      const lack = short.find((x) => x.mat.id === m.id);
      return { m, v: stockView(d, m.id), lack: lack ? lack.demand - lack.available : 0 };
    })
    .filter((r) => !s || [r.m.name, r.m.group, r.v.place, r.m.code ?? '', r.m.family ?? ''].some((x) => x.toLowerCase().includes(s)))
    .sort((a, b) => a.m.name.localeCompare(b.m.name, 'ru'));

  const lackNote = (r: StockRow) => (r.lack > 0 ? <span className="neg">не хватает {qty(r.lack, r.m.unit)}</span> : null);
  const cols: Col<StockRow>[] = wide ? [
    { head: 'Материал', cell: (r) => <Two a={r.m.name} b={<>{r.m.code ? `${r.m.code} · ` : ''}{r.m.group}{r.lack > 0 && <> · {lackNote(r)}</>}</>} /> },
    { head: 'Доступно', num: true, cell: (r) => <b style={{ fontWeight: 600 }}>{qty(r.v.available, r.m.unit)}</b> },
    { head: 'Отложено', num: true, cell: (r) => n1(r.v.reserved) },
    { head: 'Ожидается', num: true, cell: (r) => n1(r.v.expected) },
    { head: 'Место', cell: (r) => (r.v.place === '—' ? dash : r.v.place) },
  ] : [
    { head: 'Материал', phone: 'title', cell: (r) => r.m.name },
    { head: 'Нехватка', phone: 'sub', cell: lackNote },
    { head: 'Доступно', phone: 'value', num: true, cell: (r) => qty(r.v.available, r.m.unit) },
    { head: 'Подпись', phone: 'meta', cell: () => 'доступно' },
  ];

  return (
    <Page title="Склад" sub={short.length ? `Не хватает на заявки: ${count(short.length, 'материал', 'материала', 'материалов')}` : undefined}>
      <div style={{ position: 'relative' }}>
        <SearchIcon size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input" style={{ paddingLeft: 38 }} type="search" placeholder="Материал, код, группа или место" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Поиск по складу" />
      </div>
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(r) => r.m.id} onRow={(r) => setSp({ open: r.m.id }, { replace: true })} empty="По этому запросу материалов нет." />
      </Card>
      <MaterialSheet id={openId} onClose={() => setSp({}, { replace: true })} />
    </Page>
  );
}
