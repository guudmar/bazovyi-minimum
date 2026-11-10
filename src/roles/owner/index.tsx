// The owner's workspace: a management picture, not an operator's interface.
// Every screen answers one question first and lets the owner go from a total down to the operation behind it.
import { useState, type ReactNode } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { act, useData } from '../../data/store';
import {
  byId, flowOps, forecast, objectName, objectView, onHand, registersIn, registerBalance, sumIn, sumOut, transits, transitTotal,
  weeklyFlows, byArticle, lineState, needState, userName, transitAge, type Scope,
} from '../../data/select';
import { Btn, Card, Chips, DataTable, Empty, Finding, List, Money, More, Page, Pill, Row, Seg, Sheet, Stats, Tabs, Track, toast, type Col } from '../../ui/kit';
import { BarList, FlowChart, ForecastChart } from '../../ui/charts';
import { NoteSheet, OpRow, OpSheet, OperationForm, RequestCard, dueLabel, planStatus } from '../../shared/money';
import { Notifications } from '../../shared/common';
import { addDays, count, dRel, dShort, dWeek, daysBetween, money, moneySigned, pct } from '../../lib/format';
import type { Operation, PlanItem } from '../../data/types';

const signed = (v: number): ReactNode => <span className={v < 0 ? 'neg' : v > 0 ? 'pos' : 'muted'}>{moneySigned(v)}</span>;

