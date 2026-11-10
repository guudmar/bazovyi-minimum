// One application, five workspaces. Only the routes of the current role exist, so a person never sees another role's screens.
import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './data/store';
import { byId } from './data/select';
import type { RoleId } from './data/types';
import { Shell } from './shell/Shell';
import { EnterAs, Login } from './shell/Login';
import { Notifications, Profile, SearchPage, Tasks } from './shared/common';
import { Documents, Modules, Tech } from './shared/composer';
import { routes as owner } from './roles/owner';
import { routes as foreman } from './roles/foreman';
import { routes as manager } from './roles/manager';
import { routes as supplier } from './roles/supplier';
import { routes as admin } from './roles/admin';

export interface RouteDef { path: string; element: ReactNode }
const ROUTES: Record<RoleId, RouteDef[]> = { owner, foreman, manager, supplier, admin };

export default function App() {
  const role = useStore((s) => byId(s.users, s.session.userId)?.role);
  return (
    <HashRouter>
      {!role ? (
        <Login />
      ) : (
        <Shell>
          <Routes>
            {ROUTES[role].map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/tech" element={<Tech />} />
            <Route path="/modules" element={<Modules />} />
            <Route path="/as/:role" element={<EnterAs />} />
            <Route path="*" element={<Navigate to={`/${role}`} replace />} />
          </Routes>
        </Shell>
      )}
    </HashRouter>
  );
}
