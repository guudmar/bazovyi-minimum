// The foreman's workspace. He opens the app to do a job on site, usually with a phone in one hand.
// Two sections and a «+»: «Дела» is what to do now, «Объект» leads to everything about the object, «+» creates.
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Boxes, FileText, Hammer, Ruler, TriangleAlert } from 'lucide-react';
import { act, useData, useUser } from '../../data/store';
import { byId, currentGeo, floorsOf, lineState, objectView, roomFloor, roomsOn, round1, tasksFor, workState, workToPresent } from '../../data/select';
import { Card, Details, Empty, Go, List, Page, Row } from '../../ui/kit';
import { NewsCard, TodoCard } from '../../shared/common';
import { IssueButton, ShareButton } from '../../shared/extras';
import { count, dFull, num, pct } from '../../lib/format';
import { DeliveryConfirm, Deliveries, Materials, NeedDetail, NeedNew, Needs, Stock, useObject } from './materials';
import { Fact, Issues, Works } from './works';
import { FloorPage, Geometry, RoomPage } from './geometry';
import type { BuildObject, Data, User } from '../../data/types';

/** «Дела»: what to do now, then what is new. Every row opens the action itself. */
function Home() {
  const o = useObject();
  return (
    <Page title={o.name} sub={o.stage}>
      <TodoCard />
      <NewsCard />
    </Page>
  );
}