/* ------------------------------------------------------------------ home */
function Home() {
  const d = useData();
  const [dir, setDir] = useState('all');
  const [form, setForm] = useState(false);
  const scope: Scope = dir === 'all' ? {} : { directionId: dir };
  const hand = onHand(d, scope);
  const inTransit = transitTotal(d, scope);
  const ops30 = flowOps(d, scope, addDays(d.today, -29), d.today);
  const inc = sumIn(ops30);
  const out = sumOut(ops30);
  const pending = d.requests.filter((r) => r.status === 'pending');
  const oldest = transits(d, scope)[0];
  const oldDays = oldest ? daysBetween(oldest.date, d.today) : 0;
  const week = d.plan.filter((p) => p.status !== 'paid' && p.date <= addDays(d.today, 7)).sort((a, b) => a.date.localeCompare(b.date));
  const openLines = d.needs.flatMap((n) => n.lines).filter((l) => lineState(l) !== 'done').length;
  const delayed = d.tradeOrders.filter((o) => o.status === 'delayed').length;
  const urgent = d.needs.filter((n) => n.urgent && needState(n) !== 'done').length;

  return (
    <Page
      title="Группа компаний"
      sub={oldest && oldDays >= 2
        ? `Перевод ${money(oldest.amount)} «${byId(d.registers, oldest.registerId)?.name} → ${byId(d.registers, oldest.toRegisterId)?.name}» ${transitAge(d, oldest)}: получатель не подтвердил получение.`
        : pending.length ? `${count(pending.length, 'заявка ждёт', 'заявки ждут', 'заявок ждут')} вашего решения.` : 'Переводы подтверждены, заявок на согласовании нет.'}
      actions={<Btn kind="primary" onClick={() => setForm(true)}>Записать операцию</Btn>}
    >
      <Chips value={dir} onChange={setDir} options={[{ value: 'all', label: 'Вся группа' }, ...d.directions.map((x) => ({ value: x.id, label: x.name }))]} />
      <Stats items={[
        { label: 'Деньги сейчас', value: money(hand + inTransit), lead: true, hint: `на счетах и в кассах ${money(hand)} · в пути ${money(inTransit)}` },
        { label: 'Поступило за 30 дней', value: `+${money(inc)}` },
        { label: 'Потрачено за 30 дней', value: money(out) },
        { label: 'Сальдо за 30 дней', value: signed(inc - out) },
        { label: 'Ждут решения', value: pending.length, zero: !pending.length, hint: pending.length ? `на ${money(pending.reduce((s, r) => s + r.amount, 0))}` : 'заявок нет' },
      ]} />

      <div className="grid split stretch">
        <Card title="Ждут вашего решения" className="d-last" action={<More to="/owner/approvals" />} flush
          foot={pending.length ? <><span className="muted">Всего на согласовании</span><b className="num" style={{ fontWeight: 700 }}>{money(pending.reduce((s, r) => s + r.amount, 0))}</b></> : undefined}>
          {pending.length ? (
            <List>
              {pending.slice(0, 4).map((r) => (
                <Row key={r.id} to="/owner/approvals" title={r.basis} sub={`${userName(d, r.authorId)} · ${dueLabel(d, r.due).text}`} value={money(r.amount)} money />
              ))}
            </List>
          ) : <Empty>Заявок на согласовании нет.</Empty>}
        </Card>
        <Card title="Поступления и расходы по неделям" note="8 недель">
          <FlowChart weeks={weeklyFlows(d, scope, 8)} />
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Где лежат деньги" action={<More to="/owner/finance">Финансы группы</More>} flush>
          <List>
            {d.entities.filter((e) => dir === 'all' || e.directionId === dir).map((e) => (
              <Row key={e.id} to="/owner/finance" title={e.name}
                sub={`${byId(d.directions, e.directionId)?.name} · ${count(registersIn(d, { entityId: e.id }).length, 'касса или счёт', 'кассы и счета', 'касс и счетов')}`}
                value={money(onHand(d, { entityId: e.id }))} money />
            ))}
            {inTransit > 0 && <Row title="В пути между своими кассами и счетами" sub={count(transits(d, scope).length, 'перевод', 'перевода', 'переводов')} value={money(inTransit)} />}
          </List>
        </Card>
        <Card title="Ближайшие 7 дней" action={<More to="/owner/calendar">Платёжный календарь</More>} flush>
          {week.length ? (
            <List>
              {week.slice(0, 5).map((p) => (
                <Row key={p.id} title={p.title} sub={`${dRel(p.date, d.today)} · ${planStatus(d, p).text.toLowerCase()}`}
                  value={p.flow === 'in' ? <span className="pos">+{money(p.amount)}</span> : `−${money(p.amount)}`} />
              ))}
            </List>
          ) : <Empty>На ближайшую неделю платежей и поступлений не запланировано.</Empty>}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Объекты" action={<More to="/owner/objects">Объекты и результаты</More>} flush>
          <List>
            {d.objects.map((o) => {
              const v = objectView(d, o);
              const flags = [v.lateWorks && count(v.lateWorks, 'работа с прошедшим сроком', 'работы с прошедшим сроком', 'работ с прошедшим сроком'), v.openIssues && count(v.openIssues, 'замечание', 'замечания', 'замечаний')].filter(Boolean);
              return <Row key={o.id} to="/owner/objects" title={o.name} sub={`${o.stage}${flags.length ? ' · ' + flags.join(' · ') : ''}`} value={pct(v.progress)} meta="выполнено" />;
            })}
          </List>
        </Card>
        <Card title="Материалы" flush>
          <List>
            <Row title="Позиции, которые ещё не обеспечены" value={openLines} />
            <Row title="Задержки поставок на склад" value={<span className={delayed ? 'neg' : ''}>{delayed}</span>} />
            <Row title="Срочные потребности объектов" value={<span className={urgent ? 'neg' : ''}>{urgent}</span>} />
          </List>
        </Card>
      </div>
      <OperationForm open={form} onClose={() => setForm(false)} defaultRegister="r7" />
    </Page>
  );
}

