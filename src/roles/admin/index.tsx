// The economist: «Дела» (everything that needs her now) and «Деньги» (one screen with four tabs:
// registers, the registry of operations, transfers and the bank, the plan).
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { act, useData, useUser } from '../../data/store';
import {
  byArticle, byId, flowOps, forecast, onHand, registerBalance, registersIn, sumIn, sumOut, tasksFor, transitAge, transits, transitTotal,
  userName, weeklyFlows, type Scope,
} from '../../data/select';
import {
  AmountInput, Btn, Card, Chips, DataTable, Details, Empty, Field, Finding, Go, List, Page, Pill, Row, Seg, Sheet, Stats, Two, toast,
  useDesktop, useSticky, useWide, type Col,
} from '../../ui/kit';
import { BarList, FlowChart, ForecastChart } from '../../ui/charts';
import { OpAmount, OpSheet, OperationForm, opSub, opTitle } from '../../shared/money';
import { NewsCard, TodoCard } from '../../shared/common';
import { CalendarList } from '../owner';
import { addDays, count, dFull, dRel, dShort, daysBetween, money } from '../../lib/format';
import type { Operation, Register } from '../../data/types';
import { StuckCard } from './rest-control';
import { restRoutes } from './rest';

const PERIODS = [{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }];

/* ------------------------------------------------------------------ home */
function Home() {
  const d = useData();
  const u = useUser();
  const [form, setForm] = useState(false);
  const urgent = tasksFor(d, u).filter((t) => t.tone === 'negative').length;
  return (
    <Page title="Дела" sub={urgent ? `Срочно: ${count(urgent, 'дело', 'дела', 'дел')}` : undefined}
      actions={<Btn kind="primary" onClick={() => setForm(true)}><Plus size={18} /> Записать деньги</Btn>}>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <TodoCard limit={8} />
        <div className="stack">
          <StuckCard />
          <NewsCard />
        </div>
      </div>
      <OperationForm open={form} onClose={() => setForm(false)} />
    </Page>
  );
}

/* ----------------------------------------------------------------- money */
type MoneyTab = 'overview' | 'ops' | 'transfers' | 'plan';
const MONEY_TABS: { value: MoneyTab; label: string }[] = [
  { value: 'overview', label: 'Обзор' }, { value: 'ops', label: 'Операции' }, { value: 'transfers', label: 'Переводы' }, { value: 'plan', label: 'План' },
];

/** The kit's segmented control; on a phone its buttons are narrower, so four tabs fit 375px without cutting a word. */
function TabSeg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const desktop = useDesktop();
  if (desktop) return <div><Seg value={value} onChange={onChange} options={options} /></div>;
  return (
    <div className="seg wide" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} style={{ padding: '0 4px' }}>{o.label}</button>
      ))}
    </div>
  );
}

function Money() {
  const [sp, setSp] = useSearchParams();
  const [form, setForm] = useState(false);
  const tab = MONEY_TABS.find((t) => t.value === sp.get('tab'))?.value ?? 'overview';
  // the other parameters (?register=) stay: the registry keeps its filter when the person comes back to it
  const setTab = (t: MoneyTab) => {
    const q = new URLSearchParams(sp);
    if (t === 'overview') q.delete('tab'); else q.set('tab', t);
    setSp(q, { replace: true });
  };
  return (
    <Page title="Деньги" actions={<Btn kind="primary" onClick={() => setForm(true)}><Plus size={18} /> Записать деньги</Btn>}>
      <TabSeg value={tab} onChange={setTab} options={MONEY_TABS} />
      {tab === 'overview' && <Overview />}
      {tab === 'ops' && <Ops />}
      {tab === 'transfers' && <Transfers />}
      {tab === 'plan' && <Plan />}
      <OperationForm open={form} onClose={() => setForm(false)} />
    </Page>
  );
}