/* ------------------------------------------------- one plain line per section */
function materialsLine(d: Data, o: BuildObject): string {
  const needs = d.needs.filter((n) => n.objectId === o.id);
  const waiting = d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected').length;
  const open = needs.flatMap((n) => n.lines).filter((l) => lineState(l) !== 'done').length;
  const parts = [
    waiting ? count(waiting, 'поставка ждёт', 'поставки ждут', 'поставок ждут') : '',
    open ? count(open, 'позиция в работе', 'позиции в работе', 'позиций в работе') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : needs.length ? 'Всё получено' : 'Заявок пока нет';
}
function worksLine(d: Data, o: BuildObject): string {
  const works = d.works.filter((w) => w.objectId === o.id);
  const active = works.filter((w) => !['accepted', 'done'].includes(workState(w, d.today))).length;
  const hand = works.filter((w) => workToPresent(d, w) > 0).length;
  const parts = [active ? `${active} в работе` : '', hand ? `${hand} сдать` : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : works.length ? 'Всё сдано' : 'Работ пока нет';
}
function measuresLine(d: Data, o: BuildObject): string {
  const floors = floorsOf(d, o.id).map((f) => ({ v: currentGeo(d, o.id, f), rooms: roomsOn(d, o.id, f).length }));
  const floors3 = (n: number) => count(n, 'этаж', 'этажа', 'этажей');
  const returned = floors.filter((x) => x.v?.status === 'draft' && x.v.note).length;
  const drafts = floors.filter((x) => x.v?.status === 'draft' && !x.v.note && x.rooms > 0).length;
  const review = floors.filter((x) => x.v?.status === 'review').length;
  const parts = [
    returned ? `${floors3(returned)} вернули` : '',
    drafts ? `${floors3(drafts)} в черновике` : '',
    review ? `${floors3(review)} на проверке` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : floors.length ? 'Все этажи приняты' : 'Замеров пока нет';
}
function issuesLine(d: Data, o: BuildObject): string {
  const open = d.issues.filter((i) => i.objectId === o.id && i.status !== 'done').length;
  return open ? count(open, 'открытое', 'открытых', 'открытых') : 'Открытых нет';
}
/** Things to do on one object: the same list as «Дела», narrowed to it. */
const tasksOn = (d: Data, u: User, objectId: string): number => tasksFor(d, { ...u, objectIds: [objectId] }).length;

const icon = { size: 22, strokeWidth: 1.6, color: 'var(--muted)', style: { flex: 'none' } } as const;

/** «Объект»: four big rows to the parts of the object, the documents, and the rest one tap deeper. */
function ObjectBody({ o }: { o: BuildObject }) {
  const d = useData();
  const u = useUser();
  const nav = useNavigate();
  const others = d.objects.filter((x) => u.objectIds?.includes(x.id) && x.id !== o.id);
  const rooms = d.rooms.filter((r) => r.objectId === o.id);
  const v = objectView(d, o);
  return (
    <Page title={o.name}>
      <Card flush>
        <List>
          <Row to="/foreman/materials" media={<Boxes {...icon} />} title="Материалы" sub={materialsLine(d, o)} />
          <Row to="/foreman/works" media={<Hammer {...icon} />} title="Работы" sub={worksLine(d, o)} />
          <Row to="/foreman/geometry" media={<Ruler {...icon} />} title="Замеры" sub={measuresLine(d, o)} />
          <Row to="/foreman/issues" media={<TriangleAlert {...icon} />} title="Замечания" sub={issuesLine(d, o)} />
        </List>
      </Card>
      <Card flush>
        <List><Row to="/documents" media={<FileText {...icon} />} title="Документы" /></List>
      </Card>
      <Details label="Об объекте">
        <dl className="kv left">
          <dt>Этап</dt><dd>{o.stage}</dd>
          <dt>Заказчик</dt><dd>{o.customer}</dd>
          <dt>Договор</dt><dd>{o.contract}</dd>
          <dt>Сроки</dt><dd>{dFull(o.start)} – {dFull(o.finish)}</dd>
          <dt>Адрес</dt><dd>{o.address}</dd>
          <dt>Помещения</dt><dd>{count(rooms.length, 'помещение', 'помещения', 'помещений')}, {num(round1(rooms.reduce((s, r) => s + roomFloor(r), 0)), 1)} м² пола</dd>
          <dt>Работы</dt><dd>сделано {pct(v.progress)}, принято {pct(v.accepted)}</dd>
        </dl>
        <div className="btn-row">
          <IssueButton ctx={{ objectId: o.id, source: { kind: 'object', id: o.id, label: o.name } }}>Сообщить о проблеме</IssueButton>
          <ShareButton path={`/foreman/object/${o.id}`} title={o.name} />
        </div>
      </Details>
      {others.length > 0 && (
        <Card title="Другие объекты" flush>
          <List>
            {others.map((x) => {
              const n = tasksOn(d, u, x.id);
              return (
                <Row key={x.id} title={x.name} sub={`${x.stage}${n ? ` · ${count(n, 'дело', 'дела', 'дел')}` : ''}`}
                  onClick={() => { act.setObject(x.id); nav('/foreman/object'); window.scrollTo(0, 0); }} />
              );
            })}
          </List>
        </Card>
      )}
    </Page>
  );
}

function ObjectPage() {
  return <ObjectBody o={useObject()} />;
}

/** A permanent link to an object: it becomes the current object, and the address settles on «Объект». */
function ObjectById() {
  const d = useData();
  const u = useUser();
  const nav = useNavigate();
  const { id } = useParams();
  const found = byId(d.objects, id);
  const o = found && u.objectIds?.includes(found.id) ? found : undefined;
  useEffect(() => {
    if (!o) return;
    act.setObject(o.id);
    nav('/foreman/object', { replace: true });
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o) {
    return (
      <Page title="Объект не найден" path={[{ label: 'Объект', to: '/foreman/object' }, { label: 'Не найден' }]}>
        <Card><Empty>У вас нет доступа к этому объекту.</Empty></Card>
      </Page>
    );
  }
  return <ObjectBody o={o} />;
}

export const routes = [
  { path: '/foreman', element: <Home /> },
  { path: '/foreman/object', element: <ObjectPage /> },
  { path: '/foreman/object/:id', element: <ObjectById /> },
  { path: '/foreman/objects', element: <Go to="/foreman/object" /> },
  { path: '/foreman/materials', element: <Materials /> },
  { path: '/foreman/needs', element: <Needs /> },
  { path: '/foreman/needs/new', element: <NeedNew /> },
  { path: '/foreman/needs/:id', element: <NeedDetail /> },
  { path: '/foreman/deliveries', element: <Deliveries /> },
  { path: '/foreman/deliveries/:id', element: <DeliveryConfirm /> },
  { path: '/foreman/stock', element: <Stock /> },
  { path: '/foreman/works', element: <Works /> },
  { path: '/foreman/fact', element: <Fact /> },
  { path: '/foreman/geometry', element: <Geometry /> },
  { path: '/foreman/geometry/:floor', element: <FloorPage /> },
  { path: '/foreman/geometry/:floor/new', element: <RoomPage /> },
  { path: '/foreman/geometry/:floor/:roomId', element: <RoomPage /> },
  { path: '/foreman/issues', element: <Issues /> },
];
