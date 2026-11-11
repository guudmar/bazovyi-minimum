// The economist's other sections: «Заявки», «Объекты» and the card of one object, «Настройки» with its four pages.
// The screens themselves live next to this file in rest-*.tsx.
import type { ReactNode } from 'react';
import { Requests } from './rest-requests';
import { ObjectCard, Objects } from './rest-objects';
import { Norms, Refs } from './rest-refs';
import { Audit, Settings, Users } from './rest-control';

export const restRoutes: { path: string; element: ReactNode }[] = [
  { path: '/admin/requests', element: <Requests /> },
  { path: '/admin/objects', element: <Objects /> },
  { path: '/admin/objects/:id', element: <ObjectCard /> },
  { path: '/admin/settings', element: <Settings /> },
  { path: '/admin/refs', element: <Refs /> },
  { path: '/admin/norms', element: <Norms /> },
  { path: '/admin/users', element: <Users /> },
  { path: '/admin/audit', element: <Audit /> },
];
