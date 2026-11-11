// The owner's workspace: Главная (money now, what waits for a decision, the next days, objects), Решения, Деньги.
// Every screen answers one question first; the totals open down to the operations behind them.
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { act, useData } from '../../data/store';
import {
  byId, flowOps, forecast, objectName, objectView, onHand, registersIn, registerBalance, sumIn, sumOut, transits, transitTotal,
  weeklyFlows, byArticle, lineState, needState, transitAge, userName, type Scope,
} from '../../data/select';
import {
  Btn, Card, Chips, DataTable, Details, Empty, Field, Finding, Go, List, More, Page, Pill, Row, Seg, Sheet, Stats, Status, Track,
  toast, useSticky, useWide, type Col,
} from '../../ui/kit';
import { BarList, FlowChart, ForecastChart } from '../../ui/charts';
import { NoteSheet, OpRow, OpSheet, OperationForm, RequestCard, dueLabel, planStatus } from '../../shared/money';
import { NewsCard } from '../../shared/common';
import { addDays, count, dRel, dShort, dWeek, daysBetween, money, moneySigned, pct } from '../../lib/format';
import type { Data, MoneyRequest, Operation, PlanItem } from '../../data/types';

const signed = (v: number): ReactNode => <span className={v < 0 ? 'neg' : v > 0 ? 'pos' : 'muted'}>{moneySigned(v)}</span>;
const HORIZON = 14;

/** The lowest point of the money forecast: a cash gap when it is below zero. */
function lowPoint(d: Data) {
  const fc = forecast(d, HORIZON);
  return { fc, low: fc.reduce((a, b) => (b.balance < a.balance ? b : a), fc[0]) };
}

/* ------------------------------------------------------------------ home */
function Home() {
  const d = useData();
  const [form, setForm] = useState(false);
  const hand = onHand(d);
  const inTransit = transitTotal(d);
  const late = transits(d).filter((o) => daysBetween(o.date, d.today) >= 2);
  const pending = d.requests.filter((r) => r.status === 'pending').sort((a, b) => a.due.localeCompare(b.due));
  const week = d.plan.filter((p) => p.status !== 'paid' && p.date <= addDays(d.today, 7)).sort((a, b) => a.date.localeCompare(b.date));
  const { low } = lowPoint(d);

  return (
    <Page
      title="Главная"
      sub={low.balance < 0 ? <span className="neg">Кассовый разрыв {dShort(low.date)}: по плану не хватит {money(-low.balance)}.</span> : undefined}
      actions={<Btn kind="primary" onClick={() => setForm(true)}>Записать расход или приход</Btn>}
    >
      <Link to="/owner/money" className="card" style={{ display: 'flex', alignItems: 'center', paddingRight: 16 }} aria-label="Деньги сейчас, подробнее">
        <div className="stat lead" style={{ flex: 1, background: 'transparent' }}>
          <div className="label">Деньги сейчас</div>
          <div className="value">{money(hand + inTransit)}</div>
          <div className="hint">на счетах и в кассах {money(hand)}{inTransit ? ` · переводы в пути ${money(inTransit)}` : ''}</div>
          {late.length > 0 && (
            <div className="hint" style={{ color: 'var(--negative)' }}>
              {late.length === 1
                ? `Перевод ${money(late[0].amount)} ${transitAge(d, late[0])}, получатель не подтвердил`
                : `${count(late.length, 'перевод', 'перевода', 'переводов')} в пути дольше двух дней`}
            </div>
          )}
        </div>
        <ChevronRight size={18} color="var(--faint)" />
      </Link>

      <div className="grid cols-2">
        {pending.length > 0 && (
          <Card title="Ждут решения" note={`${pending.length} · ${money(pending.reduce((s, r) => s + r.amount, 0))}`} action={<More to="/owner/approvals" />} flush>
            <List>
              {pending.slice(0, 3).map((r) => (
                <Row key={r.id} to="/owner/approvals" title={r.basis} sub={`${userName(d, r.authorId)} · ${dueLabel(d, r.due).text}`} value={money(r.amount)} money />
              ))}
            </List>
          </Card>
        )}
        <Card title="Ближайшие 7 дней" action={<More to="/owner/money?tab=calendar">Календарь</More>} flush>
          {week.length ? (
            <List>
              {week.slice(0, 5).map((p) => (
                <Row key={p.id} to="/owner/money?tab=calendar" title={p.title} sub={`${dRel(p.date, d.today)} · ${planStatus(d, p).text.toLowerCase()}`}
                  value={p.flow === 'in' ? <span className="pos">+{money(p.amount)}</span> : `−${money(p.amount)}`} />
              ))}
            </List>
          ) : <div className="card-body"><Empty>Платежей и поступлений на неделю нет.</Empty></div>}
        </Card>
        <Card title="Объекты" action={<More to="/owner/objects" />} flush>
          <List>
            {d.objects.map((o) => {
              const v = objectView(d, o);
              const over = v.spent > o.planCost;
              const bad = over ? 'Перерасход' : v.lateWorks ? 'Срок прошёл' : undefined;
              return (
                <Row key={o.id} to="/owner/objects" title={o.name} value={pct(v.progress)} meta="выполнено"
                  side={bad ? <Status kind="problem">{bad}</Status> : undefined} />
              );
            })}
          </List>
        </Card>
        <NewsCard skip={(to) => to === '/owner/approvals'} />
      </div>
      <OperationForm open={form} onClose={() => setForm(false)} defaultRegister="r7" />
    </Page>
  );
}

