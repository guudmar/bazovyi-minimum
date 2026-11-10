// Start from the task, not from a blank form. The launcher lists what a role usually does and opens
// the right form with the context already filled in. Documents are the results of those processes.
// The page about technologies says honestly what works in the demo and what waits for a server.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData, useUser, type State } from '../data/store';
import { byId, currentGeo, documents, needOpenQty, transits, workToPresent } from '../data/select';
import { Card, Chips, Empty, List, Page, Pill, Row, Sheet, useSticky } from '../ui/kit';
import { count, dRel } from '../lib/format';
import { OperationForm } from './money';
import { IssueSheet, canDictate } from './extras';
import type { User } from '../data/types';

interface Job { key: string; title: string; sub: string; to?: string; run?: 'operation' | 'issue' }

/** What the role can start right now, with a hint taken from the state of the processes. */
function jobs(d: State, u: User): Job[] {
  const mine = new Set(u.objectIds ?? []);
  const o = byId(d.objects, d.session.objectId) ?? d.objects.find((x) => mine.has(x.id));
  if (u.role === 'foreman' && o) {
    const due = d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected' && x.eta <= d.today);
    const ready = d.works.filter((w) => w.objectId === o.id && workToPresent(d, w) > 0);
    const floor = d.session.floor;
    const draft = d.session.needDraft?.objectId === o.id ? d.session.needDraft : undefined;
    return [
      { key: 'measure', title: 'Зафиксировать замер', sub: floor ? `${o.name}, ${floor}` : `${o.name}: выбрать этаж и помещение`, to: floor ? `/foreman/geometry/${encodeURIComponent(floor)}` : '/foreman/geometry' },
      { key: 'need', title: 'Создать потребность в материалах', sub: draft ? `продолжить черновик: ${count(draft.lines.length, 'позиция', 'позиции', 'позиций')}` : `${o.name}${floor ? ', ' + floor : ''}`, to: '/foreman/needs/new' },
      { key: 'receive', title: 'Подтвердить получение', sub: due.length ? `ждёт подтверждения: ${due.map((x) => `№ ${x.num}`).join(', ')}` : 'поставок к подтверждению сейчас нет', to: due.length === 1 ? `/foreman/deliveries/${due[0].id}` : '/foreman/deliveries' },
      { key: 'fact', title: 'Внести факт работ', sub: 'только новый объём за период, итог посчитается сам', to: '/foreman/works' },
      { key: 'present', title: 'Предъявить объём к приёмке', sub: ready.length ? `${count(ready.length, 'работа', 'работы', 'работ')} с объёмом без акта` : 'выполненных и не предъявленных объёмов нет', to: '/foreman/fact' },
      { key: 'issue', title: 'Оформить замечание', sub: 'с местом, фото и ответственным', run: 'issue' },
    ];
  }
  if (u.role === 'owner') {
    const pending = d.requests.filter((r) => r.status === 'pending').length;
    return [
      { key: 'op', title: 'Записать расход или поступление', sub: 'сумма, касса, статья', run: 'operation' },
      { key: 'approve', title: 'Согласовать заявки', sub: pending ? `${count(pending, 'заявка ждёт', 'заявки ждут', 'заявок ждут')} решения` : 'заявок на согласовании нет', to: '/owner/approvals' },
      { key: 'week', title: 'Посмотреть платежи и поступления', sub: 'платёжный календарь и прогноз остатка', to: '/owner/calendar' },
    ];
  }
  if (u.role === 'manager') {
    const open = d.needs.filter((n) => needOpenQty(n) > 0).sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
    const delayed = d.tradeOrders.filter((x) => x.status === 'delayed').length;
    return [
      { key: 'route', title: 'Распределить потребность', sub: open.length ? `${count(open.length, 'потребность ждёт', 'потребности ждут', 'потребностей ждут')} маршрута` : 'всё распределено', to: open.length ? `/manager/needs/${open[0].id}` : '/manager/needs' },
      { key: 'ship', title: 'Отправить со склада на объект', sub: 'то, что уже зарезервировано', to: '/manager' },
      { key: 'arrive', title: 'Отметить поступление заказа', sub: delayed ? `${count(delayed, 'заказ задерживается', 'заказа задерживаются', 'заказов задерживаются')}` : 'заказы торгового направления', to: '/manager/orders' },
      { key: 'handoff', title: 'Передать позицию снабженцу', sub: 'то, что торговое направление не обеспечит', to: '/manager/handoff' },
    ];
  }
  if (u.role === 'supplier') {
    const fresh = d.purchases.filter((p) => p.status === 'new');
    return [
      { key: 'take', title: 'Взять закупку в работу', sub: fresh.length ? `${count(fresh.length, 'новая закупка', 'новые закупки', 'новых закупок')}` : 'новых закупок нет', to: fresh.length ? `/supplier/purchase/${fresh[0].id}` : '/supplier/queue' },
      { key: 'ship', title: 'Отметить отгрузку поставщиком', sub: 'заказы в работе', to: '/supplier/orders' },
      { key: 'pay', title: 'Запросить оплату', sub: 'заявка привязывается к закупке', to: '/supplier/money' },
    ];
  }
  const way = transits(d).length;
  const toPay = d.requests.filter((r) => r.status === 'approved' || r.status === 'noted').length;
  const avr = d.avrs.find((a) => a.status === 'review');
  const geo = d.floors.map((f) => ({ f, v: currentGeo(d, f.objectId, f.name) })).find((x) => x.v?.status === 'review');
  const queue = d.sources.filter((s) => s.status !== 'matched').length;
  return [
    { key: 'op', title: 'Записать денежную операцию', sub: 'расход, поступление или перевод', run: 'operation' },
    { key: 'transit', title: 'Подтвердить получение перевода', sub: way ? `${count(way, 'перевод', 'перевода', 'переводов')} в пути` : 'переводов в пути нет', to: '/admin/transits' },
    { key: 'pay', title: 'Оплатить согласованную заявку', sub: toPay ? `${count(toPay, 'заявка ждёт', 'заявки ждут', 'заявок ждут')} оплаты` : 'заявок к оплате нет', to: '/admin/requests' },
    { key: 'avr', title: 'Принять объёмы по АВР', sub: avr ? `АВР № ${avr.num} на проверке` : 'актов на проверке нет', to: avr ? `/admin/objects/${avr.objectId}?tab=avr` : '/admin/objects' },
    { key: 'geo', title: 'Проверить геометрию', sub: geo ? `${byId(d.objects, geo.f.objectId)?.name}, ${geo.f.name}: версия ${geo.v?.num} на проверке` : 'версий на проверке нет', to: geo ? `/admin/objects/${geo.f.objectId}?tab=geometry` : '/admin/objects' },
    { key: 'catalog', title: 'Разобрать номенклатуру', sub: queue ? `${count(queue, 'позиция', 'позиции', 'позиций')} в очереди нормализации` : 'очередь нормализации пуста', to: '/admin/refs?tab=queue' },
  ];
}

