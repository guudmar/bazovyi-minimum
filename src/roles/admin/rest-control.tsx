// «Контроль процессов», «Пользователи и права», «Журнал изменений»: where things are stuck, who may do what, and who changed what.
import { useState, type ReactNode } from 'react';
import { act, useData } from '../../data/store';
import { byId, material, needState, objectName, transitAge, transits, userName, workToPresent } from '../../data/select';
import { Avatar, Btn, Card, Chips, DataTable, Empty, List, Page, Row, Sheet, Stats, toast, useWide, type Col } from '../../ui/kit';
import { opTitle } from '../../shared/money';
import { ROLE_LABEL } from '../../shell/nav';
import { addDays, count, dFull, dShort, daysBetween, money, qty } from '../../lib/format';
import type { AuditArea, AuditEntry, Data, RoleId, User } from '../../data/types';
import { Wrap, dash, waiting } from './rest-bits';

/* -------------------------------------------------------------- processes */
interface Stuck {
  id: string;
  /** what */
  title: string;
  /** where */
  sub: string;
  /** how long, in words */
  how: string;
  meta: string;
  /** whole days it has been waiting; 0 for today */
  age: number;
  /** past a date somebody promised */
  late?: boolean;
  to?: string;
  /** the same item as part of a sentence */
  phrase: string;
}
interface Group { id: string; title: string; short: string; empty: string; rows: Stuck[] }