/* ------------------------------------------------------------- approvals */
/** Rejecting needs a reason. The same sheet can send the request back to its author instead. */
function RejectSheet({ r, onClose }: { r: MoneyRequest; onClose: () => void }) {
  const [note, setNote] = useState('');
  const ok = !!note.trim();
  const decide = (action: 'rejected' | 'clarify') => {
    act.decideRequest(r.id, action, note.trim());
    toast(action === 'rejected' ? `Заявка № ${r.num} отклонена` : `Заявка № ${r.num} возвращена на уточнение`);
    onClose();
  };
  return (
    <Sheet open title={`Отклонить заявку № ${r.num}`} onClose={onClose} dirty={ok}
      foot={(
        <>
          <Btn disabled={!ok} onClick={() => decide('clarify')}>Вернуть на уточнение</Btn>
          <Btn kind="primary" disabled={!ok} onClick={() => decide('rejected')}>Отклонить</Btn>
        </>
      )}>
      <Field label="Комментарий для автора">
        <textarea className="textarea" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что не так или что уточнить" />
      </Field>
    </Sheet>
  );
}

function Approvals() {
  const d = useData();
  const [noted, setNoted] = useState<MoneyRequest | null>(null);
  const [reject, setReject] = useState<MoneyRequest | null>(null);
  const open = d.requests.filter((r) => r.status === 'pending').sort((a, b) => a.due.localeCompare(b.due));
  const decided = d.requests.filter((r) => r.status !== 'pending').sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num);
  return (
    <Page title="Решения"
      sub={open.length ? `${count(open.length, 'заявка', 'заявки', 'заявок')} на ${money(open.reduce((s, r) => s + r.amount, 0))}` : undefined}>
      {open.length === 0 && <Card><Empty>Заявок, которые ждут решения, нет.</Empty></Card>}
      <div className="grid cols-2">
        {open.map((r) => (
          <RequestCard key={r.id} r={r}>
            {/* two equal buttons side by side: the decision is the one thing to do here */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4, maxWidth: 420 }}>
              <Btn kind="primary" onClick={() => { act.decideRequest(r.id, 'approved'); toast(`Заявка № ${r.num} согласована`); }}>Согласовать</Btn>
              <Btn onClick={() => setReject(r)}>Отклонить</Btn>
            </div>
            <div><button type="button" className="link" onClick={() => setNoted(r)}>Согласовать с комментарием</button></div>
          </RequestCard>
        ))}
      </div>
      {decided.length > 0 && (
        <Details label={`Решённые · ${decided.length}`}>
          <div className="grid cols-2">{decided.map((r) => <RequestCard key={r.id} r={r} />)}</div>
        </Details>
      )}
      <NoteSheet open={!!noted} title={noted ? `Согласовать заявку № ${noted.num}` : ''} label="Комментарий" action="Согласовать" required
        onClose={() => setNoted(null)}
        onSubmit={(text) => { if (noted) { act.decideRequest(noted.id, 'noted', text); toast(`Заявка № ${noted.num} согласована с комментарием`); } setNoted(null); }} />
      {reject && <RejectSheet key={reject.id} r={reject} onClose={() => setReject(null)} />}
    </Page>
  );
}

