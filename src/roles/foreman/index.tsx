// The foreman's workspace. He opens the app to do a job on site, usually with a phone in one hand,
// so the home screen shows what to do now and puts the frequent actions one tap away.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Boxes, ClipboardList, Hammer, Plus, Ruler, TriangleAlert, Truck } from 'lucide-react';
import { act, useData, useUser } from '../../data/store';
import { byId, lineState, material, objectView, roomFloor, round1, workDone, workState, workToPresent } from '../../data/select';
import { Btn, Card, Empty, List, More, Page, Pill, Row, Seg, Stats, Tabs } from '../../ui/kit';
import { addDays, count, dFull, dRel, dShort, dWeek, num, pct, qty, weekStart } from '../../lib/format';
import { Deliveries, DeliveriesBody, DeliveryConfirm, NeedDetail, NeedNew, Needs, NeedsBody, Stock, StockBody, useObject } from './materials';
import { Fact, FactBody, Geometry, GeometryBody, Issues, IssuesBody, WorkLine, Works, WorksBody } from './works';
import type { BuildObject, Data } from '../../data/types';

/** What the foreman has to do on one object right now, most pressing first. */
function todo(d: Data, o: BuildObject): { key: string; title: string; sub: string; to: string; urgent?: boolean }[] {
  const out: { key: string; title: string; sub: string; to: string; urgent?: boolean }[] = [];
  for (const dl of d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected' && x.eta <= d.today))
    out.push({ key: dl.id, title: `Подтвердить получение: ${dl.source}`, sub: dl.lines.map((l) => `${material(d, l.materialId).name}, ${qty(l.qty, material(d, l.materialId).unit)}`).join('; '), to: `/foreman/deliveries/${dl.id}` });
  for (const n of d.needs.filter((x) => x.objectId === o.id && x.question && !x.question.answer))
    out.push({ key: n.id, title: `Ответить менеджеру по потребности № ${n.num}`, sub: n.question!.text, to: `/foreman/needs/${n.id}` });
  for (const w of d.works.filter((x) => x.objectId === o.id)) {
    if (workState(w, d.today) === 'late')
      out.push({ key: w.id, title: `Срок прошёл: ${w.name}`, sub: `выполнено ${num(workDone(w), 1)} из ${qty(w.plan, w.unit)}, срок был ${dShort(w.deadline)}`, to: '/foreman/works', urgent: true });
    else if (workToPresent(d, w) > 0)
      out.push({ key: w.id, title: `Предъявить к приёмке: ${w.name}`, sub: `${qty(workToPresent(d, w), w.unit)} выполнено и ещё не в акте`, to: '/foreman/fact' });
  }
  return out;
}

function Home() {
  const d = useData();
  const o = useObject();
  const tasks = todo(d, o);
  const waiting = d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected').sort((a, b) => a.eta.localeCompare(b.eta));
  const openLines = d.needs.filter((n) => n.objectId === o.id).flatMap((n) => n.lines).filter((l) => lineState(l) !== 'done');
  const problems = d.deliveries.filter((x) => x.objectId === o.id && x.status === 'problem');
  const weekEnd = addDays(weekStart(d.today), 6);
  const works = d.works.filter((w) => w.objectId === o.id && !['accepted', 'done'].includes(workState(w, d.today)) && (w.deadline <= weekEnd || workDone(w) > 0));
  const issues = d.issues.filter((i) => i.objectId === o.id && i.status !== 'done');
  return (
    <Page title={o.name}
      sub={`${dWeek(d.today)} · ${o.stage}. ${tasks.length ? `На сегодня ${count(tasks.length, 'дело', 'дела', 'дел')}.` : 'Срочных дел на объекте нет.'}`}>
      <Card title="Нужно сделать" note={tasks.length ? String(tasks.length) : undefined} flush>
        {tasks.length ? (
          <List>{tasks.map((t) => <Row key={t.key + t.title} to={t.to} wrap title={t.title} sub={t.sub} side={t.urgent ? <Pill tone="negative">Срок</Pill> : undefined} />)}</List>
        ) : <Empty>Всё подтверждено и предъявлено. Срочных дел нет.</Empty>}
      </Card>

      <div className="quick">
        <Link to="/foreman/needs/new" className="wide"><Plus size={20} /> Создать потребность</Link>
        <Link to="/foreman/deliveries"><Truck size={20} /> Подтвердить получение</Link>
        <Link to="/foreman/works"><Hammer size={20} /> Внести факт работ</Link>
        <Link to="/foreman/issues"><TriangleAlert size={20} /> Зафиксировать проблему</Link>
        <Link to="/foreman/geometry"><Ruler size={20} /> Сделать замер</Link>
        <Link to="/foreman/stock"><Boxes size={20} /> Материалы на объекте</Link>
        <Link to="/foreman/needs"><ClipboardList size={20} /> Мои потребности</Link>
      </div>

      <div className="grid cols-2">
        <Card title="Материалы" flush>
          <List>
            <Row to="/foreman/deliveries" title="Ждём поставки" sub={waiting.length ? `ближайшая: ${waiting[0].source}, ${dRel(waiting[0].eta, d.today).toLowerCase()}` : 'поставок не ожидается'} value={waiting.length} />
            <Row to="/foreman/needs" title="Позиции в работе" sub="заказаны, едут или ждут решения менеджера" value={openLines.length} />
            <Row to="/foreman/deliveries" title="Расхождения при получении" sub="недостача, пересорт или повреждение" value={<span className={problems.length ? 'neg' : ''}>{problems.length}</span>} />
          </List>
        </Card>
        <Card title="Работы на этой неделе" action={<More to="/foreman/works">План работ</More>} flush>
          {works.length ? <List>{works.slice(0, 4).map((w) => <WorkLine key={w.id} w={w} />)}</List> : <Empty>На эту неделю работ не запланировано.</Empty>}
        </Card>
      </div>
      <Card title="Открытые замечания" action={<More to="/foreman/issues">Все замечания</More>} flush>
        {issues.length ? (
          <List>{issues.slice(0, 3).map((i) => <Row key={i.id} to="/foreman/issues" wrap title={i.text} sub={`${i.place} · ${dRel(i.date, d.today).toLowerCase()}`} />)}</List>
        ) : <Empty>Открытых замечаний нет.</Empty>}
      </Card>
    </Page>
  );
}

function Objects() {
  const d = useData();
  const u = useUser();
  const nav = useNavigate();
  const list = d.objects.filter((o) => u.objectIds?.includes(o.id));
  return (
    <Page title="Мои объекты" sub={count(list.length, 'объект', 'объекта', 'объектов')}>
      <div className="grid cols-2">
        {list.map((o) => {
          const v = objectView(d, o);
          const tasks = todo(d, o);
          return (
            <Card key={o.id} title={o.name} action={<Pill>{o.stage}</Pill>}>
              <div className="stack">
                <p className="muted">{o.address}</p>
                <dl className="kv">
                  <dt>Работы выполнены</dt><dd>{pct(v.progress)}</dd>
                  <dt>Нужно сделать сейчас</dt><dd>{tasks.length}</dd>
                  <dt>Позиции материалов в работе</dt><dd>{v.openLines}</dd>
                  <dt>Открытые замечания</dt><dd className={v.openIssues ? 'neg' : ''}>{v.openIssues}</dd>
                </dl>
                {tasks[0] && <p><span className="muted">Ближайшее:</span> {tasks[0].title}</p>}
                <Btn block onClick={() => { act.setObject(o.id); nav(`/foreman/object/${o.id}`); }}>Открыть объект</Btn>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

type WsTab = 'overview' | 'geometry' | 'works' | 'materials' | 'docs' | 'issues';
function Workspace() {
  const d = useData();
  const { id } = useParams();
  const o = byId(d.objects, id);
  const [tab, setTab] = useState<WsTab>('overview');
  const [mat, setMat] = useState<'needs' | 'deliveries' | 'stock'>('needs');
  useEffect(() => { if (o && d.session.objectId !== o.id) act.setObject(o.id); }, [o, d.session.objectId]);
  if (!o) return <Page title="Объект не найден" back="/foreman/objects"><Card><Empty>У вас нет доступа к этому объекту.</Empty></Card></Page>;
  const rooms = d.rooms.filter((r) => r.objectId === o.id);
  const v = objectView(d, o);
  const tasks = todo(d, o);
  const waiting = d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected');
  const acts = d.acts.filter((a) => a.objectId === o.id);
  const avrs = d.avrs.filter((a) => a.objectId === o.id);
  return (
    <Page title={o.name} sub={`${o.stage} · ${o.address}`} back="/foreman/objects">
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Обзор' }, { value: 'geometry', label: 'Геометрия' }, { value: 'works', label: 'Работы' },
        { value: 'materials', label: 'Материалы' }, { value: 'docs', label: 'Документы' }, { value: 'issues', label: 'Фото и замечания' },
      ]} />
      {tab === 'overview' && (
        <>
          <Stats items={[
            { label: 'Работы выполнены', value: pct(v.progress), hint: `принято ${pct(v.accepted)}` },
            { label: 'Нужно сделать', value: tasks.length, zero: !tasks.length },
            { label: 'Ждём поставок', value: waiting.length, zero: !waiting.length },
            { label: 'Открытые замечания', value: v.openIssues, zero: !v.openIssues },
          ]} />
          <div className="grid cols-2">
            <Card title="Об объекте">
              <dl className="kv left">
                <dt>Заказчик</dt><dd>{o.customer}</dd>
                <dt>Договор</dt><dd>{o.contract}</dd>
                <dt>Сроки</dt><dd>{dFull(o.start)} – {dFull(o.finish)}</dd>
                <dt>Помещения</dt><dd>{count(rooms.length, 'помещение', 'помещения', 'помещений')}, {num(round1(rooms.reduce((s, r) => s + roomFloor(r), 0)), 1)} м² пола</dd>
              </dl>
            </Card>
            <Card title="Нужно сделать" flush>
              {tasks.length ? <List>{tasks.map((t) => <Row key={t.key + t.title} to={t.to} wrap title={t.title} sub={t.sub} />)}</List> : <Empty>Срочных дел по объекту нет.</Empty>}
            </Card>
          </div>
        </>
      )}
      {tab === 'geometry' && <GeometryBody objectId={o.id} />}
      {tab === 'works' && <><WorksBody objectId={o.id} /><FactBody objectId={o.id} /></>}
      {tab === 'materials' && (
        <>
          <Seg value={mat} onChange={setMat} options={[{ value: 'needs', label: 'Потребности' }, { value: 'deliveries', label: 'Получение' }, { value: 'stock', label: 'На объекте' }]} />
          {mat === 'needs' && <NeedsBody objectId={o.id} />}
          {mat === 'deliveries' && <DeliveriesBody objectId={o.id} />}
          {mat === 'stock' && <StockBody objectId={o.id} />}
        </>
      )}
      {tab === 'docs' && (
        <Card title="Документы объекта" flush>
          {acts.length + avrs.length ? (
            <List>
              {avrs.map((a) => <Row key={a.id} title={`Акт выполненных работ № ${a.num}`} sub={`${dShort(a.date)} · ${a.by}`} meta={a.status === 'accepted' ? 'принят' : a.status === 'review' ? 'на проверке' : 'возвращён'} />)}
              {acts.map((a) => <Row key={a.id} title={`Акт геометрии № ${a.num}`} sub={`${dShort(a.date)} · ${a.by}`} meta={`${num(a.floorArea, 1)} м²`} />)}
            </List>
          ) : <Empty>Документы появятся, когда вы сформируете акт геометрии или АВР.</Empty>}
        </Card>
      )}
      {tab === 'issues' && <IssuesBody objectId={o.id} />}
    </Page>
  );
}

/** On a phone the bottom bar has one tab per group; this strip switches between the sections of the group. */
function SubNav({ items }: { items: { to: string; label: string; count?: number }[] }) {
  const { pathname } = useLocation();
  return (
    <div className="subnav">
      <nav className="tabs" aria-label="Разделы группы">
        {items.map((i) => (
          <Link key={i.to} to={i.to} aria-current={pathname === i.to ? 'page' : undefined}>
            {i.label}{i.count ? <span className="badge">{i.count}</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
function MatNav() {
  const d = useData();
  const o = useObject();
  const due = d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected' && x.eta <= d.today).length;
  return <SubNav items={[{ to: '/foreman/needs', label: 'Потребности' }, { to: '/foreman/deliveries', label: 'Получение', count: due }, { to: '/foreman/stock', label: 'На объекте' }]} />;
}
const WorkNav = () => <SubNav items={[{ to: '/foreman/works', label: 'План работ' }, { to: '/foreman/fact', label: 'Факт и АВР' }, { to: '/foreman/geometry', label: 'Геометрия' }]} />;

export const routes = [
  { path: '/foreman', element: <Home /> },
  { path: '/foreman/objects', element: <Objects /> },
  { path: '/foreman/object/:id', element: <Workspace /> },
  { path: '/foreman/geometry', element: <><WorkNav /><Geometry /></> },
  { path: '/foreman/works', element: <><WorkNav /><Works /></> },
  { path: '/foreman/needs', element: <><MatNav /><Needs /></> },
  { path: '/foreman/needs/new', element: <NeedNew /> },
  { path: '/foreman/needs/:id', element: <NeedDetail /> },
  { path: '/foreman/deliveries', element: <><MatNav /><Deliveries /></> },
  { path: '/foreman/deliveries/:id', element: <DeliveryConfirm /> },
  { path: '/foreman/stock', element: <><MatNav /><Stock /></> },
  { path: '/foreman/fact', element: <><WorkNav /><Fact /></> },
  { path: '/foreman/issues', element: <Issues /> },
];
