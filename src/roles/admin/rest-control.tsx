// «Застряло» (the card on «Дела»), «Настройки» and two of its pages: «Пользователи и права», «Журнал изменений».
import { useState, type ReactNode } from 'react';
import { BookOpen, Calculator, History, Users as UsersIcon } from 'lucide-react';
import { act, useData } from '../../data/store';
import { byId, material, needState, objectName, workToPresent } from '../../data/select';
import { Avatar, Btn, Card, Chips, DataTable, Details, List, Page, Row, Sheet, Status, toast, useWide, type Col, type Crumb } from '../../ui/kit';
import { ROLE_LABEL } from '../../shell/nav';
import { count, dFull, dShort, daysBetween, qty } from '../../lib/format';
import type { AuditArea, AuditEntry, Data, RoleId, User } from '../../data/types';
import { Wrap, dash, waiting } from './rest-bits';

export const SETTINGS: Crumb = { label: 'Настройки', to: '/admin/settings' };

/* ----------------------------------------------------------------- stuck */
interface Stuck {
  id: string;
  title: string;
  sub: string;
  /** how long, in words */
  how: string;
  /** whole days it has been waiting; 0 for today */
  age: number;
  /** past a date somebody promised */
  late?: boolean;
  to?: string;
}

/**
 * Where a process stopped between two people and nobody has a task for it. Computed from the rows, nothing is stored.
 * Transfers, the bank, acts and measurements to check are not here: they are already in «Нужно сделать».
 */
export function stuckRows(d: Data): Stuck[] {
  const today = d.today;
  const age = (since: string): number => Math.max(0, daysBetween(since, today));

  const needs = d.needs.filter((n) => needState(n) === 'new').map((n): Stuck => ({
    id: `need-${n.id}`, age: age(n.date),
    title: `Заявка на материалы № ${n.num}${n.urgent ? ', срочная' : ''}`,
    sub: `${objectName(d, n.objectId)} · ${count(n.lines.length, 'позиция', 'позиции', 'позиций')} · ждёт менеджера`,
    how: waiting(n.date, today), to: `/admin/requests?tab=tmc&open=${n.id}`,
  }));

  const orders = d.tradeOrders.filter((o) => o.status !== 'arrived' && (o.status === 'delayed' || o.eta < today)).map((o): Stuck => {
    const m = material(d, o.materialId);
    const n = daysBetween(o.eta, today);
    return {
      id: `order-${o.id}`, age: Math.max(0, n), late: true,
      title: `Заказ на склад № ${o.num}: ${m.name}`,
      sub: `${o.supplier} · ${qty(o.qty, m.unit)} · ${n > 0 ? `ждали ${dShort(o.eta)}` : `новый срок ${dShort(o.eta)}`}`,
      how: n > 0 ? count(n, 'день', 'дня', 'дней') : 'задержан',
      to: o.objectId ? `/admin/objects/${o.objectId}?tab=materials` : undefined,
    };
  });

  const deliveries = d.deliveries.filter((x) => x.status === 'expected' && x.eta <= today).map((x): Stuck => {
    const first = x.lines[0];
    const what = x.lines.length === 1 && first
      ? `${material(d, first.materialId).name}, ${qty(first.qty, material(d, first.materialId).unit)}`
      : count(x.lines.length, 'позиция', 'позиции', 'позиций');
    return {
      id: `delivery-${x.id}`, age: age(x.eta), late: x.eta < today,
      title: `Поставка № ${x.num} не подтверждена`,
      sub: `${objectName(d, x.objectId)} · ${x.source} · ${what}`,
      how: waiting(x.eta, today), to: `/admin/objects/${x.objectId}?tab=materials`,
    };
  });

  const works = d.works.map((w) => ({ w, rest: workToPresent(d, w) })).filter((x) => x.rest > 0).map(({ w, rest }): Stuck => {
    const since = w.facts.reduce((m, f) => (f.date > m ? f.date : m), w.facts[0]?.date ?? today);
    return {
      id: `work-${w.id}`, age: age(since),
      title: `Без акта: ${w.name}`,
      sub: `${objectName(d, w.objectId)} · ${qty(rest, w.unit)} · сделано ${dShort(since)}`,
      how: waiting(since, today), to: `/admin/objects/${w.objectId}?tab=works`,
    };
  });

  return [...needs, ...orders, ...deliveries, ...works].sort((a, b) => Number(!!b.late) - Number(!!a.late) || b.age - a.age);
}

