// Navigation of every workspace. One application, a different set of sections for each role.
import {
  House, Wallet, CalendarDays, CheckCheck, Building2, ChartColumn, Bell, ClipboardList, Truck, Boxes, Hammer, Ruler, TriangleAlert,
  PackageCheck, Warehouse, ShoppingCart, Send, History, Banknote, Landmark, ArrowLeftRight, Receipt, BookOpen, Calculator, Activity,
  Users, FileText, Inbox, type LucideIcon,
} from 'lucide-react';
import type { Data, RoleId, User } from '../data/types';
import { needOpenQty, needState, transits } from '../data/select';

export interface NavItem {
  to: string;
  label: string;
  /** label for the phone's bottom bar */
  short?: string;
  icon: LucideIcon;
  group?: string;
  /** shown in the phone's bottom bar (four at most; the rest live under «Ещё») */
  tab?: boolean;
  /** other path prefixes that belong to this section (a detail page that lives under another path) */
  also?: string[];
  /** a count is shown only on a queue that needs action */
  badge?: (d: Data, u: User) => number;
}

export const ROLE_LABEL: Record<RoleId, string> = {
  foreman: 'Прораб', owner: 'Собственник', manager: 'Менеджер торгового направления', supplier: 'Снабженец', admin: 'Экономист, администратор',
};
export const ROLE_ABOUT: Record<RoleId, string> = {
  foreman: 'Потребности в материалах, получение, факт работ и замеры. Сделано под телефон.',
  owner: 'Деньги группы, платёжный календарь, согласования и объекты.',
  manager: 'Очередь потребностей, склад, заказы и обеспечение объектов.',
  supplier: 'Закупки, поставщики, поставки и заявки на оплату.',
  admin: 'Денежные операции, транзиты и сверка, заявки, объекты и справочники.',
};

const mine = (u: User) => new Set(u.objectIds ?? []);

