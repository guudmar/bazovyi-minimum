// The frame around every workspace.
// Desktop: a labelled sidebar on the page ground. Phone: a top bar with the scope and a bottom bar of four sections plus «Ещё».
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Ellipsis, ListChecks, Search, CircleUser } from 'lucide-react';
import { act, useData, useUser } from '../data/store';
import { noticesFor, tasksFor } from '../data/select';
import { Avatar, Sheet, Toaster } from '../ui/kit';
import { NAV, ROLE_LABEL, activeItem, type NavItem } from './nav';

export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="19" width="20" height="3" rx="1" fill="#141414" />
      <rect x="3" y="12" width="7" height="5" rx="1" fill="#141414" />
      <rect x="12" y="12" width="9" height="5" rx="1" fill="#1d5fbf" />
      <rect x="7" y="5" width="9" height="5" rx="1" fill="#141414" />
    </svg>
  );
}

const COMMON: NavItem[] = [
  { to: '/tasks', label: 'Мои задачи', icon: ListChecks },
  { to: '/notifications', label: 'Уведомления', icon: Bell },
  { to: '/search', label: 'Поиск', icon: Search },
];

export function Shell({ children }: { children: ReactNode }) {
  const d = useData();
  const user = useUser();
  const loc = useLocation();
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const items = NAV[user.role];
  const current = activeItem([...items, ...COMMON, { to: '/profile', label: 'Профиль', icon: CircleUser }], loc.pathname);
  const taskCount = tasksFor(d, user).length;
  const noticeCount = noticesFor(d, user).length;
  const objects = d.objects.filter((o) => user.objectIds?.includes(o.id));
  const object = objects.find((o) => o.id === d.session.objectId) ?? objects[0];

  useEffect(() => { window.scrollTo(0, 0); setMore(false); }, [loc.pathname]);

  const groups: { name: string; items: NavItem[] }[] = [];
  for (const it of items) {
    const name = it.group ?? '';
    const g = groups.find((x) => x.name === name);
    if (g) g.items.push(it); else groups.push({ name, items: [it] });
  }
  const badgeOf = (it: NavItem) => (it.to === '/tasks' ? taskCount : it.badge ? it.badge(d, user) : 0);
  const tabs = items.filter((i) => i.tab).slice(0, 4);
  // a section that has no tab of its own lights up the tab of its group (Получение → Материалы)
  const currentTab = tabs.find((t) => t === current) ?? (current?.group ? tabs.find((t) => t.group === current.group) : undefined);
  const inTabs = !!currentTab;
  const tabBadge = (it: NavItem) => badgeOf(it) + items.filter((x) => x !== it && !x.tab && x.group && x.group === it.group && tabs.find((t) => t.group === x.group) === it).reduce((s, x) => s + badgeOf(x), 0);

  const objectSelect = user.role === 'foreman' && objects.length > 0 && (
    <select className="select" aria-label="Объект" value={object?.id} onChange={(e) => act.setObject(e.target.value)}>
      {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  const NavLink = ({ it }: { it: NavItem }) => {
    const n = badgeOf(it);
    return (
      <Link to={it.to} className={`nav-item ${current === it ? 'on' : ''}`} aria-current={current === it ? 'page' : undefined}>
        <it.icon size={16} strokeWidth={1.6} />
        <span className="t">{it.label}</span>
        {n > 0 && <span className="badge">{n}</span>}
      </Link>
    );
  };

  return (
    <div className="app">
      <aside className="side">
        <Link to={`/${user.role}`} className="brand"><Mark /> Базовый минимум</Link>
        <Link to="/profile" className="side-scope">
          <Avatar user={user} />
          <span className="who">
            <span className="name" style={{ display: 'block' }}>{user.name}</span>
            <span className="role" style={{ display: 'block' }}>{ROLE_LABEL[user.role]}</span>
          </span>
        </Link>
        {objectSelect}
        <nav aria-label="Разделы">
          {groups.map((g) => (
            <div key={g.name}>
              {g.name && <div className="side-group">{g.name}</div>}
              {g.items.map((it) => <NavLink key={it.to} it={it} />)}
            </div>
          ))}
          <div className="side-group">Общее</div>
          {COMMON.map((it) => <NavLink key={it.to} it={it} />)}
        </nav>
        <div className="side-foot">
          <button className="nav-item" onClick={() => { act.logout(); nav('/'); }}><CircleUser size={16} strokeWidth={1.6} /><span className="t">Сменить роль</span></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link to={`/${user.role}`} aria-label="На главную" style={{ display: 'grid' }}><Mark size={26} /></Link>
          <div className="grow">
            {user.role === 'foreman' && objects.length > 0 ? (
              <>
                <span className="scope">{ROLE_LABEL[user.role]}</span>
                <select aria-label="Объект" value={object?.id} onChange={(e) => act.setObject(e.target.value)}
                  style={{ border: 0, background: 'transparent', fontWeight: 600, fontSize: 15, padding: 0, maxWidth: '100%', textOverflow: 'ellipsis' }}>
                  {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </>
            ) : (
              <>
                <span className="brand-name">Базовый минимум</span>
                <span className="scope">{ROLE_LABEL[user.role]} · {user.name}</span>
              </>
            )}
          </div>
          <Link to="/search" className="icon-btn" aria-label="Поиск"><Search size={21} strokeWidth={1.7} /></Link>
          <Link to="/notifications" className="icon-btn" aria-label={`Уведомления: ${noticeCount}`}>
            <Bell size={21} strokeWidth={1.7} />
            {noticeCount > 0 && <span className="dot">{noticeCount}</span>}
          </Link>
        </header>

        {children}
      </div>

      <nav className="tabbar" aria-label="Основные разделы">
        {tabs.map((it) => {
          const n = tabBadge(it);
          return (
            <Link key={it.to} to={it.to} className={`tab ${currentTab === it ? 'on' : ''}`} aria-current={currentTab === it ? 'page' : undefined}>
              <it.icon size={22} strokeWidth={currentTab === it ? 2 : 1.6} />
              <span className="t">{it.short ?? it.label}</span>
              {n > 0 && <span className="badge">{n}</span>}
            </Link>
          );
        })}
        <button className={`tab ${!inTabs ? 'on' : ''}`} onClick={() => setMore(true)} aria-haspopup="dialog">
          <Ellipsis size={22} strokeWidth={1.6} />
          <span className="t">Ещё</span>
          {taskCount > 0 && <span className="badge">{taskCount}</span>}
        </button>
      </nav>

      <Sheet open={more} title="Все разделы" onClose={() => setMore(false)}>
        <div className="list" style={{ margin: '-8px -16px' }}>
          {[...COMMON, ...items.filter((i) => !tabs.includes(i)), { to: '/profile', label: 'Профиль и смена роли', icon: CircleUser } as NavItem].map((it) => {
            const n = badgeOf(it);
            return (
              <Link key={it.to} to={it.to} className="row" onClick={() => setMore(false)}>
                <it.icon size={20} strokeWidth={1.6} color="var(--muted)" />
                <span className="row-main"><span className="row-title">{it.label}</span></span>
                {n > 0 && <span className="badge">{n}</span>}
              </Link>
            );
          })}
        </div>
      </Sheet>
      <Toaster />
    </div>
  );
}