export function Launcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const u = useUser();
  const nav = useNavigate();
  const [form, setForm] = useState<'operation' | 'issue' | null>(null);
  const o = byId(d.objects, d.session.objectId) ?? d.objects.find((x) => u.objectIds?.includes(x.id));
  const room = byId(d.rooms, d.session.roomId);
  return (
    <>
      <Sheet open={open} title="Что нужно сделать" onClose={onClose}>
        <div className="list" style={{ margin: '-8px -16px' }}>
          {jobs(d, u).map((j) => (
            <Row key={j.key} wrap title={j.title} sub={j.sub}
              onClick={() => { onClose(); if (j.run) setForm(j.run); else if (j.to) nav(j.to); }} />
          ))}
        </div>
      </Sheet>
      <OperationForm open={form === 'operation'} onClose={() => setForm(null)} defaultRegister={u.role === 'owner' ? 'r7' : undefined} />
      {o && (
        <IssueSheet open={form === 'issue'} onClose={() => setForm(null)}
          ctx={{ objectId: o.id, place: [d.session.floor ?? room?.floor, room?.name].filter(Boolean).join(', '), source: room ? { kind: 'room', id: room.id, label: `${room.name}, ${room.floor}` } : { kind: 'object', id: o.id, label: o.name } }} />
      )}
    </>
  );
}

