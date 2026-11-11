// The frame around every workspace. Few sections, the same on a phone and on a computer.
// Phone: a short top bar (object, search, profile) and a bottom bar of two to five sections; the foreman also gets a big «+».
// Computer: the same sections in a sidebar.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigationType, useNavigate } from 'react-router-dom';
import { CircleUser, Plus, Search } from 'lucide-react';
import { act, useData, useUser } from '../data/store';
import { Avatar, Toaster } from '../ui/kit';
import { NAV, ROLE_LABEL, activeItem, type NavItem } from './nav';
import { CreateSheet } from '../shared/composer';

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

/** Scroll position of every visited screen, so «Назад» returns to the same place in a list. */
const scrolls = new Map<string, number>();

export function Shell({ children }: { children: ReactNode }) {
  const d = useData();
  const user = useUser();
  const loc = useLocation();
  const nav = useNavigate();
  const navType = useNavigationType();
  const [create, setCreate] = useState(false);
  const items = NAV[user.role];
  const current = activeItem(items, loc.pathname);
  const objects = d.objects.filter((o) => user.objectIds?.includes(o.id));
  const object = objects.find((o) => o.id === d.session.objectId) ?? objects[0];
  const foreman = user.role === 'foreman';

  useEffect(() => {
    setCreate(false);
    // a new screen opens at the top; going back returns to where the person was
    const at = `${loc.key}:${loc.pathname}${loc.search}`;
    window.scrollTo(0, navType === 'POP' ? scrolls.get(at) ?? 0 : 0);
    const save = () => scrolls.set(at, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [loc.key, loc.pathname, loc.search, navType]);

  const badgeOf = (it: NavItem) => (it.badge ? it.badge(d, user) : 0);

  const objectSelect = foreman && objects.length > 1 && (
    <select className="select" aria-label="Объект" value={object?.id} onChange={(e) => act.setObject(e.target.value)}>
      {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  const Tab = ({ it }: { it: NavItem }) => {
    const n = badgeOf(it);
    const on = current === it;
    return (
      <Link to={it.to} className={`tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
        <it.icon size={22} strokeWidth={on ? 2 : 1.6} />
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
        {foreman && <button className="btn primary block side-new" onClick={() => setCreate(true)}><Plus size={16} /> Создать</button>}
        <nav aria-label="Разделы" style={{ marginTop: 8 }}>
          {items.map((it) => {
            const n = badgeOf(it);
            const on = current === it;
            return (
              <Link key={it.to} to={it.to} className={`nav-item ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
                <it.icon size={16} strokeWidth={1.6} />
                <span className="t">{it.label}</span>
                {n > 0 && <span className="badge">{n}</span>}
              </Link>
            );
          })}
          <Link to="/search" className={`nav-item ${loc.pathname === '/search' ? 'on' : ''}`}>
            <Search size={16} strokeWidth={1.6} /><span className="t">Поиск</span>
          </Link>
        </nav>
        <div className="side-foot">
          <button className="nav-item" onClick={() => { act.logout(); nav('/'); }}><CircleUser size={16} strokeWidth={1.6} /><span className="t">Сменить роль</span></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link to={`/${user.role}`} aria-label="На главную" style={{ display: 'grid' }}><Mark size={26} /></Link>
          <div className="grow">
            {foreman && objects.length > 1 ? (
              <select aria-label="Объект" value={object?.id} onChange={(e) => act.setObject(e.target.value)}
                style={{ border: 0, background: 'transparent', fontWeight: 600, fontSize: 16, padding: 0, maxWidth: '100%', textOverflow: 'ellipsis' }}>
                {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <span className="brand-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{foreman && object ? object.name : 'Базовый минимум'}</span>
            )}
          </div>
          <Link to="/search" className="icon-btn" aria-label="Поиск"><Search size={21} strokeWidth={1.7} /></Link>
          <Link to="/profile" className="icon-btn" aria-label={`Профиль: ${user.name}`}><Avatar user={user} small /></Link>
        </header>

        {children}
      </div>

      <nav className="tabbar" aria-label="Разделы">
        {foreman ? (
          <>
            <Tab it={items[0]} />
            <button className="tab plus" onClick={() => setCreate(true)} aria-haspopup="dialog" aria-label="Создать">
              <span className="plus-dot"><Plus size={24} strokeWidth={2.2} /></span>
            </button>
            <Tab it={items[1]} />
          </>
        ) : items.map((it) => <Tab key={it.to} it={it} />)}
      </nav>

      {foreman && <CreateSheet open={create} onClose={() => setCreate(false)} />}
      <Toaster />
    </div>
  );
}