/* --------------------------------------------------------------- overview */
function Overview() {
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
    <>
      {/* one row of filters: what part of the group and for what period */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, maxWidth: 480 }}>
        <select className="select" aria-label="Направление" value={dir} onChange={(e) => setDir(e.target.value)}>
          <option value="all">Вся группа</option>
          {d.directions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select className="select" aria-label="Период" value={days} onChange={(e) => setDays(e.target.value)}>
          {PERIODS.map((x) => <option key={x.value} value={x.value}>{`За ${x.label}`}</option>)}
        </select>
      </div>
      <Stats items={[
        { label: 'На счетах и в кассах', value: money(onHand(d, scope)), lead: true, hint: transitTotal(d, scope) ? `ещё ${money(transitTotal(d, scope))} в пути` : undefined },
        { label: `Поступило за ${days} дней`, value: `+${money(sumIn(ops))}` },
        { label: `Потрачено за ${days} дней`, value: money(sumOut(ops)) },
      ]} />
      <Card title="Кассы и счета" flush>
        <DataTable cols={cols} rows={regs} keyOf={(r) => r.id} onRow={(r) => nav(`/admin/money?tab=ops&register=${r.id}`)}
          foot={['Итого', `+${money(sumIn(ops))}`, `−${money(sumOut(ops))}`, money(onHand(d, scope))]} />
      </Card>
      <Card title="Поступления и расходы по неделям" note="8 недель"><FlowChart weeks={weeklyFlows(d, scope, 8)} /></Card>
      <Details label="По статьям">
        <div className="grid cols-2">
          <Card title="Расходы" note={`${days} дней`}>{expenses.length ? <BarList rows={expenses.map((x) => ({ label: x.article.name, value: x.amount }))} /> : <Empty>Расходов за период нет.</Empty>}</Card>
          <Card title="Поступления" note={`${days} дней`}>{incomes.length ? <BarList rows={incomes.map((x) => ({ label: x.article.name, value: x.amount }))} /> : <Empty>Поступлений за период нет.</Empty>}</Card>
        </div>
      </Details>
    </>
  );
}

/* ------------------------------------------------------------- operations */
const NO_FILTER = { entity: '', register: '', article: '', object: '' };

function Ops() {
  const d = useData();
  const wide = useWide();
  const desktop = useDesktop();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useSticky('admin.ops.kind', 'all');
  const [days, setDays] = useSticky('admin.ops.days', '30');
  const [q, setQ] = useSticky('admin.ops.q', '');
  const [saved, setF] = useSticky('admin.ops.f', NO_FILTER);
  // a link from «Обзор» or an old address opens the registry already filtered by that register
  const linked = params.get('register');
  const f = linked && linked !== saved.register ? { ...saved, entity: '', register: linked } : saved;
  const [filters, setFilters] = useState(false);
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
  const linkRegister = (register: string) => {
    const next = new URLSearchParams(params);
    if (register) next.set('register', register); else next.delete('register');
    setParams(next, { replace: true });
  };
  const setFilter = (p: Partial<typeof f>) => { setF({ ...f, ...p }); if ('register' in p) linkRegister(p.register ?? ''); };
  const reset = () => { setF(NO_FILTER); linkRegister(''); };
  const cols: Col<Operation>[] = [
    { head: 'Дата', phone: 'meta', width: '92px', cell: (o) => (wide ? dFull(o.date) : dRel(o.date, d.today)) },
    { head: 'Контрагент и основание', phone: 'title', cell: (o) => (wide ? <Two a={opTitle(d, o)} b={o.comment} /> : opTitle(d, o)) },
    { head: 'Статья', phone: 'sub', cell: (o) => (o.kind === 'transfer' ? 'Перевод между своими' : byId(d.articles, o.articleId)?.name ?? '—') },
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
    <>
      <Chips value={kind} onChange={setKind} options={[{ value: 'all', label: 'Все' }, { value: 'in', label: 'Поступления' }, { value: 'out', label: 'Расходы' }, { value: 'transfer', label: 'Переводы' }]} />
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input" style={{ paddingLeft: 38, width: '100%' }} type="search" placeholder="Контрагент или комментарий" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск по операциям" />
        </div>
        {desktop
          ? <Seg value={days} onChange={setDays} options={PERIODS} />
          : <Btn onClick={() => setFilters(true)} aria-label="Фильтры"><SlidersHorizontal size={18} />{active ? ` ${active}` : ''}</Btn>}
      </div>
      {desktop && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>{selects}</div>}
      {dupes > 0 && <Finding>Возможные дубли: {dupes}. Одинаковые дата, сумма, касса и контрагент.</Finding>}
      <Card title={count(rows.length, 'операция', 'операции', 'операций')} note={`+${money(sumIn(rows))} · −${money(sumOut(rows))}`} flush>
        <DataTable cols={cols} rows={rows} keyOf={(o) => o.id} onRow={(o) => setOpen(o.id)} empty="По этим условиям операций нет." />
      </Card>
      <Sheet open={filters} title="Фильтры" onClose={() => setFilters(false)}
        foot={<><Btn onClick={reset}>Сбросить</Btn><Btn kind="primary" onClick={() => setFilters(false)}>Показать {rows.length}</Btn></>}>
        <div className="form">
          <Field label="Период"><Seg wide value={days} onChange={setDays} options={PERIODS} /></Field>
          {selects}
        </div>
      </Sheet>
      <OpSheet op={byId(d.operations, open) ?? null} onClose={() => setOpen(null)} editable />
    </>
  );
}

