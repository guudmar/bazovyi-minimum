// The economist and administrator: finance screens. These are the first priority of the product:
// the money registers, the single registry of operations, transfers on their way and the reconciliation, the planning of money.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { act, useData, useUser } from '../../data/store';
import {
  byArticle, byId, flowOps, forecast, objectView, onHand, registerBalance, registersIn, sumIn, sumOut, tasksFor, transitAge, transits, transitTotal,
  userName, weeklyFlows, needState, type Scope,
} from '../../data/select';
import {
  AmountInput, Btn, Card, Chips, DataTable, Empty, Field, List, Money, More, Page, Pill, Row, Seg, Sheet, Stats, Tabs, Two, toast, useSticky, useWide, type Col,
} from '../../ui/kit';
import { BarList, FlowChart, ForecastChart } from '../../ui/charts';
import { OpAmount, OpRow, OpSheet, OperationForm, opSub, opTitle } from '../../shared/money';
import { CalendarList } from '../owner';
import { addDays, count, dFull, dRel, dShort, daysBetween, money, pct } from '../../lib/format';
import type { Operation, Register } from '../../data/types';
import { restRoutes } from './rest';

/* ------------------------------------------------------------------ home */
function Home() {
  const d = useData();
  const u = useUser();
  const [form, setForm] = useState(false);
  const [op, setOp] = useState<Operation | null>(null);
  const tasks = tasksFor(d, u);
  const unmatched = d.operations.filter((o) => o.bank === 'unmatched');
  const toPay = d.requests.filter((r) => r.status === 'approved' || r.status === 'noted');
  const review = d.avrs.filter((a) => a.status === 'review');
  const fresh = d.needs.filter((n) => needState(n) === 'new');
  const last = [...d.operations].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5);
  const urgent = tasks.filter((t) => t.tone === 'negative');
  return (
    <Page title="Центр управления"
      sub={tasks.length
        ? `${count(tasks.length, 'процесс ждёт', 'процесса ждут', 'процессов ждут')} вашего участия${urgent.length ? `, из них ${count(urgent.length, 'срочный', 'срочных', 'срочных')}` : ''}.`
        : 'Все процессы идут без вашего участия.'}
      actions={<Btn kind="primary" onClick={() => setForm(true)}><Plus size={18} /> Новая операция</Btn>}>
      <Stats items={[
        { label: 'Деньги группы', value: money(onHand(d) + transitTotal(d)), lead: true, hint: `на счетах и в кассах ${money(onHand(d))} · в пути ${money(transitTotal(d))}` },
        { label: 'Не сопоставлено с банком', value: unmatched.length, zero: !unmatched.length, hint: unmatched.length ? `на ${money(unmatched.reduce((s, o) => s + o.amount, 0))}` : undefined },
        { label: 'Заявки к оплате', value: toPay.length, zero: !toPay.length, hint: toPay.length ? `на ${money(toPay.reduce((s, r) => s + r.amount, 0))}` : undefined },
        { label: 'АВР на проверке', value: review.length, zero: !review.length },
        { label: 'Новые потребности', value: fresh.length, zero: !fresh.length },
      ]} />
      <div className="grid cols-2">
        <Card title="Где нужно ваше участие" action={<More to="/tasks">Все задачи</More>} flush>
          {tasks.length ? (
            <List>{tasks.slice(0, 6).map((t) => <Row key={t.id + t.title} to={t.to} wrap title={t.title} sub={t.sub} side={t.tone === 'negative' ? <Pill tone="negative">Срочно</Pill> : undefined} />)}</List>
          ) : <Empty>Сейчас от вас ничего не требуется.</Empty>}
        </Card>
        <Card title="Последние операции" action={<More to="/admin/operations">Все операции</More>} flush>
          <List>{last.map((o) => <OpRow key={o.id} op={o} onClick={() => setOp(o)} />)}</List>
        </Card>
      </div>
      <div className="grid cols-2">
        <Card title="Деньги по юридическим лицам" action={<More to="/admin/finance">Финансовый центр</More>} flush>
          <List>
            {d.entities.map((e) => (
              <Row key={e.id} to="/admin/finance" title={e.name} sub={registersIn(d, { entityId: e.id }).map((r) => r.name).join(', ')} value={money(onHand(d, { entityId: e.id }))} money />
            ))}
          </List>
        </Card>
        <Card title="Объекты" action={<More to="/admin/objects">Управление объектами</More>} flush>
          <List>
            {d.objects.map((o) => {
              const v = objectView(d, o);
              return <Row key={o.id} to={`/admin/objects/${o.id}`} title={o.name} sub={`${o.stage} · затраты ${money(v.spent)} из ${money(o.planCost)}`} value={pct(v.progress)} meta="выполнено" />;
            })}
          </List>
        </Card>
      </div>
      <OperationForm open={form} onClose={() => setForm(false)} />
      <OpSheet op={byId(d.operations, op?.id) ?? null} onClose={() => setOp(null)} editable />
    </Page>
  );
}

