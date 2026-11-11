// Navigation of every workspace: two to five sections per role, the same on a phone and on a computer.
// Everything else is reached from inside these sections, so there is one way to each screen.
import {
  House, Wallet, CheckCheck, Building2, ListChecks, Warehouse, ShoppingCart, Truck, Inbox, Settings, type LucideIcon,
} from 'lucide-react';
import type { Data, RoleId, User } from '../data/types';
import { needOpenQty, tasksFor } from '../data/select';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** other addresses that belong to this section */
  also?: string[];
  /** a count only on a queue that needs action */
  badge?: (d: Data, u: User) => number;
}

export const ROLE_LABEL: Record<RoleId, string> = {
  foreman: 'Прораб', owner: 'Собственник', manager: 'Менеджер по материалам', supplier: 'Снабженец', admin: 'Экономист',
};
export const ROLE_ABOUT: Record<RoleId, string> = {
  foreman: 'Заказать материал, принять поставку, отметить работу, сделать замер.',
  owner: 'Деньги группы, решения по заявкам, объекты.',
  manager: 'Заявки на материалы с объектов, склад и заказы.',
  supplier: 'Закупки у поставщиков и поставки на объекты.',
  admin: 'Деньги, заявки, объекты и настройки системы.',
};

const todo = (d: Data, u: User) => tasksFor(d, u).length;

export const NAV: Record<RoleId, NavItem[]> = {
  foreman: [
    { to: '/foreman', label: 'Дела', icon: ListChecks, badge: todo },
    { to: '/foreman/object', label: 'Объект', icon: Building2,
      also: ['/foreman/materials', '/foreman/needs', '/foreman/deliveries', '/foreman/works', '/foreman/geometry', '/foreman/issues', '/documents'] },
  ],
  owner: [
    { to: '/owner', label: 'Главная', icon: House, also: ['/owner/objects'] },
    { to: '/owner/approvals', label: 'Решения', icon: CheckCheck, badge: (d) => d.requests.filter((x) => x.status === 'pending').length },
    { to: '/owner/money', label: 'Деньги', icon: Wallet },
  ],
  manager: [
    { to: '/manager', label: 'Заявки', icon: Inbox, also: ['/manager/needs', '/manager/report'], badge: (d) => d.needs.filter((n) => needOpenQty(n) > 0).length },
    { to: '/manager/stock', label: 'Склад', icon: Warehouse },
    { to: '/manager/orders', label: 'Заказы', icon: ShoppingCart, badge: (d) => d.tradeOrders.filter((o) => o.status === 'delayed').length },
  ],
  supplier: [
    { to: '/supplier', label: 'Закупки', icon: Inbox, also: ['/supplier/purchase/'], badge: (d) => d.purchases.filter((p) => p.status === 'new').length },
    { to: '/supplier/deliveries', label: 'Поставки', icon: Truck },
  ],
  admin: [
    { to: '/admin', label: 'Дела', icon: ListChecks, badge: todo },
    { to: '/admin/money', label: 'Деньги', icon: Wallet },
    { to: '/admin/requests', label: 'Заявки', icon: Inbox },
    { to: '/admin/objects', label: 'Объекты', icon: Building2 },
    { to: '/admin/settings', label: 'Настройки', icon: Settings, also: ['/admin/refs', '/admin/norms', '/admin/users', '/admin/audit'] },
  ],
};

/** The section a path belongs to: the longest matching address. */
export function activeItem(items: NavItem[], path: string): NavItem | undefined {
  const score = (i: NavItem): number => {
    const all = [i.to, ...(i.also ?? [])].filter((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/') || (p.endsWith('/') && path.startsWith(p)));
    return all.length ? Math.max(...all.map((p) => p.length)) : -1;
  };
  return items.map((i) => ({ i, s: score(i) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.i;
}