/* --------------------------------------------------------------- finance */
function Finance() {
  const d = useData();
  const [scope, setScope] = useState<Scope>({});
  const [days, setDays] = useState('30');
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

  return (
    <Page title="Финансы группы" sub="От общего остатка до конкретной операции: группа, направление, юридическое лицо, касса или счёт.">
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
        { label: reg ? 'Остаток' : 'Остаток на счетах и в кассах', value: money(onHand(d, scope)), lead: true, hint: transitTotal(d, scope) ? `ещё ${money(transitTotal(d, scope))} в пути` : 'переводов в пути нет' },
        { label: `Поступило за ${days} дней`, value: `+${money(sumIn(ops))}` },
        { label: `Потрачено за ${days} дней`, value: money(sumOut(ops)) },
      ]} />
      <p className="muted" style={{ fontSize: 13 }}>Переводы между своими кассами и счетами в поступления и расходы не входят.</p>

      <div className="grid split-even">
        <Card title={reg ? 'Операции' : ent ? 'Кассы и счета' : dirn ? 'Юридические лица' : 'Направления'} flush>
          {reg ? (
            regOps.length ? <List>{regOps.map((o) => <OpRow key={o.id} op={o} onClick={() => setOp(o)} />)}</List> : <Empty>За выбранный период операций нет.</Empty>
          ) : (
            <List>
              {!dirn && d.directions.map((x) => (
                <Row key={x.id} onClick={() => setScope({ directionId: x.id })} title={x.name}
                  sub={d.entities.filter((e) => e.directionId === x.id).map((e) => e.short).join(', ')} value={money(onHand(d, { directionId: x.id }))} money />
              ))}
              {dirn && !ent && d.entities.filter((e) => e.directionId === dirn.id).map((e) => (
                <Row key={e.id} onClick={() => setScope({ directionId: dirn.id, entityId: e.id })} title={e.name}
                  sub={registersIn(d, { entityId: e.id }).map((r) => r.name).join(', ')} value={money(onHand(d, { entityId: e.id }))} money />
              ))}
              {ent && registersIn(d, { entityId: ent.id }).map((r) => (
                <Row key={r.id} onClick={() => setScope({ ...scope, registerId: r.id })} title={r.name} sub={r.kind === 'bank' ? 'Банковский счёт' : 'Наличная касса'}
                  value={money(registerBalance(d, r.id))} money />
              ))}
            </List>
          )}
        </Card>
        <div className="stack">
          <Card title="На что потрачено" note={`${days} дней`}>
            {expenses.length ? <BarList rows={expenses.map((x) => ({ label: x.article.name, value: x.amount }))} /> : <Empty>Расходов за период нет.</Empty>}
          </Card>
          <Card title="Переводы в пути" flush>
            {tr.length ? <List>{tr.map((o) => <OpRow key={o.id} op={o} onClick={() => setOp(o)} />)}</List> : <Empty>Все переводы подтверждены получателями.</Empty>}
          </Card>
        </div>
      </div>
      <OpSheet op={op} onClose={() => setOp(null)} />
    </Page>
  );
}

/* -------------------------------------------------------------- calendar */
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

