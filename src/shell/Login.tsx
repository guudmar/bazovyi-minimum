// Entry screen of the demo: pick a role and open its workspace. There are no passwords in the demo.
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { act, useData } from '../data/store';
import { Avatar, Toaster } from '../ui/kit';
import { Mark } from './Shell';
import { ROLE_ABOUT, ROLE_LABEL } from './nav';
import type { RoleId } from '../data/types';

const ENTRY: { role: RoleId; userId: string }[] = [
  { role: 'foreman', userId: 'u-foreman1' },
  { role: 'owner', userId: 'u-owner1' },
  { role: 'manager', userId: 'u-manager' },
  { role: 'supplier', userId: 'u-supplier' },
  { role: 'admin', userId: 'u-admin' },
];

/** A direct link to a workspace: …/#/as/foreman opens the demo already signed in as that role. */
export function EnterAs() {
  const { role } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    const entry = ENTRY.find((e) => e.role === role);
    if (entry) act.login(entry.userId);
    nav(entry ? `/${entry.role}` : '/', { replace: true });
  }, [role, nav]);
  return null;
}

export function Login() {
  const d = useData();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const direct = pathname.match(/^\/as\/([a-z]+)$/)?.[1];
  useEffect(() => {
    const entry = ENTRY.find((e) => e.role === direct);
    if (entry) { act.login(entry.userId); nav(`/${entry.role}`, { replace: true }); }
  }, [direct, nav]);
  return (
    <main className="login">
      <div className="brand" style={{ fontWeight: 600, fontSize: 16 }}><Mark size={30} /> Базовый минимум</div>
      <h1>Деньги, материалы и работы строительной группы в одном месте</h1>
      <p className="lead">
        У каждого участника своё рабочее место: прораб выполняет работу, менеджер обеспечивает потребность,
        снабженец организует закупку, собственник видит картину бизнеса. Выберите, кем войти.
      </p>
      <div className="roles">
        {ENTRY.map((e) => {
          const u = d.users.find((x) => x.id === e.userId)!;
          return (
            <button key={e.role} className="role-card" onClick={() => { act.login(u.id); nav(`/${e.role}`); }}>
              <Avatar user={u} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t" style={{ display: 'block' }}>{ROLE_LABEL[e.role]}</span>
                <span className="s" style={{ display: 'block' }}>{u.name}. {ROLE_ABOUT[e.role]}</span>
              </span>
              <ChevronRight size={18} color="var(--faint)" />
            </button>
          );
        })}
      </div>
      <p className="notice plain">
        Это демонстрационная версия. Все люди, компании и суммы вымышлены. Данные хранятся только в вашем браузере:
        то, что вы внесёте, увидите только вы на этом устройстве. Вернуть исходные данные можно в профиле.
      </p>
      <Toaster />
    </main>
  );
}