/* --------------------------------------------------------------- documents */
export function Documents() {
  const d = useData();
  const u = useUser();
  const all = documents(d, u);
  const kinds = [...new Set(all.map((x) => x.kind))];
  const [kind, setKind] = useSticky('docs.kind', 'all');
  const [objectId, setObjectId] = useSticky('docs.object', 'all');
  const objects = d.objects.filter((o) => all.some((x) => x.objectId === o.id));
  const list = all.filter((x) => (kind === 'all' || x.kind === kind) && (objectId === 'all' || x.objectId === objectId));
  const waiting = all.filter((x) => x.tone === 'warning' || x.tone === 'hue').length;
  return (
    <Page title="Документы"
      sub={all.length ? `${count(all.length, 'документ и запись', 'документа и записи', 'документов и записей')}, ${waiting ? `из них ${waiting} в работе` : 'все закрыты'}. Каждый создан из своего процесса и ведёт к исходной записи.` : undefined}>
      <Chips value={kind} onChange={setKind} options={[{ value: 'all', label: 'Все', count: all.length }, ...kinds.map((k) => ({ value: k, label: k, count: all.filter((x) => x.kind === k).length }))]} />
      {objects.length > 1 && (
        <Chips value={objectId} onChange={setObjectId} options={[{ value: 'all', label: 'Все объекты' }, ...objects.map((o) => ({ value: o.id, label: o.name }))]} />
      )}
      <Card flush>
        {list.length ? (
          <List>
            {list.map((x) => (
              <Row key={x.kind + x.id} to={x.to} wrap title={x.title} sub={`${x.kind} · ${x.sub}`} meta={dRel(x.date, d.today)} value={<Pill tone={x.tone}>{x.status}</Pill>} />
            ))}
          </List>
        ) : <div className="card-body"><Empty>Документов по этим условиям нет.</Empty></div>}
      </Card>
    </Page>
  );
}

/* ------------------------------------------------------------ technologies */
type Stage = 'demo' | 'next' | 'later' | 'data' | 'pilot';
const STAGE: Record<Stage, { label: string }> = {
  demo: { label: 'Работает в демо' },
  next: { label: 'Ближайшая очередь' },
  later: { label: 'Следующий уровень' },
  data: { label: 'После накопления данных' },
  pilot: { label: 'Эксперимент' },
};
const TECH: { stage: Stage; title: string; text: string }[] = [
  { stage: 'demo', title: 'Фотофиксация', text: 'Фото с камеры телефона прикладывается к замеру, получению, факту работ и замечанию. В демо хранится только число фотографий.' },
  { stage: 'demo', title: 'Голосовой ввод', text: 'Описание замечания и комментарии можно надиктовать. Речь становится текстом в поле, запись сохраняет человек после проверки.' },
  { stage: 'demo', title: 'Постоянные ссылки и QR-коды', text: 'У потребности, поставки, закупки и помещения есть постоянный адрес и QR-код. Камера телефона открывает карточку сразу.' },
  { stage: 'demo', title: 'Работа без связи', text: 'После первого открытия приложение запускается без интернета. Данные и черновики лежат на устройстве.' },
  { stage: 'demo', title: 'Установка на телефон', text: 'Сайт добавляется на главный экран и открывается как приложение.' },
  { stage: 'next', title: 'Импорт документов и файлов', text: 'Оригинал файла хранится отдельно от результата обработки и связан с записью. Нужен сервер и хранилище.' },
  { stage: 'next', title: 'Распознавание накладных', text: 'Строки накладной распознаются как черновик и сверяются с заказом. Приход, списание и оплату распознавание само не проводит.' },
  { stage: 'next', title: 'Штрихкоды при приёмке', text: 'Сканирование кода производителя для поиска исходной позиции. Маркируется дорогое, многоразовое и часто теряемое.' },
  { stage: 'next', title: 'Синхронизация черновиков', text: 'Черновики, созданные без связи, отправляются после её восстановления с контролем конфликтов.' },
  { stage: 'later', title: 'Дальномеры и приложения обмеров', text: 'Измерение передаётся прямо в карточку помещения. Ручной ввод остаётся полноценным способом.' },
  { stage: 'later', title: 'Импорт планов и чертежей', text: 'Распознанные контуры и размеры доступны для ручной корректировки.' },
  { stage: 'later', title: 'Обмен с 1С УНФ и банком', text: 'Номенклатура, контрагенты, документы и выписки в согласованном составе, с журналом обмена и контролем дублей.' },
  { stage: 'data', title: 'Прогнозы и поиск по смыслу', text: 'Прогноз потребности и кассового разрыва, поиск аномалий, вопросы обычным языком. Для каждого расчёта видны исходные данные и дата.' },
  { stage: 'pilot', title: 'LiDAR, фотограмметрия, AR-обмеры', text: 'Сначала пилот на нескольких помещениях с контрольными замерами. Точность зависит от модели телефона и не обещается заранее.' },
];
export function Tech() {
  const [stage, setStage] = useSticky<string>('tech.stage', 'all');
  const stages = (Object.keys(STAGE) as Stage[]).filter((s) => stage === 'all' || s === stage);
  return (
    <Page title="Технологии и интеграции"
      sub={`${count(TECH.filter((t) => t.stage === 'demo').length, 'возможность работает', 'возможности работают', 'возможностей работают')} уже в демо${canDictate() ? '' : ', голосовой ввод в этом браузере недоступен'}. Остальное подключается, когда решает задачу пользователя и проверяется человеком.`}>
      <Chips value={stage} onChange={setStage} options={[{ value: 'all', label: 'Все' }, ...(Object.keys(STAGE) as Stage[]).map((s) => ({ value: s, label: STAGE[s].label, count: TECH.filter((t) => t.stage === s).length }))]} />
      {stages.map((s) => (
        <Card key={s} title={STAGE[s].label} flush>
          <List>
            {TECH.filter((t) => t.stage === s).map((t) => <Row key={t.title} wrap title={t.title} sub={t.text} />)}
          </List>
        </Card>
      ))}
      <Card title="Правила для любой технологии">
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, maxWidth: '76ch' }}>
          <li>Внешний сервис или устройство работает как инструмент ввода, измерения или проверки. Результат возвращается в общий контекст объекта, помещения, поставки или операции.</li>
          <li>Автоматически полученные данные получают статус черновика, пока их не проверил ответственный.</li>
          <li>У каждого процесса есть ручной резервный способ. Работа не зависит от одной модели телефона или одного сервиса.</li>
          <li>Оригинал и результат обработки хранятся отдельно. Этапы обработки: получено, обрабатывается, черновик, проверено, принято, отклонено или ошибка.</li>
        </ul>
      </Card>
      <p className="muted" style={{ fontSize: 13 }}>Это карта возможностей, а не утверждённый план. Поставщики, устройства и сроки выбираются отдельными исследованиями и пилотами.</p>
    </Page>
  );
}