/* -------------------------------------------------------------- transfers */
function Transfers() {
  const d = useData();
  const [info, setInfo] = useState(false);
  const way = transits(d);
  const done = d.operations.filter((o) => o.kind === 'transfer' && o.transit === 'received').sort((a, b) => (b.receivedDate ?? '').localeCompare(a.receivedDate ?? ''));
  const unmatched = d.operations.filter((o) => o.bank === 'unmatched').sort((a, b) => b.date.localeCompare(a.date));
  const matched = d.operations.filter((o) => o.bank === 'matched').length;
  const late = way.filter((o) => daysBetween(o.date, d.today) >= 2);
  return (
    <>
      {late.length > 0 && <Finding>Дольше двух дней не подтверждено: {count(late.length, 'перевод', 'перевода', 'переводов')} на {money(late.reduce((s, o) => s + o.amount, 0))}.</Finding>}
      <Card title="В пути" note={way.length ? money(transitTotal(d)) : undefined} flush>
        {way.length ? (
          <List>
            {way.map((o) => (
              <Row key={o.id} wrap title={opTitle(d, o)}
                sub={<><span className={daysBetween(o.date, d.today) >= 2 ? 'neg' : ''}>{transitAge(d, o)}</span>{` · ${o.comment ? `${o.comment} · ` : ''}отправил ${userName(d, o.authorId)} ${dShort(o.date)}`}</>}
                value={money(o.amount)} money
                side={<Btn small onClick={() => { act.confirmTransit(o.id); toast('Получение подтверждено, деньги зачислены'); }}>Подтвердить</Btn>} />
            ))}
          </List>
        ) : <Empty>Все переводы подтверждены получателями.</Empty>}
      </Card>
      <Card title="Сверка с банком" note={`сопоставлено ${matched}`} action={<Btn small onClick={() => setInfo(true)}>Загрузить выписку</Btn>} flush>
        {unmatched.length ? (
          <List>
            {unmatched.map((o) => (
              <Row key={o.id} wrap title={opTitle(d, o)} sub={`${dShort(o.date)} · ${opSub(d, o)}`} value={<OpAmount op={o} />}
                side={<Btn small onClick={() => { act.matchBank(o.id); toast('Операция сопоставлена с выпиской'); }}>Сопоставить</Btn>} />
            ))}
          </List>
        ) : <Empty>Все операции по счетам есть в выписке.</Empty>}
      </Card>
      <Details label={`Подтверждённые переводы: ${done.length}`}>
        <Card flush>
          {done.length ? <List>{done.map((o) => <Row key={o.id} wrap title={opTitle(d, o)} sub={`${o.comment ?? 'Перевод'} · отправлен ${dShort(o.date)}, получен ${dShort(o.receivedDate ?? o.date)}`} value={money(o.amount)} />)}</List> : <Empty>Подтверждённых переводов пока нет.</Empty>}
        </Card>
      </Details>
      <Sheet open={info} title="Загрузка выписки" onClose={() => setInfo(false)} foot={<Btn kind="primary" onClick={() => setInfo(false)}>Понятно</Btn>}>
        <p>В демо выписка не загружается. В рабочей версии файл из банка сопоставится сам, а расхождения останутся в списке «Сверка с банком».</p>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------- plan */
function Plan() {
  const d = useData();
  const horizon = 14;
  const fc = forecast(d, horizon);
  const low = fc.reduce((a, b) => (b.balance < a.balance ? b : a), fc[0]);
  const end = fc[fc.length - 1].balance;
  const items = d.plan.filter((p) => p.status !== 'paid' && p.date <= addDays(d.today, horizon)).sort((a, b) => a.date.localeCompare(b.date));
  const paid = d.plan.filter((p) => p.status === 'paid');
  const [form, setForm] = useState(false);
  return (
    <>
      {low.balance < 0 && <Finding>Кассовый разрыв {dShort(low.date)}: по плану не хватит {money(-low.balance)}.</Finding>}
      <div className="grid split-even">
        <Card title={`Остаток на ${horizon} дней`} note={<>через {horizon} дней <span className={end < 0 ? 'neg' : ''}>{money(end)}</span></>}><ForecastChart days={fc} /></Card>
        <Card title="Платежи и поступления" action={<Btn small onClick={() => setForm(true)}><Plus size={16} /> Плановый платёж</Btn>} flush><CalendarList items={items} /></Card>
      </div>
      <Details label={`Оплачено по плану: ${paid.length}`}>
        <Card flush>
          {paid.length
            ? <List>{paid.map((p) => <Row key={p.id} title={p.title} sub={`оплачено ${dShort(p.date)} · ${byId(d.entities, p.entityId)?.short}`} value={`−${money(p.amount)}`} />)}</List>
            : <Empty>Оплаченных плановых платежей пока нет.</Empty>}
        </Card>
      </Details>
      <PlanForm open={form} onClose={() => setForm(false)} />
    </>
  );
}

function PlanForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const blank = { date: addDays(d.today, 3), flow: 'out' as 'in' | 'out', amount: 0, title: '', entityId: d.entities[0].id, regular: false };
  const [f, setF] = useState(blank);
  return (
    <Sheet open={open} title="Плановый платёж или поступление" onClose={onClose} dirty={f.amount > 0 || !!f.title.trim()}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!f.amount || !f.title.trim()}
        onClick={() => { act.addPlanItem({ ...f, title: f.title.trim(), regular: f.regular || undefined }); setF(blank); onClose(); toast('Добавлено в план'); }}>Добавить</Btn></>}>
      <div className="form">
        <Seg wide value={f.flow} onChange={(flow) => setF({ ...f, flow })} options={[{ value: 'out', label: 'Платёж' }, { value: 'in', label: 'Поступление' }]} />
        <Field label="Сумма"><AmountInput autoFocus value={f.amount} onChange={(amount) => setF({ ...f, amount })} /></Field>
        <Field label="Название"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="За что или от кого" /></Field>
        <Field label="Дата"><input className="input" type="date" min={d.today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value || blank.date })} /></Field>
        <Details label="Юрлицо и повтор">
          <Field label="Юридическое лицо">
            <select className="select" value={f.entityId} onChange={(e) => setF({ ...f, entityId: e.target.value })}>
              {d.entities.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
            </select>
          </Field>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={f.regular} onChange={(e) => setF({ ...f, regular: e.target.checked })} style={{ width: 20, height: 20 }} />
            <span>Регулярный платёж</span>
          </label>
        </Details>
      </div>
    </Sheet>
  );
}

export const routes = [
  { path: '/admin', element: <Home /> },
  { path: '/admin/money', element: <Money /> },
  // old addresses: the four money screens are now tabs of «Деньги», «Контроль процессов» is the card «Застряло» in «Дела»
  { path: '/admin/finance', element: <Go to="/admin/money" add={{ tab: 'overview' }} /> },
  { path: '/admin/operations', element: <Go to="/admin/money" add={{ tab: 'ops' }} /> },
  { path: '/admin/transits', element: <Go to="/admin/money" add={{ tab: 'transfers' }} /> },
  { path: '/admin/planning', element: <Go to="/admin/money" add={{ tab: 'plan' }} /> },
  { path: '/admin/processes', element: <Go to="/admin" /> },
  ...restRoutes,
];