/* ------------------------------------------------------- money: сейчас */
function MoneyNow() {
  const d = useData();
  const [scope, setScope] = useSticky<Scope>('owner.fin.scope', {});
  const [days, setDays] = useSticky('owner.fin.days', '30');
  const [op, setOp] = useState<Operation | null>(null);
  const from = addDays(d.today, -(Number(days) - 1));
  const ops = flowOps(d, scope, from, d.today);
  const dirn = byId(d.directions, scope.directionId);
  const ent = byId(d.entities, scope.entityId);
  const reg = byId(d.registers, scope.registerId);
  const crumbs: { label: string; scope: Scope }[] = [{ label: 'Группа', scope: {} }];
  if (dirn) crumbs.push({ label: dirn.name, scope: { directionId: dirn.id } });
  if (ent) crumbs.push({ label: ent.short, scope: { directionId: scope.directionId, entityId: ent.id } });
  if (reg) crumbs.push({ label: reg.name, scope });
  const regOps = reg
    ? d.operations.filter((o) => (o.registerId === reg.id || o.toRegisterId === reg.id) && o.date >= from).sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const expenses = byArticle(d, scope, from, d.today, 'out');
  const tr = transits(d, scope);
  const late = tr.some((o) => daysBetween(o.date, d.today) >= 2);

  return (
    <>
      <div className="toolbar">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
          {crumbs.map((c, i) => (
            <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <ChevronRight size={14} color="var(--faint)" />}
              {i < crumbs.length - 1
                ? <button className="link" onClick={() => setScope(c.scope)}>{c.label}</button>
                : <b style={{ fontWeight: 600, minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>{c.label}</b>}
            </span>
          ))}
        </div>
        <Seg value={days} onChange={setDays} options={[{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }]} />
      </div>
      <Stats items={[
        { label: reg ? 'Остаток' : 'На счетах и в кассах', value: money(onHand(d, scope)), lead: true, hint: transitTotal(d, scope) ? `ещё ${money(transitTotal(d, scope))} в переводах в пути` : undefined },
        { label: `Поступило за ${days} дней`, value: `+${money(sumIn(ops))}` },
        { label: `Потрачено за ${days} дней`, value: money(sumOut(ops)) },
      ]} />

      <div className="grid split-even">
        <Card title={reg ? 'Операции' : ent ? 'Кассы и счета' : dirn ? 'Юридические лица' : 'Направления'} flush>
          {reg ? (
            regOps.length ? <List>{regOps.map((o) => <OpRow key={o.id} op={o} onClick={() => setOp(o)} />)}</List> : <div className="card-body"><Empty>За период операций нет.</Empty></div>
          ) : (
            <List>
              {!dirn && d.directions.map((x) => (
                <Row key={x.id} onClick={() => setScope({ directionId: x.id })} title={x.name}
                  sub={d.entities.filter((e) => e.directionId === x.id).map((e) => e.short).join(', ')} value={money(onHand(d, { directionId: x.id }))} money />
              ))}
              {dirn && !ent && d.entities.filter((e) => e.directionId === dirn.id).map((e) => (
                <Row key={e.id} onClick={() => setScope({ directionId: dirn.id, entityId: e.id })} title={e.name}
                  sub={count(registersIn(d, { entityId: e.id }).length, 'касса или счёт', 'кассы и счета', 'касс и счетов')} value={money(onHand(d, { entityId: e.id }))} money />
              ))}
              {ent && registersIn(d, { entityId: ent.id }).map((r) => (
                <Row key={r.id} onClick={() => setScope({ ...scope, registerId: r.id })} title={r.name} sub={r.kind === 'bank' ? 'Банковский счёт' : 'Наличная касса'}
                  value={money(registerBalance(d, r.id))} money />
              ))}
            </List>
          )}
        </Card>
        <Card title="Поступления и расходы по неделям">
          <FlowChart weeks={weeklyFlows(d, scope, 8)} />
        </Card>
      </div>

      <Details label={`Переводы в пути${tr.length ? ` · ${tr.length}` : ''}`} open={late}>
        <Card flush>
          {tr.length ? <List>{tr.map((o) => <OpRow key={o.id} op={o} onClick={() => setOp(o)} />)}</List> : <div className="card-body"><Empty>Все переводы получены.</Empty></div>}
        </Card>
      </Details>
      <Details label="На что потрачено">
        <Card>
          {expenses.length ? <BarList rows={expenses.map((x) => ({ label: x.article.name, value: x.amount }))} /> : <Empty>Расходов за период нет.</Empty>}
        </Card>
      </Details>
      <OpSheet op={op} onClose={() => setOp(null)} />
    </>
  );
}

/* ---------------------------------------------------- money: календарь */
export function CalendarList({ items }: { items: PlanItem[] }) {
  const d = useData();
  const dates = [...new Set(items.map((p) => (p.date < d.today ? 'late' : p.date)))].sort((a, b) => (a === 'late' ? -1 : b === 'late' ? 1 : a.localeCompare(b)));
  if (!items.length) return <Empty>На этот период ничего не запланировано.</Empty>;
  return (
    <div>
      {dates.map((date) => {
        const day = items.filter((p) => (date === 'late' ? p.date < d.today : p.date === date));
        return (
          <div key={date}>
            <div className="row first" style={{ minHeight: 36, paddingTop: 10, paddingBottom: 4, borderTop: '1px solid var(--rule)' }}>
              <span className={`row-main ${date === 'late' ? 'neg' : 'muted'}`} style={{ fontSize: 13 }}>{date === 'late' ? 'Срок прошёл' : `${dRel(date, d.today)}, ${dWeek(date)}`}</span>
            </div>
            {day.map((p) => {
              const st = planStatus(d, p);
              return (
                <div key={p.id} className="row first" style={{ borderTop: 0, minHeight: 48, paddingTop: 6, paddingBottom: 10 }}>
                  <div className="row-main">
                    <div className="row-title wrap">{p.title}</div>
                    <div className="row-sub">{byId(d.entities, p.entityId)?.short}{p.objectId ? ` · ${objectName(d, p.objectId)}` : ''}</div>
                  </div>
                  <div className="row-side">
                    <div className="row-value">{p.flow === 'in' ? <span className="pos">+{money(p.amount)}</span> : `−${money(p.amount)}`}</div>
                    <div className="row-meta"><Pill tone={st.tone}>{st.text}</Pill></div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function MoneyCalendar() {
  const d = useData();
  const { fc, low } = lowPoint(d);
  const items = d.plan.filter((p) => p.status !== 'paid' && p.date <= addDays(d.today, HORIZON)).sort((a, b) => a.date.localeCompare(b.date));
  const incoming = items.filter((p) => p.flow === 'in').reduce((s, p) => s + p.amount, 0);
  const outgoing = items.filter((p) => p.flow === 'out').reduce((s, p) => s + p.amount, 0);
  const unapproved = items.filter((p) => p.flow === 'out' && p.status === 'plan' && p.requestId).reduce((s, p) => s + p.amount, 0);
  return (
    <>
      {low.balance < 0 && (
        <Finding icon={<TriangleAlert size={18} />}>Кассовый разрыв {dShort(low.date)}: по плану не хватит {money(-low.balance)}.</Finding>
      )}
      <Stats items={[
        { label: `Останется через ${HORIZON} дней`, value: money(fc[fc.length - 1].balance), lead: true, hint: `сейчас ${money(fc[0].balance + fc[0].out - fc[0].in)}` },
        { label: 'Придёт', value: `+${money(incoming)}` },
        { label: 'Уйдёт', value: money(outgoing), hint: unapproved ? `${money(unapproved)} ещё не согласовано` : undefined },
      ]} />
      <div className="grid split-even">
        <Card title={`Прогноз остатка на ${HORIZON} дней`}>
          <ForecastChart days={fc} />
        </Card>
        <Card title="По дням" flush><CalendarList items={items} /></Card>
      </div>
    </>
  );
}

/* ---------------------------------------------------- money: аналитика */
interface Slice { id: string; name: string; inc: number; out: number; ops: Operation[] }
function MoneyAnalytics() {
  const d = useData();
  const [dim, setDim] = useSticky('owner.an.dim', 'direction');
  const [days, setDays] = useSticky('owner.an.days', '30');
  const [open, setOpen] = useState<Slice | null>(null);
  const from = addDays(d.today, -(Number(days) - 1));
  const all = flowOps(d, {}, from, d.today);
  const slice = (id: string, name: string, ops: Operation[]): Slice => ({ id, name, inc: sumIn(ops), out: sumOut(ops), ops });
  let rows: Slice[] = [];
  if (dim === 'direction') rows = d.directions.map((x) => slice(x.id, x.name, flowOps(d, { directionId: x.id }, from, d.today)));
  if (dim === 'entity') rows = d.entities.map((x) => slice(x.id, x.name, flowOps(d, { entityId: x.id }, from, d.today)));
  if (dim === 'object') rows = [...d.objects.map((x) => slice(x.id, x.name, all.filter((o) => o.objectId === x.id))), slice('none', 'Без объекта', all.filter((o) => !o.objectId))];
  if (dim === 'article') rows = d.articles.map((x) => slice(x.id, x.name, all.filter((o) => o.articleId === x.id)));
  rows = rows.filter((r) => r.inc || r.out).sort((a, b) => b.inc + b.out - (a.inc + a.out));
  const cols: Col<Slice>[] = [
    { head: 'Название', cell: (r) => r.name },
    { head: 'Поступило', num: true, phone: 'sub', cell: (r) => (r.inc ? `+${money(r.inc)}` : <span className="muted">—</span>) },
    { head: 'Потрачено', num: true, phone: 'sub', cell: (r) => (r.out ? `−${money(r.out)}` : <span className="muted">—</span>) },
    { head: 'Сальдо', num: true, phone: 'value', cell: (r) => signed(r.inc - r.out) },
  ];
  return (
    <>
      <Chips value={dim} onChange={setDim} options={[{ value: 'direction', label: 'Направления' }, { value: 'entity', label: 'Юридические лица' }, { value: 'object', label: 'Объекты' }, { value: 'article', label: 'Статьи' }]} />
      <div className="toolbar"><Seg value={days} onChange={setDays} options={[{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }]} /></div>
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(r) => r.id} onRow={setOpen} empty="За период операций нет."
          foot={['Итого', `+${money(sumIn(all))}`, `−${money(sumOut(all))}`, signed(sumIn(all) - sumOut(all))]} />
      </Card>
      <Sheet open={!!open} title={open?.name ?? ''} onClose={() => setOpen(null)} wide>
        {open && (
          <div className="stack">
            <p className="muted">За {days} дней: поступило {money(open.inc)}, потрачено {money(open.out)}.</p>
            <div className="list" style={{ margin: '0 -16px' }}>
              {[...open.ops].sort((a, b) => b.amount - a.amount).slice(0, 8).map((o) => <OpRow key={o.id} op={o} />)}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ money */
type MoneyTab = 'now' | 'calendar' | 'analytics';
function MoneyPage() {
  const wide = useWide();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab: MoneyTab = raw === 'calendar' || raw === 'analytics' ? raw : 'now';
  const setTab = (t: MoneyTab) => { const q = new URLSearchParams(sp); q.set('tab', t); setSp(q, { replace: true }); };
  return (
    <Page title="Деньги">
      <Seg wide={!wide} value={tab} onChange={setTab} options={[{ value: 'now', label: 'Сейчас' }, { value: 'calendar', label: 'Календарь' }, { value: 'analytics', label: 'Аналитика' }]} />
      {tab === 'now' && <MoneyNow />}
      {tab === 'calendar' && <MoneyCalendar />}
      {tab === 'analytics' && <MoneyAnalytics />}
    </Page>
  );
}

/* --------------------------------------------------------------- objects */
function Objects() {
  const d = useData();
  const openLines = d.needs.flatMap((n) => n.lines).filter((l) => lineState(l) !== 'done').length;
  const delayed = d.tradeOrders.filter((o) => o.status === 'delayed').length;
  const urgent = d.needs.filter((n) => n.urgent && needState(n) !== 'done').length;
  return (
    <Page title="Объекты" path={[{ label: 'Главная', to: '/owner' }, { label: 'Объекты' }]}>
      <div className="grid cols-2">
        {d.objects.map((o) => {
          const v = objectView(d, o);
          const debts = d.requests.filter((r) => r.objectId === o.id && ['pending', 'approved', 'noted', 'clarify'].includes(r.status)).reduce((s, r) => s + r.amount, 0);
          const over = v.spent > o.planCost;
          const flags = [
            over && <Status key="over" kind="problem">Перерасход {money(v.spent - o.planCost)}</Status>,
            v.lateWorks > 0 && <Status key="late" kind="problem">{count(v.lateWorks, 'работа', 'работы', 'работ')} с прошедшим сроком</Status>,
            v.openLines > 0 && <Status key="lines" kind="wait">{count(v.openLines, 'позиция', 'позиции', 'позиций')} не обеспечено</Status>,
            v.openIssues > 0 && <Status key="issues" kind="wait">{count(v.openIssues, 'замечание', 'замечания', 'замечаний')}</Status>,
          ].filter(Boolean);
          return (
            <Card key={o.id} title={o.name} action={<Pill>{o.stage}</Pill>}>
              <div className="stack" style={{ gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>Выполнено</span><b className="num" style={{ fontWeight: 600 }}>{pct(v.progress)}</b>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <span>Затраты</span><span className={`num ${over ? 'neg' : ''}`}>{money(v.spent)} из {money(o.planCost)}</span>
                  </div>
                  <Track value={v.spent} max={o.planCost} />
                </div>
                {flags.length > 0 && <div className="btn-row">{flags}</div>}
                <Details>
                  <dl className="kv">
                    <dt>Адрес</dt><dd>{o.address}</dd>
                    <dt>Заказчик</dt><dd>{o.customer}</dd>
                    <dt>Стоимость по договору</dt><dd>{money(o.contractSum)}</dd>
                    <dt>Получено от заказчика</dt><dd>{money(v.income)} <span className="muted">· {pct(v.income / o.contractSum)}</span></dd>
                    <dt>Ожидаемый результат</dt><dd>{money(v.expectedResult)}</dd>
                    <dt>Обязательства по заявкам</dt><dd className={debts ? '' : 'muted'}>{money(debts)}</dd>
                  </dl>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <span>Работы</span><span className="num">сделано {pct(v.progress)} · принято {pct(v.accepted)}</span>
                    </div>
                    <Track value={v.accepted} second={v.progress} max={1} />
                  </div>
                </Details>
              </div>
            </Card>
          );
        })}
      </div>
      <Details label="Материалы по всем объектам">
        <Card flush>
          <List>
            <Row title="Позиции, которые ещё не обеспечены" value={openLines} />
            <Row title="Задержки поставок на склад" value={<span className={delayed ? 'neg' : ''}>{delayed}</span>} />
            <Row title="Срочные заявки объектов" value={<span className={urgent ? 'neg' : ''}>{urgent}</span>} />
          </List>
        </Card>
      </Details>
    </Page>
  );
}

export const routes = [
  { path: '/owner', element: <Home /> },
  { path: '/owner/approvals', element: <Approvals /> },
  { path: '/owner/money', element: <MoneyPage /> },
  { path: '/owner/objects', element: <Objects /> },
  // old addresses
  { path: '/owner/finance', element: <Go to="/owner/money" add={{ tab: 'now' }} /> },
  { path: '/owner/calendar', element: <Go to="/owner/money" add={{ tab: 'calendar' }} /> },
  { path: '/owner/analytics', element: <Go to="/owner/money" add={{ tab: 'analytics' }} /> },
  { path: '/owner/alerts', element: <Go to="/owner" /> },
];