function Calendar() {
  const d = useData();
  const horizon = 14;
  const fc = forecast(d, horizon);
  const low = fc.reduce((a, b) => (b.balance < a.balance ? b : a), fc[0]);
  const items = d.plan.filter((p) => p.status !== 'paid' && p.date <= addDays(d.today, horizon)).sort((a, b) => a.date.localeCompare(b.date));
  const incoming = items.filter((p) => p.flow === 'in').reduce((s, p) => s + p.amount, 0);
  const outgoing = items.filter((p) => p.flow === 'out').reduce((s, p) => s + p.amount, 0);
  const unapproved = items.filter((p) => p.flow === 'out' && p.status === 'plan' && p.requestId).reduce((s, p) => s + p.amount, 0);
  return (
    <Page title="Платёжный календарь"
      sub={low.balance < 0
        ? `Кассовый разрыв ${dShort(low.date)}: по плану не хватит ${money(-low.balance)}.`
        : `Разрыва на ${horizon} дней по плану нет. Самый низкий остаток ${dShort(low.date)}: ${money(low.balance)}.`}>
      <Stats items={[
        { label: 'Деньги сейчас', value: money(fc[0].balance + fc[0].out - fc[0].in), lead: true, hint: 'на счетах, в кассах и в пути' },
        { label: `Ждём поступлений за ${horizon} дней`, value: `+${money(incoming)}` },
        { label: `К оплате за ${horizon} дней`, value: money(outgoing), hint: unapproved ? `из них ${money(unapproved)} ещё не согласовано` : undefined },
        { label: `Остаток через ${horizon} дней`, value: money(fc[fc.length - 1].balance) },
      ]} />
      <div className="grid split-even">
        <Card title={`Прогноз остатка на ${horizon} дней`} note="план, не факт">
          <ForecastChart days={fc} />
        </Card>
        <Card title="Платежи и поступления по дням" flush><CalendarList items={items} /></Card>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------- approvals */
function Approvals() {
  const d = useData();
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const [note, setNote] = useState<{ id: string; action: 'noted' | 'clarify' | 'rejected' } | null>(null);
  const open = d.requests.filter((r) => r.status === 'pending').sort((a, b) => a.due.localeCompare(b.due));
  const all = [...d.requests].sort((a, b) => b.date.localeCompare(a.date));
  const list = tab === 'open' ? open : all;
  const titles = { noted: 'Согласовать с замечаниями', clarify: 'Запросить уточнение', rejected: 'Отклонить заявку' };
  return (
    <Page title="Согласования"
      sub={open.length ? `${count(open.length, 'заявка ждёт', 'заявки ждут', 'заявок ждут')} решения на ${money(open.reduce((s, r) => s + r.amount, 0))}. Каждое решение остаётся в истории заявки.` : 'Все заявки рассмотрены.'}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Ждут решения', count: open.length }, { value: 'all', label: 'Все заявки', count: all.length }]} />
      {list.length === 0 && <Card><Empty>Заявок, которые ждут решения, сейчас нет.</Empty></Card>}
      <div className="grid cols-2">
        {list.map((r) => (
          <RequestCard key={r.id} r={r}>
            {r.status === 'pending' && (
              <div className="stack" style={{ gap: 8, marginTop: 4 }}>
                <Btn kind="primary" block onClick={() => { act.decideRequest(r.id, 'approved'); toast(`Заявка № ${r.num} согласована`); }}>Согласовать {money(r.amount)}</Btn>
                <div className="btn-row">
                  <Btn small onClick={() => setNote({ id: r.id, action: 'noted' })}>С замечаниями</Btn>
                  <Btn small onClick={() => setNote({ id: r.id, action: 'clarify' })}>Уточнить</Btn>
                  <Btn small kind="danger" onClick={() => setNote({ id: r.id, action: 'rejected' })}>Отклонить</Btn>
                </div>
              </div>
            )}
          </RequestCard>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, maxWidth: '76ch' }}>
        Лимиты и правила существенности пока не заданы, поэтому в демо на согласование попадает каждая заявка.
      </p>
      <NoteSheet open={!!note} title={note ? titles[note.action] : ''} label={note?.action === 'clarify' ? 'Что нужно уточнить' : 'Комментарий к решению'} action="Отправить" required
        onClose={() => setNote(null)}
        onSubmit={(text) => { if (note) { act.decideRequest(note.id, note.action, text); toast('Решение записано'); } setNote(null); }} />
    </Page>
  );
}

/* --------------------------------------------------------------- objects */
function Objects() {
  const d = useData();
  return (
    <Page title="Объекты и результаты" sub={`${count(d.objects.filter((o) => o.status === 'active').length, 'активный объект', 'активных объекта', 'активных объектов')}. Затраты и поступления считаются из денежных операций, выполнение из факта работ.`}>
      <div className="grid cols-2">
        {d.objects.map((o) => {
          const v = objectView(d, o);
          const debts = d.requests.filter((r) => r.objectId === o.id && ['pending', 'approved', 'noted', 'clarify'].includes(r.status)).reduce((s, r) => s + r.amount, 0);
          const over = v.spent > o.planCost;
          return (
            <Card key={o.id} title={o.name} action={<Pill>{o.stage}</Pill>}>
              <div className="stack" style={{ gap: 14 }}>
                <p className="muted">{o.address} · заказчик {o.customer}</p>
                <dl className="kv">
                  <dt>Стоимость по договору</dt><dd>{money(o.contractSum)}</dd>
                  <dt>Получено от заказчика</dt><dd>{money(v.income)} <span className="muted">· {pct(v.income / o.contractSum)}</span></dd>
                  <dt>Ожидаемый результат</dt><dd>{money(v.expectedResult)}</dd>
                  <dt>Обязательства по заявкам</dt><dd className={debts ? '' : 'muted'}>{money(debts)}</dd>
                </dl>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span>Затраты</span><span className={`num ${over ? 'neg' : ''}`}>{money(v.spent)} из {money(o.planCost)}</span>
                  </div>
                  <Track value={v.spent} max={o.planCost} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span>Работы</span><span className="num">выполнено {pct(v.progress)} · принято {pct(v.accepted)}</span>
                  </div>
                  <Track value={v.accepted} second={v.progress} max={1} />
                </div>
                <div className="btn-row">
                  {v.lateWorks > 0 && <Pill tone="negative">{count(v.lateWorks, 'работа', 'работы', 'работ')} с прошедшим сроком</Pill>}
                  {v.openLines > 0 && <Pill tone="warning">{count(v.openLines, 'позиция', 'позиции', 'позиций')} не обеспечено</Pill>}
                  {v.openIssues > 0 && <Pill>{count(v.openIssues, 'замечание', 'замечания', 'замечаний')}</Pill>}
                  {!v.lateWorks && !v.openLines && !v.openIssues && <Pill tone="positive">Отклонений нет</Pill>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------- analytics */
interface Slice { id: string; name: string; inc: number; out: number; ops: Operation[] }
function Analytics() {
  const d = useData();
  const [dim, setDim] = useState('direction');
  const [days, setDays] = useState('30');
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
    <Page title="Аналитика бизнеса" sub="Нажмите на строку, чтобы увидеть операции, из которых сложилась цифра.">
      <Chips value={dim} onChange={setDim} options={[{ value: 'direction', label: 'По направлениям' }, { value: 'entity', label: 'По юридическим лицам' }, { value: 'object', label: 'По объектам' }, { value: 'article', label: 'По статьям' }]} />
      <div className="toolbar"><Seg value={days} onChange={setDays} options={[{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '60', label: '60 дней' }]} /></div>
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(r) => r.id} onRow={setOpen} empty="За период операций нет."
          foot={['Итого', `+${money(sumIn(all))}`, `−${money(sumOut(all))}`, signed(sumIn(all) - sumOut(all))]} />
      </Card>
      <Sheet open={!!open} title={open?.name ?? ''} onClose={() => setOpen(null)} wide>
        {open && (
          <div className="stack">
            <p className="muted">За {days} дней: поступило {money(open.inc)}, потрачено {money(open.out)}. Самые крупные операции:</p>
            <div className="list" style={{ margin: '0 -16px' }}>
              {[...open.ops].sort((a, b) => b.amount - a.amount).slice(0, 8).map((o) => <OpRow key={o.id} op={o} />)}
            </div>
          </div>
        )}
      </Sheet>
    </Page>
  );
}

function Alerts() {
  const d = useData();
  const late = transits(d).filter((o) => daysBetween(o.date, d.today) >= 2);
  return (
    <>
      {late.length > 0 && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <Finding icon={<TriangleAlert size={18} />}>
            {count(late.length, 'перевод', 'перевода', 'переводов')} на {money(late.reduce((s, o) => s + o.amount, 0))} в пути дольше двух дней. Подробности в разделе «Финансы группы».
          </Finding>
        </div>
      )}
      <Notifications title="Уведомления и контроль" sub="Только значимые события: кассовый разрыв, задержка поставки, превышение бюджета, заявка на решение." />
    </>
  );
}

export const routes = [
  { path: '/owner', element: <Home /> },
  { path: '/owner/finance', element: <Finance /> },
  { path: '/owner/calendar', element: <Calendar /> },
  { path: '/owner/approvals', element: <Approvals /> },
  { path: '/owner/objects', element: <Objects /> },
  { path: '/owner/analytics', element: <Analytics /> },
  { path: '/owner/alerts', element: <Alerts /> },
];