export const NAV: Record<RoleId, NavItem[]> = {
  foreman: [
    { to: '/foreman', label: 'Главная', icon: House, tab: true },
    { to: '/foreman/needs', label: 'Потребности', short: 'Материалы', icon: ClipboardList, group: 'Материалы', tab: true },
    { to: '/foreman/deliveries', label: 'Получение', icon: Truck, group: 'Материалы',
      badge: (d, u) => d.deliveries.filter((x) => x.status === 'expected' && mine(u).has(x.objectId) && x.eta <= d.today).length },
    { to: '/foreman/stock', label: 'На объекте', icon: Boxes, group: 'Материалы' },
    { to: '/foreman/works', label: 'План работ', short: 'Работы', icon: Hammer, group: 'Работы', tab: true },
    { to: '/foreman/fact', label: 'Факт и АВР', icon: FileText, group: 'Работы' },
    { to: '/foreman/geometry', label: 'Геометрия', icon: Ruler, group: 'Работы' },
    { to: '/foreman/issues', label: 'Замечания', short: 'Замечания', icon: TriangleAlert, group: 'Объект', tab: true,
      badge: (d, u) => d.issues.filter((x) => x.status === 'open' && mine(u).has(x.objectId)).length },
    { to: '/foreman/objects', label: 'Мои объекты', icon: Building2, group: 'Объект', also: ['/foreman/object/'] },
  ],
  owner: [
    { to: '/owner', label: 'Главная', icon: House, tab: true },
    { to: '/owner/finance', label: 'Финансы группы', short: 'Финансы', icon: Wallet, group: 'Деньги', tab: true },
    { to: '/owner/calendar', label: 'Платёжный календарь', short: 'Календарь', icon: CalendarDays, group: 'Деньги', tab: true },
    { to: '/owner/approvals', label: 'Согласования', short: 'Решения', icon: CheckCheck, group: 'Решения', tab: true,
      badge: (d) => d.requests.filter((x) => x.status === 'pending').length },
    { to: '/owner/alerts', label: 'Уведомления и контроль', icon: Bell, group: 'Решения' },
    { to: '/owner/objects', label: 'Объекты и результаты', icon: Building2, group: 'Бизнес' },
    { to: '/owner/analytics', label: 'Аналитика бизнеса', icon: ChartColumn, group: 'Бизнес' },
  ],
  manager: [
    { to: '/manager', label: 'Главная', icon: House, tab: true },
    { to: '/manager/needs', label: 'Очередь потребностей', short: 'Очередь', icon: Inbox, group: 'Потребности', tab: true,
      badge: (d) => d.needs.filter((n) => needOpenQty(n) > 0).length },
    { to: '/manager/handoff', label: 'Передача снабженцу', icon: Send, group: 'Потребности' },
    { to: '/manager/stock', label: 'Складские остатки', short: 'Склад', icon: Warehouse, group: 'Склад и заказы', tab: true },
    { to: '/manager/orders', label: 'Заказы и поставки', short: 'Заказы', icon: ShoppingCart, group: 'Склад и заказы', tab: true,
      badge: (d) => d.tradeOrders.filter((o) => o.status === 'delayed').length },
    { to: '/manager/supply', label: 'Обеспечение объектов', icon: PackageCheck, group: 'Сводка' },
    { to: '/manager/analytics', label: 'Аналитика обеспечения', icon: ChartColumn, group: 'Сводка' },
  ],
  supplier: [
    { to: '/supplier', label: 'Главная', icon: House, tab: true },
    { to: '/supplier/queue', label: 'Очередь закупок', short: 'Закупки', icon: Inbox, group: 'Закупка', tab: true, also: ['/supplier/purchase/'],
      badge: (d) => d.purchases.filter((p) => p.status === 'new').length },
    { to: '/supplier/orders', label: 'Заказы поставщикам', short: 'Заказы', icon: ShoppingCart, group: 'Закупка', tab: true },
    { to: '/supplier/deliveries', label: 'Поставки', icon: Truck, group: 'Исполнение', tab: true },
    { to: '/supplier/money', label: 'Финансовая потребность', icon: Banknote, group: 'Исполнение' },
    { to: '/supplier/history', label: 'История закупок', icon: History, group: 'История' },
  ],
  admin: [
    { to: '/admin', label: 'Центр управления', short: 'Главная', icon: House, tab: true },
    { to: '/admin/finance', label: 'Финансовый центр', short: 'Финансы', icon: Landmark, group: 'Финансы', tab: true },
    { to: '/admin/operations', label: 'Денежные операции', short: 'Операции', icon: Receipt, group: 'Финансы', tab: true },
    { to: '/admin/transits', label: 'Транзиты и сверка', icon: ArrowLeftRight, group: 'Финансы',
      badge: (d) => transits(d).length + d.operations.filter((o) => o.bank === 'unmatched').length },
    { to: '/admin/planning', label: 'Планирование денег', icon: CalendarDays, group: 'Финансы' },
    { to: '/admin/requests', label: 'Центр заявок', short: 'Заявки', icon: Inbox, group: 'Управление проектами', tab: true,
      badge: (d) => d.requests.filter((r) => r.status === 'approved' || r.status === 'noted').length + d.needs.filter((n) => needState(n) === 'new').length },
    { to: '/admin/objects', label: 'Управление объектами', icon: Building2, group: 'Управление проектами' },
    { to: '/admin/processes', label: 'Контроль процессов', icon: Activity, group: 'Управление проектами' },
    { to: '/admin/refs', label: 'Справочники', icon: BookOpen, group: 'Администрирование' },
    { to: '/admin/norms', label: 'Технологические карты', icon: Calculator, group: 'Администрирование' },
    { to: '/admin/users', label: 'Пользователи и права', icon: Users, group: 'Администрирование' },
    { to: '/admin/audit', label: 'Журнал изменений', icon: History, group: 'Администрирование' },
  ],
};

/** The nav item a path belongs to: the longest matching prefix. */
export function activeItem(items: NavItem[], path: string): NavItem | undefined {
  return items
    .filter((i) => path === i.to || path.startsWith(i.to + '/') || i.also?.some((p) => path.startsWith(p)))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