/** Stuck processes as plain rows: the oldest first, five visible, the rest one tap deeper. Nothing stuck, no card. */
export function StuckCard({ limit = 5 }: { limit?: number }) {
  const d = useData();
  const rows = stuckRows(d);
  if (!rows.length) return null;
  const row = (x: Stuck) => <Row key={x.id} to={x.to} wrap title={x.title} sub={x.sub} value={x.late ? <span className="neg">{x.how}</span> : x.how} />;
  return (
    <Card title="Застряло" note={String(rows.length)} flush>
      <List>
        {rows.slice(0, limit).map(row)}
        {rows.length > limit && <Details label={`Ещё ${rows.length - limit}`}><List>{rows.slice(limit).map(row)}</List></Details>}
      </List>
    </Card>
  );
}

/* --------------------------------------------------------------- settings */
export function Settings() {
  const d = useData();
  const queue = d.sources.filter((s) => s.status !== 'matched').length;
  const icon = { size: 20, color: 'var(--muted)' };
  return (
    <Page title="Настройки">
      <Card flush>
        <List>
          <Row to="/admin/refs" media={<BookOpen {...icon} />} title="Справочники" wrap
            sub="Материалы, статьи, юрлица и счета, контрагенты, новые позиции поставщиков"
            side={queue ? <Status kind="wait">{count(queue, 'новая', 'новые', 'новых')}</Status> : undefined} />
          <Row to="/admin/norms" media={<Calculator {...icon} />} title="Нормы расхода" sub={count(d.norms.length, 'вид работ', 'вида работ', 'видов работ')} />
          <Row to="/admin/users" media={<UsersIcon {...icon} />} title="Пользователи и права" sub={count(d.users.length, 'пользователь', 'пользователя', 'пользователей')} />
          <Row to="/admin/audit" media={<History {...icon} />} title="Журнал изменений" sub="Кто, что и когда менял" />
        </List>
      </Card>
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
  { what: 'Записывает деньги', who: { owner: 'own', admin: 'yes' } },
  { what: 'Создаёт заявки на материалы', who: { foreman: 'yes' } },
  { what: 'Решает, откуда взять материал', who: { manager: 'yes' } },
  { what: 'Закупает', who: { supplier: 'yes' } },
  { what: 'Подтверждает получение', who: { foreman: 'yes' } },
  { what: 'Отмечает сделанные работы', who: { foreman: 'yes' } },
  { what: 'Принимает объёмы', who: { admin: 'yes' } },
  { what: 'Согласует заявки на деньги', who: { owner: 'yes' } },
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
    <Page title="Пользователи и права" path={[SETTINGS, { label: 'Пользователи и права' }]}
      sub={uncovered.length ? <span className="neg">Нет прораба с доступом: {uncovered.map((o) => o.name).join(', ')}.</span> : undefined}>
      <Card flush>
        <DataTable cols={cols} rows={d.users} keyOf={(u) => u.id} onRow={(u) => setUserId(u.id)} empty="Пользователей ещё нет." />
      </Card>
      <Details label="Что может каждая роль">
        <Card flush>
          <DataTable cols={rightCols} rows={RIGHTS} keyOf={(r) => r.what} />
        </Card>
        <p className="muted" style={{ fontSize: 13 }}>Права задаются ролью. «Свои»: собственник записывает деньги только по своей кассе.</p>
      </Details>
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
    <Sheet open title={user.name} onClose={onClose} dirty={changed}
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
            <div className="section-title" style={{ margin: '0 0 2px' }}>Видит объекты</div>
            <div className="list" style={{ margin: '0 -16px' }}>
              {d.objects.map((o) => (
                <label key={o.id} className="row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={ids.includes(o.id)} onChange={() => toggle(o.id)}
                    style={{ width: 18, height: 18, margin: 0, flex: 'none', accentColor: 'var(--primary)' }} />
                  <div className="row-main">
                    <div className="row-title">{o.name}</div>
                    <div className="row-sub">{o.stage}{o.foremanId === user.id ? ' · прораб этого объекта' : ''}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : <p>Видит все объекты.</p>}
        {history.length > 0 && (
          <Details label="История доступа">
            {history.map((h) => (
              <p key={h.id} style={{ marginBottom: 4 }}>
                <span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}{h.before || h.after ? <>. {h.before ?? '—'} → {h.after ?? '—'}</> : null}
              </p>
            ))}
          </Details>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ audit */
const AREAS: AuditArea[] = ['Деньги', 'Заявки', 'ТМЦ', 'Нормативы', 'АВР', 'Геометрия', 'Доступ', 'Справочники'];
/** The stored area names are kept; only the words on screen are plain. */
const AREA_LABEL: Record<AuditArea, string> = {
  'Деньги': 'Деньги', 'Заявки': 'Заявки', 'ТМЦ': 'Материалы', 'Нормативы': 'Нормы', 'АВР': 'АВР', 'Геометрия': 'Замеры', 'Доступ': 'Доступ', 'Справочники': 'Справочники',
};

export function Audit() {
  const d = useData();
  const wide = useWide();
  const [area, setArea] = useState<'all' | AuditArea>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const all = [...d.audit].sort((a, b) => b.at.localeCompare(a.at));
  const rows = area === 'all' ? all : all.filter((a) => a.area === area);
  const open = byId(d.audit, openId);
  const change = (a: AuditEntry): ReactNode => (a.before || a.after ? <>{a.before ?? dash} → {a.after ?? dash}</> : dash);
  const cols: Col<AuditEntry>[] = wide ? [
    { head: 'Дата', cell: (a) => <span className="nowrap">{dShort(a.at)}</span> },
    { head: 'Кто', cell: (a) => <span className="nowrap">{a.by}</span> },
    { head: 'Где', cell: (a) => AREA_LABEL[a.area] },
    { head: 'Что изменилось', cell: (a) => a.text },
    { head: 'Было → стало', cell: change },
  ] : [
    { head: 'Что изменилось', phone: 'title', cell: (a) => <Wrap>{a.text}</Wrap> },
    { head: 'Кто', phone: 'sub', cell: (a) => a.by },
    { head: 'Где', phone: 'sub', cell: (a) => (a.before || a.after ? <>{AREA_LABEL[a.area]}: {change(a)}</> : AREA_LABEL[a.area]) },
    { head: 'Дата', phone: 'meta', cell: (a) => dShort(a.at) },
  ];
  return (
    <Page title="Журнал изменений" path={[SETTINGS, { label: 'Журнал изменений' }]}>
      <Chips value={area} onChange={setArea} options={[
        { value: 'all', label: 'Все', count: all.length },
        ...AREAS.map((x) => ({ value: x, label: AREA_LABEL[x], count: all.filter((a) => a.area === x).length })),
      ]} />
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(a) => a.id} onRow={(a) => setOpenId(a.id)}
          empty={area === 'all' ? 'В журнале ещё нет записей.' : 'Здесь изменений ещё не было.'} />
      </Card>
      <Sheet open={!!open} title="Запись журнала" onClose={() => setOpenId(null)}>
        {open && (
          <dl className="kv left">
            <dt>Дата</dt><dd>{dFull(open.at)}</dd>
            <dt>Кто</dt><dd>{open.by}</dd>
            <dt>Где</dt><dd>{AREA_LABEL[open.area]}</dd>
            <dt>Что изменилось</dt><dd>{open.text}</dd>
            <dt>Было</dt><dd>{open.before ?? dash}</dd>
            <dt>Стало</dt><dd>{open.after ?? dash}</dd>
          </dl>
        )}
      </Sheet>
    </Page>
  );
}