/** Every place where a process stopped between two people. Computed from the rows, nothing is stored. */
function stuckGroups(d: Data): Group[] {
  const today = d.today;
  const age = (since: string): number => Math.max(0, daysBetween(since, today));
  const oldestFirst = (rows: Stuck[]): Stuck[] => rows.sort((a, b) => b.age - a.age);
  const reg = (id?: string): string => byId(d.registers, id)?.name ?? '—';

  const needs = d.needs.filter((n) => needState(n) === 'new').map((n): Stuck => ({
    id: n.id, age: age(n.date),
    title: `Потребность № ${n.num}${n.urgent ? ', срочная' : ''}`,
    sub: `${objectName(d, n.objectId)} · ${count(n.lines.length, 'позиция', 'позиции', 'позиций')} · ${userName(d, n.authorId)}`,
    how: waiting(n.date, today), meta: `с ${dShort(n.date)}`, to: '/admin/requests?tab=tmc',
    phrase: `потребность № ${n.num} по объекту «${objectName(d, n.objectId)}» без маршрута`,
  }));

  const orders = d.tradeOrders.filter((o) => o.status !== 'arrived' && (o.status === 'delayed' || o.eta < today)).map((o): Stuck => {
    const m = material(d, o.materialId);
    const n = daysBetween(o.eta, today);
    return {
      id: o.id, age: Math.max(0, n), late: true,
      title: `Заказ № ${o.num}: ${m.name}`,
      sub: `${o.supplier} · ${qty(o.qty, m.unit)} · ${o.objectId ? objectName(d, o.objectId) : 'на склад'}`,
      how: n > 0 ? count(n, 'день', 'дня', 'дней') : 'задержан', meta: n > 0 ? `ждали ${dShort(o.eta)}` : `новый срок ${dShort(o.eta)}`,
      phrase: `заказ № ${o.num} на склад, ${o.supplier}`,
    };
  });

  const deliveries = d.deliveries.filter((x) => x.status === 'expected' && x.eta <= today).map((x): Stuck => {
    const first = x.lines[0];
    const what = x.lines.length === 1 && first
      ? `${material(d, first.materialId).name}, ${qty(first.qty, material(d, first.materialId).unit)}`
      : count(x.lines.length, 'позиция', 'позиции', 'позиций');
    return {
      id: x.id, age: age(x.eta), late: x.eta < today,
      title: `Поставка № ${x.num}: ${x.source}`,
      sub: `${objectName(d, x.objectId)} · ${what}`,
      how: waiting(x.eta, today), meta: `прибытие ${dShort(x.eta)}`, to: `/admin/objects/${x.objectId}?tab=materials`,
      phrase: `поставка № ${x.num} на объект «${objectName(d, x.objectId)}» без подтверждения получения`,
    };
  });

  const works = d.works.map((w) => ({ w, rest: workToPresent(d, w) })).filter((x) => x.rest > 0).map(({ w, rest }): Stuck => {
    const since = w.facts.reduce((m, f) => (f.date > m ? f.date : m), w.facts[0]?.date ?? today);
    return {
      id: w.id, age: age(since),
      title: w.name,
      sub: `${objectName(d, w.objectId)} · ${qty(rest, w.unit)} без акта`,
      how: waiting(since, today), meta: `факт от ${dShort(since)}`, to: `/admin/objects/${w.objectId}?tab=works`,
      phrase: `работа «${w.name}» на объекте «${objectName(d, w.objectId)}» без акта`,
    };
  });

  const avrs = d.avrs.filter((a) => a.status === 'review').map((a): Stuck => ({
    id: a.id, age: age(a.date),
    title: `АВР № ${a.num}`,
    sub: `${objectName(d, a.objectId)} · ${a.by} · ${count(a.lines.length, 'работа', 'работы', 'работ')}`,
    how: waiting(a.date, today), meta: `от ${dShort(a.date)}`, to: `/admin/objects/${a.objectId}?tab=avr`,
    phrase: `АВР № ${a.num} по объекту «${objectName(d, a.objectId)}» без проверки`,
  }));

  const sent = transits(d).map((op): Stuck => ({
    id: op.id, age: age(op.date), late: daysBetween(op.date, today) >= 2,
    title: `Перевод ${money(op.amount)}`,
    sub: `${reg(op.registerId)} → ${reg(op.toRegisterId)}${op.comment ? ` · ${op.comment}` : ''}`,
    how: transitAge(d, op), meta: `с ${dShort(op.date)}`, to: '/admin/transits',
    phrase: `перевод ${money(op.amount)} «${reg(op.registerId)} → ${reg(op.toRegisterId)}» без подтверждения получения`,
  }));

  const bank = d.operations.filter((op) => op.bank === 'unmatched').map((op): Stuck => ({
    id: op.id, age: age(op.date),
    title: `${op.kind === 'in' ? '+' : op.kind === 'out' ? '−' : ''}${money(op.amount)} · ${opTitle(d, op)}`,
    sub: `${reg(op.registerId)}${op.comment ? ` · ${op.comment}` : ''}`,
    how: waiting(op.date, today), meta: `от ${dShort(op.date)}`, to: '/admin/transits',
    phrase: `операция на ${money(op.amount)}, ${opTitle(d, op)}, без сверки с банком`,
  }));

  return [
    { id: 'needs', title: 'Потребность отправлена и не обработана', short: 'Потребности без маршрута', empty: 'Все потребности взяты в работу.', rows: oldestFirst(needs) },
    { id: 'orders', title: 'Заказ на склад просрочен', short: 'Просроченные заказы на склад', empty: 'Просроченных заказов на склад нет.', rows: oldestFirst(orders) },
    { id: 'deliveries', title: 'Материал отправлен, получение не подтверждено', short: 'Поставки без подтверждения', empty: 'Все прибывшие поставки подтверждены прорабами.', rows: oldestFirst(deliveries) },
    { id: 'works', title: 'Работа выполнена и не предъявлена к приёмке', short: 'Работы без акта', empty: 'Все выполненные объёмы вошли в акты.', rows: oldestFirst(works) },
    { id: 'avrs', title: 'АВР сформирован и не проверен', short: 'АВР без проверки', empty: 'Актов, которые ждут проверки, нет.', rows: oldestFirst(avrs) },
    { id: 'transits', title: 'Перевод ждёт подтверждения', short: 'Переводы без подтверждения', empty: 'Все переводы подтверждены получателями.', rows: oldestFirst(sent) },
    { id: 'bank', title: 'Операция не сопоставлена с банком', short: 'Операции без сверки', empty: 'Все банковские операции сопоставлены с выпиской.', rows: oldestFirst(bank) },
  ];
}

