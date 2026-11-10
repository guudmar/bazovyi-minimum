// Sections every role has: tasks, notifications, search, profile.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { act, useData, useUser } from '../data/store';
import { noticesFor, search, tasksFor } from '../data/select';
import { Avatar, Btn, Card, Empty, List, Page, Pill, Row, toast } from '../ui/kit';
import { count, dRel } from '../lib/format';
import { ROLE_ABOUT, ROLE_LABEL } from '../shell/nav';
import type { RoleId } from '../data/types';

export function Tasks() {
  const d = useData();
  const u = useUser();
  const tasks = tasksFor(d, u);
  return (
    <Page title="Мои задачи" sub={tasks.length ? `${count(tasks.length, 'действие ждёт', 'действия ждут', 'действий ждут')} вас. Задачи собираются сами из состояния процессов.` : undefined}>
      <Card flush>
        {tasks.length ? (
          <List>
            {tasks.map((t) => (
              <Row key={t.id + t.title} to={t.to} wrap title={t.title} sub={t.sub}
                side={t.tone === 'negative' ? <Pill tone="negative">Срочно</Pill> : undefined} />
            ))}
          </List>
        ) : <div className="card-body"><Empty>Сейчас от вас ничего не требуется.</Empty></div>}
      </Card>
    </Page>
  );
}

export function Notifications({ title = 'Уведомления', sub }: { title?: string; sub?: string }) {
  const d = useData();
  const u = useUser();
  const items = noticesFor(d, u);
  return (
    <Page title={title} sub={sub}>
      <Card flush>
        {items.length ? (
          <List>
            {items.map((n) => <Row key={n.id + n.title} to={n.to} wrap title={n.title} sub={n.sub} meta={dRel(n.at, d.today)} />)}
          </List>
        ) : <div className="card-body"><Empty>Новых событий нет.</Empty></div>}
      </Card>
    </Page>
  );
}

export function SearchPage() {
  const d = useData();
  const u = useUser();
  const [q, setQ] = useState('');
  const hits = search(d, u, q);
  return (
    <Page title="Поиск" sub="Объекты, материалы, потребности, операции и заявки, к которым у вас есть доступ.">
      <div style={{ position: 'relative' }}>
        <SearchIcon size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input" style={{ paddingLeft: 38 }} autoFocus type="search" placeholder="Например: гипсокартон, Лесная, Техпрокат" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поисковый запрос" />
      </div>
      {q.trim().length >= 2 && (
        <Card flush>
          {hits.length ? (
            <List>{hits.map((h) => <Row key={h.kind + h.id} to={h.to} title={h.title} sub={h.sub} meta={h.kind} />)}</List>
          ) : <div className="card-body"><Empty>По запросу «{q.trim()}» ничего не найдено.</Empty></div>}
        </Card>
      )}
    </Page>
  );
}

const ENTRY: Record<RoleId, string> = { foreman: 'u-foreman1', owner: 'u-owner1', manager: 'u-manager', supplier: 'u-supplier', admin: 'u-admin' };

export function Profile() {
  const d = useData();
  const u = useUser();
  const nav = useNavigate();
  const objects = d.objects.filter((o) => u.objectIds?.includes(o.id));
  return (
    <Page title="Профиль">
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Avatar user={u} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{u.name}</div>
            <div className="muted">{u.title}{objects.length ? ` · ${objects.map((o) => o.name).join(', ')}` : ''}</div>
          </div>
        </div>
      </Card>
      <Card title="Войти под другой ролью" flush>
        <List>
          {(Object.keys(ENTRY) as RoleId[]).filter((r) => r !== u.role).map((r) => {
            const other = d.users.find((x) => x.id === ENTRY[r])!;
            return <Row key={r} media={<Avatar user={other} />} title={ROLE_LABEL[r]} sub={`${other.name}. ${ROLE_ABOUT[r]}`} onClick={() => { act.login(other.id); nav(`/${r}`); }} />;
          })}
        </List>
      </Card>
      <Card title="Демо-данные">
        <p className="muted" style={{ marginBottom: 12, maxWidth: '68ch' }}>
          Всё, что вы вносите, хранится в этом браузере и видно только вам. Сброс вернёт исходные вымышленные данные и удалит ваши изменения.
        </p>
        <div className="btn-row">
          <Btn kind="danger" onClick={() => { act.resetDemo(); toast('Демо-данные возвращены к исходным'); }}>Сбросить демо-данные</Btn>
          <Btn onClick={() => { act.logout(); nav('/'); }}>Выйти к выбору роли</Btn>
        </div>
      </Card>
    </Page>
  );
}