/* --------------------------------------------------------- finance center */
function Finance() {
  const d = useData();
  const nav = useNavigate();
  const [dir, setDir] = useSticky('admin.fin.dir', 'all');
  const [days, setDays] = useSticky('admin.fin.days', '30');
  const scope: Scope = dir === 'all' ? {} : { directionId: dir };
  const from = addDays(d.today, -(Number(days) - 1));
  const ops = flowOps(d, scope, from, d.today);
  const regs = registersIn(d, scope);
  const flow = (r: Register) => flowOps(d, { registerId: r.id }, from, d.today);
  const cols: Col<Register>[] = [
    { head: 'Касса или счёт', cell: (r) => <Two a={r.name} b={`${byId(d.entities, r.entityId)?.short} · ${r.kind === 'bank' ? 'банк' : 'наличные'}`} /> },
    { head: `Поступило за ${days} дн.`, num: true, phone: 'hide', cell: (r) => (sumIn(flow(r)) ? `+${money(sumIn(flow(r)))}` : <span className="muted">—</span>) },
    { head: `Потрачено за ${days} дн.`, num: true, phone: 'hide', cell: (r) => (sumOut(flow(r)) ? `−${money(sumOut(flow(r)))}` : <span className="muted">—</span>) },
    { head: 'Остаток', num: true, phone: 'value', cell: (r) => <b style={{ fontWeight: 700 }}>{money(registerBalance(d, r.id))}</b> },
  ];
  const expenses = byArticle(d, scope, from, d.today, 'out');
  const incomes = byArticle(d, scope, from, d.today, 'in');
  return (
    <Page title="Финансовый центр" sub={`${count(regs.length, 'денежный регистр', 'денежных регистра', 'денежных регистров')} в ${count(new Set(regs.map((r) => r.entityId)).size, 'юридическом лице', 'юридических лицах', 'юридических лицах')}. Переводы между своими кассами и счетами в обороты не входят.`}>
      <Chips value={dir} onChange={setDir} options={[{ value: 'all', label: 'Вся группа' }, ...d.directions.map((x) => ({ value: x.id, label: x.name }))]} />
      <div className="toolbar"><Seg value={days} onChange={setDays} options={[{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }]} /></div>
      <Stats items={[
        { label: 'Остаток на счетах и в кассах', value: money(onHand(d, scope)), lead: true, hint: transitTotal(d, scope) ? `ещё ${money(transitTotal(d, scope))} в пути` : 'переводов в пути нет' },
        { label: `Поступило за ${days} дней`, value: `+${money(sumIn(ops))}` },
        { label: `Потрачено за ${days} дней`, value: money(sumOut(ops)) },
      ]} />
      <Card title="Кассы и счета" flush>
        <DataTable cols={cols} rows={regs} keyOf={(r) => r.id} onRow={(r) => nav(`/admin/operations?register=${r.id}`)}
          foot={['Итого', `+${money(sumIn(ops))}`, `−${money(sumOut(ops))}`, money(onHand(d, scope))]} />
      </Card>
      <Card title="Поступления и расходы по неделям" note="8 недель"><FlowChart weeks={weeklyFlows(d, scope, 8)} /></Card>
      <div className="grid cols-2">
        <Card title="Расходы по статьям" note={`${days} дней`}>{expenses.length ? <BarList rows={expenses.map((x) => ({ label: x.article.name, value: x.amount }))} /> : <Empty>Расходов за период нет.</Empty>}</Card>
        <Card title="Поступления по статьям" note={`${days} дней`}>{incomes.length ? <BarList rows={incomes.map((x) => ({ label: x.article.name, value: x.amount }))} /> : <Empty>Поступлений за период нет.</Empty>}</Card>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------- operations */
function Operations() {
  const d = useData();
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useSticky('admin.ops.kind', 'all');
  const [days, setDays] = useSticky('admin.ops.days', '30');
  const [q, setQ] = useSticky('admin.ops.q', '');
  const [saved, setF] = useSticky('admin.ops.f', { entity: '', register: '', article: '', object: '' });
  // a link from the finance centre opens the registry already filtered by that register
  const linked = params.get('register');
  const f = linked && linked !== saved.register ? { ...saved, entity: '', register: linked } : saved;
  const [filters, setFilters] = useState(false);
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const from = addDays(d.today, -(Number(days) - 1));
  const s = q.trim().toLowerCase();
  const rows = d.operations
    .filter((o) => o.date >= from)
    .filter((o) => kind === 'all' || o.kind === kind)
    .filter((o) => !f.register || o.registerId === f.register || o.toRegisterId === f.register)
    .filter((o) => !f.entity || byId(d.registers, o.registerId)?.entityId === f.entity)
    .filter((o) => !f.article || o.articleId === f.article)
    .filter((o) => !f.object || o.objectId === f.object)
    .filter((o) => !s || `${o.counterparty ?? ''} ${o.comment ?? ''}`.toLowerCase().includes(s))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const active = Object.values(f).filter(Boolean).length;
  const seen = new Map<string, number>();
  for (const o of d.operations) { const k = `${o.date}|${o.kind}|${o.amount}|${o.registerId}|${o.counterparty ?? ''}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  const dupes = [...seen.values()].filter((n) => n > 1).length;
  const setFilter = (p: Partial<typeof f>) => { setF({ ...f, ...p }); if ('register' in p) setParams(p.register ? { register: p.register } : {}, { replace: true }); };
  const cols: Col<Operation>[] = [
    { head: 'Дата', phone: 'meta', width: '92px', cell: (o) => (wide ? dFull(o.date) : dRel(o.date, d.today)) },
    { head: 'Контрагент и основание', phone: 'title', cell: (o) => (wide ? <Two a={opTitle(d, o)} b={o.comment} /> : opTitle(d, o)) },
    { head: 'Статья', phone: 'sub', cell: (o) => (o.kind === 'transfer' ? 'Внутренний перевод' : byId(d.articles, o.articleId)?.name ?? '—') },
    { head: 'Касса или счёт', phone: 'sub', cell: (o) => `${byId(d.registers, o.registerId)?.name}` },
    { head: 'Объект', phone: 'hide', cell: (o) => (o.objectId ? byId(d.objects, o.objectId)?.name : <span className="muted">—</span>) },
    { head: 'Состояние', phone: 'hide', cell: (o) => (o.transit === 'sent' ? <Pill tone="warning">В пути</Pill> : o.bank === 'unmatched' ? <Pill tone="warning">Нет в выписке</Pill> : o.history.length ? <Pill>Исправлена</Pill> : <span className="muted">—</span>) },
    { head: 'Сумма', num: true, phone: 'value', cell: (o) => <b style={{ fontWeight: 700 }}><OpAmount op={o} /></b> },
  ];
  const selects = (
    <>
      <Field label="Юридическое лицо">
        <select className="select" value={f.entity} onChange={(e) => setFilter({ entity: e.target.value, register: '' })}>
          <option value="">Все</option>{d.entities.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
        </select>
      </Field>
      <Field label="Касса или счёт">
        <select className="select" value={f.register} onChange={(e) => setFilter({ register: e.target.value })}>
          <option value="">Все</option>{d.registers.filter((r) => !f.entity || r.entityId === f.entity).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Статья">
        <select className="select" value={f.article} onChange={(e) => setFilter({ article: e.target.value })}>
          <option value="">Все</option>{d.articles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Объект">
        <select className="select" value={f.object} onChange={(e) => setFilter({ object: e.target.value })}>
          <option value="">Все</option>{d.objects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
    </>
  );
  return (
    <Page title="Денежные операции"
      sub={`${count(rows.length, 'операция', 'операции', 'операций')} за ${days} дней: поступило ${money(sumIn(rows))}, потрачено ${money(sumOut(rows))}.${dupes ? ` Возможных дублей: ${dupes}.` : ''}`}
      actions={<Btn kind="primary" onClick={() => setForm(true)}><Plus size={18} /> Новая операция</Btn>}>
      <Chips value={kind} onChange={setKind} options={[{ value: 'all', label: 'Все' }, { value: 'in', label: 'Поступления' }, { value: 'out', label: 'Расходы' }, { value: 'transfer', label: 'Переводы' }]} />
      <div className="toolbar">
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input" style={{ paddingLeft: 38, width: '100%' }} type="search" placeholder="Контрагент или комментарий" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск по операциям" />
        </div>
        <span className="only-desktop"><Seg value={days} onChange={setDays} options={[{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }]} /></span>
        <Btn onClick={() => setFilters(true)} className="only-phone" aria-label="Фильтры"><SlidersHorizontal size={18} />{active ? ` ${active}` : ''}</Btn>
      </div>
      <div className="only-desktop" style={{ display: wide ? 'grid' : 'none', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>{selects}</div>
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(o) => o.id} onRow={(o) => setOpen(o.id)} empty="По этим условиям операций нет." />
      </Card>
      <Sheet open={filters} title="Фильтры" onClose={() => setFilters(false)}
        foot={<><Btn onClick={() => { setF({ entity: '', register: '', article: '', object: '' }); setParams({}, { replace: true }); }}>Сбросить</Btn><Btn kind="primary" onClick={() => setFilters(false)}>Показать {rows.length}</Btn></>}>
        <div className="form">
          <Field label="Период"><Seg wide value={days} onChange={setDays} options={[{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }]} /></Field>
          {selects}
        </div>
      </Sheet>
      <OperationForm open={form} onClose={() => setForm(false)} />
      <OpSheet op={byId(d.operations, open) ?? null} onClose={() => setOpen(null)} editable />
    </Page>
  );
}

/* ------------------------------------------------------------- transits */
function Transits() {
  const d = useData();
  const [tab, setTab] = useSticky<'way' | 'done' | 'bank'>('admin.tr.tab', 'way');
  const [info, setInfo] = useState(false);
  const way = transits(d);
  const done = d.operations.filter((o) => o.kind === 'transfer' && o.transit === 'received').sort((a, b) => (b.receivedDate ?? '').localeCompare(a.receivedDate ?? ''));
  const unmatched = d.operations.filter((o) => o.bank === 'unmatched').sort((a, b) => b.date.localeCompare(a.date));
  const matched = d.operations.filter((o) => o.bank === 'matched').length;
  const late = way.filter((o) => daysBetween(o.date, d.today) >= 2);
  const path = (o: Operation) => {
    const a = byId(d.registers, o.registerId);
    const b = byId(d.registers, o.toRegisterId);
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span><b style={{ fontWeight: 500 }}>{a?.name}</b> <span className="muted">{byId(d.entities, a?.entityId)?.short}</span></span>
        <ArrowRight size={16} color="var(--muted)" />
        <span><b style={{ fontWeight: 500 }}>{b?.name}</b> <span className="muted">{byId(d.entities, b?.entityId)?.short}</span></span>
      </div>
    );
  };
  return (
    <Page title="Транзиты и сверка"
      sub={late.length ? `${count(late.length, 'перевод', 'перевода', 'переводов')} на ${money(late.reduce((s, o) => s + o.amount, 0))} не подтверждён дольше двух дней.` : way.length ? 'Все переводы в пути отправлены недавно.' : 'Переводов в пути нет.'}>
      <Stats items={[
        { label: 'Деньги в пути', value: money(transitTotal(d)), lead: true, zero: !way.length, hint: count(way.length, 'перевод ждёт подтверждения', 'перевода ждут подтверждения', 'переводов ждут подтверждения') },
        { label: 'Дольше двух дней', value: <span className={late.length ? 'neg' : ''}>{late.length}</span>, zero: !late.length },
        { label: 'Нет в банковской выписке', value: unmatched.length, zero: !unmatched.length, hint: `сопоставлено ${matched}` },
      ]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'way', label: 'В пути', count: way.length }, { value: 'done', label: 'Подтверждённые', count: done.length }, { value: 'bank', label: 'Сверка с банком', count: unmatched.length }]} />
      {tab === 'way' && (way.length ? way.map((o, i) => (
        <Card key={o.id}>
          <div className="stack" style={{ gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}><Money v={o.amount} /></span>
              <span className={daysBetween(o.date, d.today) >= 2 ? 'neg' : 'muted'}>{transitAge(d, o)}</span>
            </div>
            {path(o)}
            <p className="muted">{o.comment} · отправил {userName(d, o.authorId)} {dShort(o.date)}</p>
            <div><Btn kind={i === 0 ? 'primary' : 'secondary'} onClick={() => { act.confirmTransit(o.id); toast('Получение подтверждено, деньги зачислены'); }}>Подтвердить получение</Btn></div>
          </div>
        </Card>
      )) : <Card><Empty>Все переводы подтверждены получателями.</Empty></Card>)}
      {tab === 'done' && (
        <Card flush>
          {done.length ? <List>{done.map((o) => <Row key={o.id} wrap title={opTitle(d, o)} sub={`${o.comment ?? 'Перевод'} · отправлен ${dShort(o.date)}, получен ${dShort(o.receivedDate ?? o.date)}`} value={money(o.amount)} />)}</List> : <Empty>Подтверждённых переводов пока нет.</Empty>}
        </Card>
      )}
      {tab === 'bank' && (
        <>
          <Card title="Операции, которых нет в выписке" action={<Btn small onClick={() => setInfo(true)}>Загрузить выписку</Btn>} flush>
            {unmatched.length ? (
              <List>
                {unmatched.map((o) => (
                  <Row key={o.id} wrap title={opTitle(d, o)} sub={`${dShort(o.date)} · ${opSub(d, o)}`} value={<OpAmount op={o} />}
                    side={<Btn small onClick={() => { act.matchBank(o.id); toast('Операция сопоставлена с выпиской'); }}>Сопоставить</Btn>} />
                ))}
              </List>
            ) : <Empty>Все операции по банковским счетам сопоставлены с выпиской.</Empty>}
          </Card>
          <p className="muted" style={{ fontSize: 13 }}>Сопоставлено с выпиской: {matched}. Операции по наличным кассам с банком не сверяются.</p>
        </>
      )}
      <Sheet open={info} title="Загрузка выписки" onClose={() => setInfo(false)} foot={<Btn kind="primary" onClick={() => setInfo(false)}>Понятно</Btn>}>
        <p>В демо-версии выписка из банка не загружается. В рабочей версии здесь будет импорт файла из банка: операции сопоставятся сами, а расхождения и возможные дубли останутся в этом списке.</p>
      </Sheet>
    </Page>
  );
}

/* --------------------------------------------------------------- planning */
function Planning() {
  const d = useData();
  const horizon = 14;
  const fc = forecast(d, horizon);
  const low = fc.reduce((a, b) => (b.balance < a.balance ? b : a), fc[0]);
  const items = d.plan.filter((p) => p.status !== 'paid' && p.date <= addDays(d.today, horizon)).sort((a, b) => a.date.localeCompare(b.date));
  const paid = d.plan.filter((p) => p.status === 'paid');
  const [form, setForm] = useState(false);
  const blank = { date: addDays(d.today, 3), flow: 'out' as 'in' | 'out', amount: 0, title: '', entityId: d.entities[0].id, regular: false };
  const [f, setF] = useState(blank);
  const incoming = items.filter((p) => p.flow === 'in').reduce((s, p) => s + p.amount, 0);
  const outgoing = items.filter((p) => p.flow === 'out').reduce((s, p) => s + p.amount, 0);
  return (
    <Page title="Планирование денег"
      sub={low.balance < 0 ? `Кассовый разрыв ${dShort(low.date)}: по плану не хватит ${money(-low.balance)}.` : `Разрыва на ${horizon} дней по плану нет. Самый низкий остаток ${dShort(low.date)}: ${money(low.balance)}.`}
      actions={<Btn kind="primary" onClick={() => setForm(true)}><Plus size={18} /> Плановый платёж</Btn>}>
      <Stats items={[
        { label: 'Деньги сейчас', value: money(onHand(d) + transitTotal(d)), lead: true, hint: 'на счетах, в кассах и в пути' },
        { label: `Плановые поступления, ${horizon} дней`, value: `+${money(incoming)}` },
        { label: `Плановые платежи, ${horizon} дней`, value: money(outgoing) },
        { label: `Остаток через ${horizon} дней`, value: money(fc[fc.length - 1].balance) },
      ]} />
      <div className="grid split-even">
        <Card title={`Прогноз остатка на ${horizon} дней`} note="план, не факт"><ForecastChart days={fc} /></Card>
        <Card title="Платежи и поступления по дням" flush><CalendarList items={items} /></Card>
      </div>
      <Card title="План и факт" note="оплаченные заявки" flush>
        {paid.length ? (
          <List>{paid.map((p) => <Row key={p.id} title={p.title} sub={`оплачено ${dShort(p.date)} · ${byId(d.entities, p.entityId)?.short}`} value={`−${money(p.amount)}`} />)}</List>
        ) : <Empty>Оплаченных плановых платежей пока нет. Они появятся здесь после оплаты согласованных заявок.</Empty>}
      </Card>
      <Sheet open={form} title="Плановый платёж или поступление" onClose={() => setForm(false)}
        foot={<><Btn onClick={() => setForm(false)}>Отмена</Btn><Btn kind="primary" disabled={!f.amount || !f.title.trim()}
          onClick={() => { act.addPlanItem({ ...f, title: f.title.trim(), regular: f.regular || undefined }); setF(blank); setForm(false); toast('Добавлено в платёжный календарь'); }}>Добавить</Btn></>}>
        <div className="form">
          <Seg wide value={f.flow} onChange={(flow) => setF({ ...f, flow })} options={[{ value: 'out', label: 'Платёж' }, { value: 'in', label: 'Поступление' }]} />
          <Field label="Сумма"><AmountInput autoFocus value={f.amount} onChange={(amount) => setF({ ...f, amount })} /></Field>
          <Field label="Название"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="За что или от кого" /></Field>
          <div className="form-2">
            <Field label="Дата"><input className="input" type="date" min={d.today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value || blank.date })} /></Field>
            <Field label="Юридическое лицо">
              <select className="select" value={f.entityId} onChange={(e) => setF({ ...f, entityId: e.target.value })}>
                {d.entities.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
              </select>
            </Field>
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={f.regular} onChange={(e) => setF({ ...f, regular: e.target.checked })} style={{ width: 20, height: 20 }} />
            <span>Регулярный платёж</span>
          </label>
        </div>
      </Sheet>
    </Page>
  );
}

export const routes = [
  { path: '/admin', element: <Home /> },
  { path: '/admin/finance', element: <Finance /> },
  { path: '/admin/operations', element: <Operations /> },
  { path: '/admin/transits', element: <Transits /> },
  { path: '/admin/planning', element: <Planning /> },
  ...restRoutes,
];