export function Processes() {
  const d = useData();
  const groups = stuckGroups(d);
  const all = groups.flatMap((g) => g.rows);
  const busy = groups.filter((g) => g.rows.length > 0).length;
  const oldest = all.reduce<Stuck | undefined>((a, b) => (!a || b.age > a.age ? b : a), undefined);
  const top = [...groups].sort((a, b) => b.rows.length - a.rows.length).slice(0, 3);
  return (
    <Page title="Контроль процессов"
      sub={oldest
        ? `Дольше всего ждёт ${oldest.phrase}: ${oldest.age > 0 ? count(oldest.age, 'день', 'дня', 'дней') : 'с сегодняшнего дня'}.`
        : 'Зависших шагов нет: потребности, поставки, акты и переводы идут без задержек.'}>
      <Stats items={[
        { label: 'Зависло в процессах', value: all.length, lead: true, zero: !all.length, hint: all.length ? `в ${count(busy, 'процессе', 'процессах', 'процессах')} из ${groups.length}` : 'все процессы идут без задержек' },
        ...top.map((g) => ({ label: g.short, value: g.rows.length, zero: !g.rows.length })),
      ]} />
      <div className="grid cols-2">
        {groups.map((g) => (
          <Card key={g.id} title={g.title} note={String(g.rows.length)} flush>
            {g.rows.length ? (
              <List>
                {g.rows.map((x) => (
                  <Row key={x.id} to={x.to} wrap title={x.title} sub={x.sub} value={x.late ? <span className="neg">{x.how}</span> : x.how} meta={x.meta} />
                ))}
              </List>
            ) : <Empty>{g.empty}</Empty>}
          </Card>
        ))}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ users */
const ROLES: RoleId[] = ['foreman', 'owner', 'manager', 'supplier', 'admin'];
const ROLE_SHORT: Record<RoleId, string> = { foreman: 'Прораб', owner: 'Собственник', manager: 'Менеджер', supplier: 'Снабженец', admin: 'Экономист' };
type Can = 'yes' | 'own';
interface Right { what: string; who: Partial<Record<RoleId, Can>> }
/** How the application actually works. The owner enters operations only for his own register, hence «свои». */
const RIGHTS: Right[] = [
  { what: 'Видит деньги группы', who: { owner: 'yes', admin: 'yes' } },
  { what: 'Вносит денежные операции', who: { owner: 'own', admin: 'yes' } },
  { what: 'Создаёт потребности', who: { foreman: 'yes' } },
  { what: 'Распределяет потребности', who: { manager: 'yes' } },
  { what: 'Закупает', who: { supplier: 'yes' } },
  { what: 'Подтверждает получение', who: { foreman: 'yes' } },
  { what: 'Фиксирует факт работ', who: { foreman: 'yes' } },
  { what: 'Принимает объёмы', who: { admin: 'yes' } },
  { what: 'Согласует заявки', who: { owner: 'yes' } },
  { what: 'Меняет нормы и справочники', who: { admin: 'yes' } },
];
const can = (v?: Can): ReactNode => (v === 'yes' ? 'да' : v === 'own' ? 'свои' : dash);

export function Users() {
  const d = useData();
  const wide = useWide();
  const [userId, setUserId] = useState<string | null>(null);
  const user = byId(d.users, userId);
  const foremen = d.users.filter((u) => u.role === 'foreman');
  const uncovered = d.objects.filter((o) => !foremen.some((u) => u.objectIds?.includes(o.id)));
  const access = (u: User): ReactNode => {
    if (u.role !== 'foreman') return 'Все объекты';
    const names = d.objects.filter((o) => u.objectIds?.includes(o.id)).map((o) => o.name);
    return names.length ? names.join(', ') : 'Нет объектов';
  };
  const cols: Col<User>[] = [
    { head: 'Имя', phone: 'title', cell: (u) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 500 }}><Avatar user={u} small />{u.name}</span> },
    { head: 'Роль', phone: 'sub', cell: (u) => ROLE_LABEL[u.role] },
    { head: 'Доступ к объектам', phone: 'sub', cell: access },
  ];
  const rightCols: Col<Right>[] = wide ? [
    { head: 'Действие', cell: (r) => r.what },
    ...ROLES.map((role): Col<Right> => ({ head: ROLE_SHORT[role], cell: (r) => can(r.who[role]) })),
  ] : [
    { head: 'Действие', phone: 'title', cell: (r) => <Wrap>{r.what}</Wrap> },
    { head: 'Кто', phone: 'sub', cell: (r) => ROLES.filter((x) => r.who[x]).map((x) => ROLE_SHORT[x].toLowerCase() + (r.who[x] === 'own' ? ' (свои)' : '')).join(', ') },
  ];
  return (
    <Page title="Пользователи и права"
      sub={uncovered.length
        ? `Нет прораба с доступом: ${uncovered.map((o) => o.name).join(', ')}.`
        : `${count(d.users.length, 'пользователь', 'пользователя', 'пользователей')}, все объекты (${d.objects.length}) закреплены за прорабами.`}>
      <Card title="Пользователи" note={count(foremen.length, 'прораб', 'прораба', 'прорабов')} flush>
        <DataTable cols={cols} rows={d.users} keyOf={(u) => u.id} onRow={(u) => setUserId(u.id)} empty="Пользователей ещё нет." />
      </Card>
      <Card title="Что может каждая роль" flush
        foot={<p className="muted" style={{ fontSize: 13, paddingTop: 8 }}>Права заданы ролью и здесь не меняются. По объектам настраивается только доступ прорабов. «Свои» у собственника: операции по кассе собственников.</p>}>
        <DataTable cols={rightCols} rows={RIGHTS} keyOf={(r) => r.what} />
      </Card>
      {user && <UserSheet key={user.id} user={user} onClose={() => setUserId(null)} />}
    </Page>
  );
}

function UserSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const d = useData();
  const before = user.objectIds ?? [];
  const [ids, setIds] = useState<string[]>(before);
  const foreman = user.role === 'foreman';
  const changed = ids.length !== before.length || ids.some((x) => !before.includes(x));
  const rights = RIGHTS.filter((r) => r.who[user.role]);
  const history = d.audit.filter((a) => a.area === 'Доступ' && a.text.startsWith(user.name));
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const save = () => {
    const next = d.objects.filter((o) => ids.includes(o.id)).map((o) => o.id);
    act.setUserObjects(user.id, next);
    toast(`${user.name}: доступ к объектам изменён, ${next.length ? count(next.length, 'объект', 'объекта', 'объектов') : 'объектов нет'}`);
    onClose();
  };
  return (
    <Sheet open title={user.name} onClose={onClose}
      foot={foreman ? <><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!changed} onClick={save}>Сохранить доступ</Btn></> : undefined}>
      <div className="stack" style={{ gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Avatar user={user} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{ROLE_LABEL[user.role]}</div>
            <div className="muted">{rights.length ? rights.map((r) => r.what.toLowerCase() + (r.who[user.role] === 'own' ? ' (свои)' : '')).join(', ') : 'особых прав нет'}</div>
          </div>
        </div>
        {foreman ? (
          <div>
            <div className="section-title" style={{ margin: '0 0 2px' }}>Доступ к объектам</div>
            <div className="list" style={{ margin: '0 -16px' }}>
              {d.objects.map((o) => (
                <label key={o.id} className="row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={ids.includes(o.id)} onChange={() => toggle(o.id)}
                    style={{ width: 18, height: 18, margin: 0, flex: 'none', accentColor: 'var(--primary)' }} />
                  <div className="row-main">
                    <div className="row-title">{o.name}</div>
                    <div className="row-sub">{o.stage}{o.foremanId === user.id ? ' · назначен прорабом объекта' : ''}</div>
                  </div>
                </label>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Прораб видит и ведёт только отмеченные объекты. Изменение попадёт в журнал.</p>
          </div>
        ) : (
          <p className="muted">Эта роль видит все объекты группы. Доступ по объектам настраивается только для прорабов.</p>
        )}
        {history.length > 0 && (
          <div>
            <div className="section-title" style={{ margin: '0 0 6px' }}>История доступа</div>
            {history.map((h) => (
              <p key={h.id} style={{ marginBottom: 4 }}>
                <span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}{h.before || h.after ? <>. {h.before ?? '—'} → {h.after ?? '—'}</> : null}
              </p>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ audit */
const AREAS: AuditArea[] = ['Деньги', 'Заявки', 'ТМЦ', 'Нормативы', 'АВР', 'Геометрия', 'Доступ', 'Справочники'];

export function Audit() {
  const d = useData();
  const wide = useWide();
  const [area, setArea] = useState<'all' | AuditArea>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const all = [...d.audit].sort((a, b) => b.at.localeCompare(a.at));
  const rows = area === 'all' ? all : all.filter((a) => a.area === area);
  const open = byId(d.audit, openId);
  const week = all.filter((a) => a.at >= addDays(d.today, -6));
  const busiest = AREAS.map((x) => ({ x, n: week.filter((a) => a.area === x).length })).sort((a, b) => b.n - a.n)[0];
  const change = (a: AuditEntry): ReactNode => (a.before || a.after ? <>{a.before ?? dash} → {a.after ?? dash}</> : dash);
  const cols: Col<AuditEntry>[] = wide ? [
    { head: 'Дата', cell: (a) => <span className="nowrap">{dShort(a.at)}</span> },
    { head: 'Кто', cell: (a) => <span className="nowrap">{a.by}</span> },
    { head: 'Область', cell: (a) => a.area },
    { head: 'Что изменилось', cell: (a) => a.text },
    { head: 'Было → стало', cell: change },
  ] : [
    { head: 'Что изменилось', phone: 'title', cell: (a) => <Wrap>{a.text}</Wrap> },
    { head: 'Кто', phone: 'sub', cell: (a) => a.by },
    { head: 'Область', phone: 'sub', cell: (a) => (a.before || a.after ? <>{a.area}: {change(a)}</> : a.area) },
    { head: 'Дата', phone: 'meta', cell: (a) => dShort(a.at) },
  ];
  return (
    <Page title="Журнал изменений"
      sub={week.length
        ? `За 7 дней ${count(week.length, 'изменение', 'изменения', 'изменений')}, больше всего в области «${busiest.x}».`
        : all.length ? `За 7 дней изменений не было, последнее от ${dShort(all[0].at)}.` : 'В журнале ещё нет записей.'}>
      <Chips value={area} onChange={setArea} options={[
        { value: 'all', label: 'Все', count: all.length },
        ...AREAS.map((x) => ({ value: x, label: x, count: all.filter((a) => a.area === x).length })),
      ]} />
      <Card title={area === 'all' ? 'Все изменения' : area} flush>
        <DataTable cols={cols} rows={rows} keyOf={(a) => a.id} onRow={(a) => setOpenId(a.id)}
          empty={area === 'all' ? 'В журнале ещё нет записей.' : `В области «${area}» изменений ещё не было.`} />
      </Card>
      <Sheet open={!!open} title="Запись журнала" onClose={() => setOpenId(null)}>
        {open && (
          <dl className="kv left">
            <dt>Дата</dt><dd>{dFull(open.at)}</dd>
            <dt>Кто</dt><dd>{open.by}</dd>
            <dt>Область</dt><dd>{open.area}</dd>
            <dt>Что изменилось</dt><dd>{open.text}</dd>
            <dt>Было</dt><dd>{open.before ?? dash}</dd>
            <dt>Стало</dt><dd>{open.after ?? dash}</dd>
          </dl>
        )}
      </Sheet>
    </Page>
  );
}
