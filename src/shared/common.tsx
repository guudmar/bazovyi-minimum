// What every role has: the list of things to do (the home of every workspace), what is new, search, profile.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { act, useData, useUser } from '../data/store';
import { noticesFor, search, tasksFor } from '../data/select';
import { Avatar, Btn, Card, Details, Empty, List, Page, Row, Status, toast } from '../ui/kit';
import { dRel } from '../lib/format';
import { ROLE_ABOUT, ROLE_LABEL } from '../shell/nav';
import type { RoleId } from '../data/types';

/**
 * Things the person has to do now. It replaces «Мои задачи», «Уведомления» and the old launcher:
 * every row opens the action itself. Urgent ones go first.
 */
export function TodoCard({ title = 'Нужно сделать', limit, empty = 'Сейчас от вас ничего не требуется.' }: { title?: string; limit?: number; empty?: string }) {
  const d = useData();
  const u = useUser();
  const all = tasksFor(d, u).sort((a, b) => Number(b.tone === 'negative') - Number(a.tone === 'negative'));
  const shown = limit ? all.slice(0, limit) : all;
  return (
    <Card title={title} note={all.length ? String(all.length) : undefined} flush>
      {all.length ? (
        <List>
          {shown.map((t) => (
            <Row key={t.id + t.title} to={t.to} wrap title={t.title} sub={t.sub}
              side={t.tone === 'negative' ? <Status kind="problem">Срочно</Status> : undefined} />
          ))}
          {limit && all.length > limit && (
            <Details label={`Ещё ${all.length - limit}`}>
              <List>{all.slice(limit).map((t) => <Row key={t.id + t.title} to={t.to} wrap title={t.title} sub={t.sub} />)}</List>
            </Details>
          )}
        </List>
      ) : <div className="card-body"><Empty>{empty}</Empty></div>}
    </Card>
  );
}

/** What changed recently. Three newest are visible, the rest fold under «Ещё». */
export function NewsCard({ limit = 3, skip }: { limit?: number; skip?: (to: string) => boolean }) {
  const d = useData();
  const u = useUser();
  const items = noticesFor(d, u).filter((n) => !skip?.(n.to));
  if (!items.length) return null;
  const row = (n: (typeof items)[number]) => <Row key={n.id + n.title} to={n.to} wrap title={n.title} sub={n.sub} meta={dRel(n.at, d.today)} />;
  return (
    <Card title="Что нового" flush>
      <List>
        {items.slice(0, limit).map(row)}
        {items.length > limit && <Details label={`Ещё ${items.length - limit}`}><List>{items.slice(limit).map(row)}</List></Details>}
      </List>
    </Card>
  );
}

export function SearchPage() {
  const d = useData();
  const u = useUser();
  const [q, setQ] = useState('');
  const hits = search(d, u, q);
  return (
    <Page title="Поиск">
      <div style={{ position: 'relative' }}>
        <SearchIcon size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="input" style={{ paddingLeft: 38 }} autoFocus type="search" placeholder="Материал, объект, контрагент, номер" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поисковый запрос" />
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
            <div className="muted">{ROLE_LABEL[u.role]}{objects.length ? ` · ${objects.map((o) => o.name).join(', ')}` : ''}</div>
          </div>
        </div>
      </Card>
      <Card flush>
        <List>
          <Row to="/documents" title="Документы" sub="Акты, заявки, поставки и замечания" />
          <Row onClick={() => { act.logout(); nav('/'); }} title="Сменить роль" sub="Демо: войти как другой участник" />
        </List>
      </Card>
      <Details label="Войти под другой ролью сразу">
        <Card flush>
          <List>
            {(Object.keys(ENTRY) as RoleId[]).filter((r) => r !== u.role).map((r) => {
              const other = d.users.find((x) => x.id === ENTRY[r])!;
              return <Row key={r} media={<Avatar user={other} />} title={ROLE_LABEL[r]} sub={`${other.name}. ${ROLE_ABOUT[r]}`} onClick={() => { act.login(other.id); nav(`/${r}`); }} />;
            })}
          </List>
        </Card>
      </Details>
      <Details label="Демо-данные">
        <p className="muted">Всё, что вы вносите, хранится в этом браузере. Сброс вернёт исходные данные.</p>
        <div><Btn kind="danger" onClick={() => { act.resetDemo(); toast('Демо-данные возвращены к исходным'); }}>Сбросить демо-данные</Btn></div>
      </Details>
    </Page>
  );
}