/* ------------------------------------------------------------------ modules */
const MODULES: { name: string; text: string; to: Partial<Record<User['role'], string>>; working?: boolean }[] = [
  { name: 'Smart Workspace', working: true, text: 'Общая рабочая среда: персональная главная, задачи, уведомления, поиск и навигация.',
    to: { foreman: '/foreman', owner: '/owner', manager: '/manager', supplier: '/supplier', admin: '/admin' } },
  { name: 'Smart Geometry', working: true, text: 'Геометрия объекта: этажи, помещения, зоны и поверхности, версии замеров и исходные объёмы.',
    to: { foreman: '/foreman/geometry', admin: '/admin/objects' } },
  { name: 'Smart Works', text: 'План работ, факт по периодам, предъявление и приёмка объёмов.',
    to: { foreman: '/foreman/works', admin: '/admin/objects', owner: '/owner/objects' } },
  { name: 'Smart Materials', text: 'Потребность, обеспечение, получение и учёт материалов на объекте.',
    to: { foreman: '/foreman/needs', manager: '/manager/needs', supplier: '/supplier/queue', admin: '/admin/requests?tab=tmc' } },
  { name: 'Smart Catalog', text: 'Справочники: семейства и позиции материалов, единицы, исходные позиции поставщиков, очередь нормализации.',
    to: { admin: '/admin/refs', manager: '/manager/stock' } },
  { name: 'Smart Composer', text: 'Документы и рабочие записи как результат процесса: форма подбирается под задачу и заполняется известными данными.',
    to: { foreman: '/documents', owner: '/documents', manager: '/documents', supplier: '/documents', admin: '/documents' } },
  { name: 'Smart Finance', text: 'Денежные регистры, операции, транзиты, сверка и планирование денег.',
    to: { owner: '/owner/finance', admin: '/admin/finance', supplier: '/supplier/money' } },
  { name: 'Smart Analytics', text: 'От показателя к данным: группа, направление, юридическое лицо, объект, статья, исходная запись.',
    to: { owner: '/owner/analytics', manager: '/manager/analytics', admin: '/admin/processes' } },
];
export function Modules() {
  const u = useUser();
  const mine = MODULES.filter((m) => m.to[u.role]).length;
  return (
    <Page title="Модули приложения" sub={`Вашей роли доступно ${mine} из ${MODULES.length} модулей. Это инструменты одного приложения с общими объектами, справочниками и историей, а не отдельные программы.`}>
      <Card flush>
        <List>
          {MODULES.map((m) => (
            <Row key={m.name} wrap to={m.to[u.role]} title={m.name} sub={m.text}
              side={!m.to[u.role] ? <Pill>Нет доступа</Pill> : undefined} />
          ))}
        </List>
      </Card>
      <p className="muted" style={{ fontSize: 13, maxWidth: '76ch' }}>Smart Workspace и Smart Geometry уже используются как рабочие названия. Остальные названия предложены для обсуждения и пока не утверждены, поэтому в меню разделы подписаны обычными словами.</p>
    </Page>
  );
}
