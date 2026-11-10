// «Управление объектами» and the project card: what was agreed, what is built, what it costs and what waits for the economist.
import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { act, useData } from '../../data/store';
import {
  ISSUE_LABEL, WORK_LABEL, WORK_TONE, byId, lineState, objectView, roomFloor, roomVolume, roomWalls, round1, siteStock, sumIn, sumOut,
  userName, workDone, workState, workToPresent, type ObjectView, type SiteRow, type Tone,
} from '../../data/select';
import { Btn, Card, Chips, DataTable, Empty, Finding, List, Page, Pill, Row, Sheet, Stats, Stepper, Tabs, Track, Two, toast, useWide, type Col } from '../../ui/kit';
import { NoteSheet, OpRow, OpSheet } from '../../shared/money';
import { count, dFull, dShort, daysBetween, money, moneySigned, num, pct, plural, qty } from '../../lib/format';
import type { Avr, AvrLine, BuildObject, Data, GeometryAct, Room, Work } from '../../data/types';
import { NeedLineBlock, Wrap, dash, dec, n1 } from './rest-bits';

const share = (part: number, whole: number): string => (whole ? pct(part / whole) : '—');
const signed = (v: number): ReactNode => <span className={v < 0 ? 'neg' : v > 0 ? 'pos' : 'muted'}>{moneySigned(v)}</span>;
const placeOf = (d: Data, w: Work): string => {
  const r = byId(d.rooms, w.roomId);
  return r ? `${r.name}, ${r.floor}` : 'Весь объект';
};

/** What stands out on an object, the worst first. Red only for what is overdue or over the plan. */
function flags(d: Data, v: ObjectView): { tone: Tone; text: string }[] {
  const o = v.object;
  const review = d.avrs.filter((a) => a.objectId === o.id && a.status === 'review').length;
  const f: { tone: Tone; text: string }[] = [];
  if (v.spent > o.planCost) f.push({ tone: 'negative', text: `Затраты выше плана на ${money(v.spent - o.planCost)}` });
  if (v.lateWorks) f.push({ tone: 'negative', text: `${count(v.lateWorks, 'работа', 'работы', 'работ')} с прошедшим сроком` });
  if (review) f.push({ tone: 'hue', text: `${count(review, 'АВР', 'АВР', 'АВР')} на проверке` });
  if (v.openLines) f.push({ tone: 'warning', text: count(v.openLines, 'позиция не обеспечена', 'позиции не обеспечены', 'позиций не обеспечено') });
  if (v.openIssues) f.push({ tone: 'neutral', text: count(v.openIssues, 'замечание', 'замечания', 'замечаний') });
  return f;
}

/* --------------------------------------------------------------- the list */
export function Objects() {
  const d = useData();
  const views = d.objects.map((o) => objectView(d, o));
  const active = d.objects.filter((o) => o.status === 'active').length;
  const spent = views.reduce((s, v) => s + v.spent, 0);
  const plan = d.objects.reduce((s, o) => s + o.planCost, 0);
  const income = views.reduce((s, v) => s + v.income, 0);
  const contract = d.objects.reduce((s, o) => s + o.contractSum, 0);
  const late = views.reduce((s, v) => s + v.lateWorks, 0);
  const review = d.avrs.filter((a) => a.status === 'review').length;
  const over = views.filter((v) => v.spent > v.object.planCost);
  const waits = [late ? `${count(late, 'работа', 'работы', 'работ')} с прошедшим сроком` : '', review ? `${count(review, 'АВР ждёт', 'АВР ждут', 'АВР ждут')} проверки` : ''].filter(Boolean);
  return (
    <Page title="Управление объектами"
      sub={over.length ? `Затраты выше плана: ${over.map((v) => v.object.name).join(', ')}.`
        : waits.length ? `${waits.join(', ')}.`
          : 'Работ с прошедшим сроком и актов на проверке нет.'}>
      <Stats items={[
        { label: 'Затраты по объектам', value: money(spent), lead: true, hint: `${share(spent, plan)} плановых затрат ${money(plan)}` },
        { label: 'Получено от заказчиков', value: money(income), hint: `из ${money(contract)} по договорам` },
        { label: 'Объектов в работе', value: active, zero: !active, hint: `всего ${d.objects.length}` },
        { label: 'АВР на проверке', value: review, zero: !review },
        { label: 'Работ с прошедшим сроком', value: late ? <span className="neg">{late}</span> : 0, zero: !late },
      ]} />
      {views.length === 0 && <Card title="Объекты"><Empty>Объектов пока нет.</Empty></Card>}
      <div className="grid cols-2">
        {views.map((v) => <ObjectLink key={v.object.id} v={v} />)}
      </div>
    </Page>
  );
}

function ObjectLink({ v }: { v: ObjectView }) {
  const d = useData();
  const o = v.object;
  const over = v.spent > o.planCost;
  const fl = flags(d, v);
  return (
    <Link to={`/admin/objects/${o.id}`} className="card" style={{ display: 'block' }}>
      <div className="card-head">
        <h2>{o.name}</h2>
        <ChevronRight size={18} color="var(--faint)" />
      </div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <p className="muted">{o.stage} · прораб {userName(d, o.foremanId)} · заказчик {o.customer}</p>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <span>Выполнено</span>
            <span className="num">{pct(v.progress)} <span className="muted">· принято {pct(v.accepted)}</span></span>
          </div>
          <Track value={v.accepted} second={v.progress} max={1} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <span>Затраты из плана</span>
            <span className={`num ${over ? 'neg' : ''}`}>{money(v.spent)} из {money(o.planCost)}</span>
          </div>
          <Track value={v.spent} max={o.planCost} />
        </div>
        <div className="btn-row">
          {fl.map((x) => <Pill key={x.text} tone={x.tone}>{x.text}</Pill>)}
          {!fl.length && <Pill tone="positive">Отклонений нет</Pill>}
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------- the project card */
type TabId = 'overview' | 'geometry' | 'works' | 'materials' | 'avr' | 'money';
const TAB_IDS: TabId[] = ['overview', 'geometry', 'works', 'materials', 'avr', 'money'];
const OBJECT_STATUS: Record<BuildObject['status'], string> = { active: 'В работе', paused: 'Приостановлен', done: 'Сдан' };

export function ObjectCard() {
  const { id } = useParams();
  const d = useData();
  const [sp, setSp] = useSearchParams();
  const o = byId(d.objects, id);
  if (!o) {
    return (
      <Page title="Объект не найден" back="/admin/objects">
        <Card title="Объект"><Empty>Такого объекта нет. Возможно, ссылка устарела.</Empty></Card>
      </Page>
    );
  }
  const raw = sp.get('tab') as TabId | null;
  const tab: TabId = raw && TAB_IDS.includes(raw) ? raw : 'overview';
  const setTab = (t: TabId) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true });
  const review = d.avrs.filter((a) => a.objectId === o.id && a.status === 'review').length;
  return (
    <Page back="/admin/objects" title={o.name} sub={`${o.stage} · ${o.address} · заказчик ${o.customer}`}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Обзор' },
        { value: 'geometry', label: 'Геометрия' },
        { value: 'works', label: 'Работы' },
        { value: 'materials', label: 'Материалы' },
        { value: 'avr', label: 'АВР', count: review || undefined },
        { value: 'money', label: 'Деньги' },
      ]} />
      {tab === 'overview' && <Overview o={o} go={setTab} />}
      {tab === 'geometry' && <Geometry o={o} />}
      {tab === 'works' && <Works o={o} />}
      {tab === 'materials' && <Materials o={o} />}
      {tab === 'avr' && <AvrTab o={o} />}
      {tab === 'money' && <MoneyTab o={o} />}
    </Page>
  );
}

/* --------------------------------------------------------------- overview */
function Overview({ o, go }: { o: BuildObject; go: (t: TabId) => void }) {
  const d = useData();
  const v = objectView(d, o);
  const over = v.spent > o.planCost;
  const left = daysBetween(d.today, o.finish);
  const review = d.avrs.filter((a) => a.objectId === o.id && a.status === 'review');
  const toPresent = d.works.filter((w) => w.objectId === o.id && workToPresent(d, w) > 0).length;
  const issues = d.issues.filter((i) => i.objectId === o.id && i.status !== 'done');
  const quiet = !v.lateWorks && !toPresent && !v.openLines && !issues.length;
  return (
    <>
      {review.map((a) => (
        <Finding key={a.id} icon={<FileText size={18} />}>
          АВР № {a.num} от {dShort(a.date)} ждёт проверки объёмов.
          <div style={{ marginTop: 8 }}><Btn small onClick={() => go('avr')}>Проверить акт</Btn></div>
        </Finding>
      ))}
      <Stats items={[
        { label: 'Стоимость по договору', value: money(o.contractSum), lead: true, hint: o.contract },
        { label: 'Получено от заказчика', value: money(v.income), hint: `${share(v.income, o.contractSum)} договора` },
        { label: 'Затраты', value: <span className={over ? 'neg' : ''}>{money(v.spent)}</span>, hint: `${share(v.spent, o.planCost)} плановых` },
        { label: 'Плановые затраты', value: money(o.planCost) },
        { label: 'Ожидаемый результат', value: <span className={v.expectedResult < 0 ? 'neg' : ''}>{money(v.expectedResult)}</span>, hint: 'договор минус плановые затраты' },
      ]} />
      <div className="grid cols-2">
        <Card title="Затраты и работы">
          <div className="stack" style={{ gap: 16 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                <span>Затраты против плана</span>
                <span className={`num ${over ? 'neg' : ''}`}>{money(v.spent)} из {money(o.planCost)}</span>
              </div>
              <Track value={v.spent} max={o.planCost} />
              <div className="track-ends">
                <span>{share(v.spent, o.planCost)} плана</span>
                <span>{over ? `перерасход ${money(v.spent - o.planCost)}` : `в запасе ${money(o.planCost - v.spent)}`}</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                <span>Работы</span>
                <span className="num">выполнено {pct(v.progress)} · принято {pct(v.accepted)}</span>
              </div>
              <Track value={v.accepted} second={v.progress} max={1} />
              <div className="legend" style={{ marginTop: 6 }}>
                <span><i className="mk-received" />принято</span>
                <span><i className="mk-ordered" />выполнено, не принято</span>
              </div>
            </div>
          </div>
        </Card>
        <Card title="Договор и сроки">
          <dl className="kv left">
            <dt>Договор</dt><dd>{o.contract}</dd>
            <dt>Заказчик</dt><dd>{o.customer}</dd>
            <dt>Юрлицо</dt><dd>{byId(d.entities, o.entityId)?.name ?? dash}</dd>
            <dt>Прораб</dt><dd>{userName(d, o.foremanId)}</dd>
            <dt>Начало</dt><dd>{dFull(o.start)}</dd>
            <dt>Сдача</dt>
            <dd>
              {dFull(o.finish)}{' '}
              {o.status === 'done' ? null
                : left > 0 ? <span className="muted">· {plural(left, 'остался', 'осталось', 'осталось')} {count(left, 'день', 'дня', 'дней')}</span>
                  : left === 0 ? <span className="muted">· сегодня</span>
                    : <span className="neg">· срок прошёл {count(-left, 'день', 'дня', 'дней')} назад</span>}
            </dd>
            <dt>Состояние</dt><dd>{OBJECT_STATUS[o.status]}</dd>
          </dl>
        </Card>
      </div>
      <Card title="Отклонения и замечания" flush>
        {quiet ? <Empty>Отклонений и открытых замечаний по объекту нет.</Empty> : (
          <List>
            {v.lateWorks > 0 && <Row onClick={() => go('works')} title="Работы с прошедшим сроком" value={<span className="neg">{v.lateWorks}</span>} />}
            {toPresent > 0 && <Row onClick={() => go('works')} title="Выполнено и не предъявлено к приёмке" sub="Объём есть в факте работ, но не вошёл ни в один акт" value={toPresent} />}
            {v.openLines > 0 && <Row onClick={() => go('materials')} title="Позиции материалов не обеспечены" value={v.openLines} />}
            {issues.map((i) => (
              <Row key={i.id} wrap title={`${ISSUE_LABEL[i.kind]}: ${i.place}`} sub={`${i.text} ${i.by}, ${dShort(i.date)}.`}
                side={<Pill tone={i.status === 'open' ? 'warning' : 'neutral'}>{i.status === 'open' ? 'Открыто' : 'В работе'}</Pill>} />
            ))}
          </List>
        )}
      </Card>
    </>
  );
}

/* --------------------------------------------------------------- geometry */
function Geometry({ o }: { o: BuildObject }) {
  const d = useData();
  const wide = useWide();
  const [roomId, setRoomId] = useState<string | null>(null);
  const rooms = d.rooms.filter((r) => r.objectId === o.id);
  const acts = d.acts.filter((a) => a.objectId === o.id).sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num);
  const room = byId(rooms, roomId);
  const dims = (r: Room): string => `${dec(r.length)} × ${dec(r.width)} × ${dec(r.height)}`;
  const floor = rooms.reduce((s, r) => s + roomFloor(r), 0);
  const walls = rooms.reduce((s, r) => s + roomWalls(r), 0);
  const edits = (r: Room): number => Math.max(0, r.history.length - 1);
  const cols: Col<Room>[] = [
    { head: 'Этаж и помещение', phone: 'title', cell: (r) => (wide ? <Two a={r.name} b={r.floor} /> : `${r.name}, ${r.floor}`) },
    { head: 'Д × Ш × В, м', phone: 'sub', cell: (r) => (wide ? dims(r) : `${dims(r)} м`) },
    { head: 'Пол, м²', num: true, phone: 'value', cell: (r) => (wide ? num(roomFloor(r), 1) : `${num(roomFloor(r), 1)} м²`) },
    { head: 'Стены, м²', num: true, phone: 'sub', cell: (r) => (wide ? num(roomWalls(r), 1) : `стены ${num(roomWalls(r), 1)} м²`) },
    { head: 'Отклонение, мм', num: true, phone: 'sub', cell: (r) => (r.deviation === undefined ? (wide ? dash : 'отклонение не замерено') : wide ? num(r.deviation) : `отклонение ${num(r.deviation)} мм`) },
    { head: 'Замер', phone: 'meta', cell: (r) => (wide ? <Two a={dShort(r.measuredAt)} b={edits(r) ? count(edits(r), 'правка', 'правки', 'правок') : undefined} /> : dShort(r.measuredAt)) },
  ];
  return (
    <>
      <Card title="Помещения" note={rooms.length ? `${count(rooms.length, 'помещение', 'помещения', 'помещений')} · пол ${num(floor, 1)} м²` : undefined} flush>
        <DataTable cols={cols} rows={rooms} keyOf={(r) => r.id} onRow={(r) => setRoomId(r.id)} empty="Замеров по объекту ещё нет."
          foot={['Итого', '', num(floor, 1), num(walls, 1), '', '']} />
      </Card>
      <Card title="Акты геометрии" flush>
        {acts.length ? (
          <List>
            {acts.map((a: GeometryAct) => (
              <Row key={a.id} title={`Акт геометрии № ${a.num}`} sub={`${dFull(a.date)} · ${a.by}`}
                value={`${num(a.floorArea, 1)} м²`} meta={count(a.rooms, 'помещение', 'помещения', 'помещений')} />
            ))}
          </List>
        ) : <Empty>Актов геометрии по объекту ещё нет.</Empty>}
      </Card>
      <Sheet open={!!room} title={room ? `${room.name}, ${room.floor}` : ''} onClose={() => setRoomId(null)}>
        {room && (
          <div className="stack" style={{ gap: 16 }}>
            <dl className="kv">
              <dt>Длина × ширина × высота</dt><dd>{dims(room)} м</dd>
              <dt>Площадь пола</dt><dd>{num(roomFloor(room), 1)} м²</dd>
              <dt>Площадь стен без проёмов</dt><dd>{num(roomWalls(room), 1)} м²</dd>
              <dt>Объём</dt><dd>{num(roomVolume(room), 1)} м³</dd>
              <dt>Отклонение стен и пола</dt><dd>{room.deviation === undefined ? dash : `${num(room.deviation)} мм`}</dd>
              <dt>Последний замер</dt><dd>{dFull(room.measuredAt)}, {room.measuredBy}</dd>
              <dt>Фото</dt><dd>{room.photos}</dd>
            </dl>
            {room.note && <p>{room.note}</p>}
            <div>
              <div className="section-title" style={{ margin: '0 0 6px' }}>Проёмы</div>
              {room.openings.length ? room.openings.map((op, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                  <span>{op.kind === 'door' ? 'Дверь' : 'Окно'} {dec(op.w)} × {dec(op.h)} м</span>
                  <span className="num muted">{num(op.w * op.h, 1)} м²</span>
                </div>
              )) : <p className="muted">Проёмов нет.</p>}
            </div>
            <div>
              <div className="section-title" style={{ margin: '0 0 6px' }}>История изменений</div>
              {[...room.history].reverse().map((h, i) => (
                <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>
              ))}
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Замер не перезаписывается: каждое изменение остаётся строкой в истории.</p>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ works */
function Works({ o }: { o: BuildObject }) {
  const d = useData();
  const wide = useWide();
  const [workId, setWorkId] = useState<string | null>(null);
  const works = d.works.filter((w) => w.objectId === o.id);
  const v = objectView(d, o);
  const work = byId(works, workId);
  const state = (w: Work): ReactNode => { const s = workState(w, d.today); return <Pill tone={WORK_TONE[s]}>{WORK_LABEL[s]}</Pill>; };
  const deadline = (w: Work): ReactNode => (workState(w, d.today) === 'late' ? <span className="neg">{dShort(w.deadline)}</span> : dShort(w.deadline));
  const cols: Col<Work>[] = wide ? [
    { head: 'Работа и помещение', cell: (w) => <Two a={w.name} b={placeOf(d, w)} /> },
    { head: 'План', num: true, cell: (w) => qty(w.plan, w.unit) },
    { head: 'Выполнено', num: true, cell: (w) => qty(workDone(w), w.unit) },
    { head: 'Принято', num: true, cell: (w) => qty(w.accepted, w.unit) },
    { head: 'Срок', cell: deadline },
    { head: 'Состояние', cell: state },
  ] : [
    { head: 'Работа', phone: 'title', cell: (w) => <Wrap>{w.name}</Wrap> },
    { head: 'Помещение', phone: 'sub', cell: (w) => placeOf(d, w) },
    { head: 'Принято', phone: 'sub', cell: (w) => `принято ${qty(w.accepted, w.unit)}` },
    { head: 'Срок', phone: 'sub', cell: (w) => <>срок {deadline(w)}</> },
    { head: 'Выполнено', phone: 'value', cell: (w) => `${n1(workDone(w))} из ${qty(w.plan, w.unit)}` },
    { head: 'Состояние', phone: 'meta', cell: state },
  ];
  const facts = work ? [...work.facts].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const inActs = work ? d.avrs.flatMap((a) => a.lines.filter((l) => l.workId === work.id).map((l) => ({ a, l }))) : [];
  return (
    <>
      <Card title="Работы" note={works.length ? `выполнено ${pct(v.progress)} · принято ${pct(v.accepted)}` : undefined} flush>
        <DataTable cols={cols} rows={works} keyOf={(w) => w.id} onRow={(w) => setWorkId(w.id)} empty="План работ по объекту ещё не составлен." />
      </Card>
      <Sheet open={!!work} title={work?.name ?? ''} onClose={() => setWorkId(null)}>
        {work && (
          <div className="stack" style={{ gap: 16 }}>
            <dl className="kv">
              <dt>Помещение</dt><dd>{placeOf(d, work)}</dd>
              <dt>План</dt><dd>{qty(work.plan, work.unit)}</dd>
              <dt>Выполнено по факту</dt><dd>{qty(workDone(work), work.unit)}</dd>
              <dt>Принято</dt><dd>{qty(work.accepted, work.unit)}</dd>
              <dt>Выполнено и не вошло в акты</dt><dd>{qty(workToPresent(d, work), work.unit)}</dd>
              <dt>Срок</dt><dd>{deadline(work)}</dd>
              <dt>Состояние</dt><dd>{state(work)}</dd>
            </dl>
            <div>
              <div className="section-title" style={{ margin: '0 0 6px' }}>Записи о выполнении</div>
              {facts.length ? facts.map((f, i) => (
                <p key={i} style={{ marginBottom: 4 }}>
                  <span className="muted">{dShort(f.date)}, {f.by}:</span> {qty(f.qty, work.unit)}
                  {f.note ? `. ${f.note}` : ''}{f.photos ? <span className="muted"> · фото: {f.photos}</span> : null}
                </p>
              )) : <p className="muted">Факт по этой работе ещё не вносили.</p>}
            </div>
            <div>
              <div className="section-title" style={{ margin: '0 0 6px' }}>В актах</div>
              {inActs.length ? inActs.map(({ a, l }) => (
                <p key={a.id} style={{ marginBottom: 4 }}>
                  <span className="muted">АВР № {a.num} от {dShort(a.date)}:</span> заявлено {qty(l.qty, work.unit)},{' '}
                  {a.status === 'accepted' ? `принято ${qty(l.accepted ?? 0, work.unit)}` : a.status === 'review' ? 'на проверке' : 'возвращён на доработку'}
                </p>
              )) : <p className="muted">Работа не входила ни в один акт.</p>}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------- materials */
function Materials({ o }: { o: BuildObject }) {
  const d = useData();
  const wide = useWide();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const lines = d.needs
    .filter((n) => n.objectId === o.id)
    .flatMap((n) => n.lines.map((line) => ({ need: n, line, done: lineState(line) === 'done' })));
  const open = lines.filter((x) => !x.done);
  const list = [...(show === 'open' ? open : lines)].sort((a, b) =>
    Number(a.done) - Number(b.done) || (a.done ? b.line.wantDate.localeCompare(a.line.wantDate) : a.line.wantDate.localeCompare(b.line.wantDate)));
  const stock = siteStock(d, o.id);
  const cols: Col<SiteRow>[] = wide ? [
    { head: 'Материал', cell: (r) => r.material.name },
    { head: 'Ед.', cell: (r) => r.material.unit },
    { head: 'Получено', num: true, cell: (r) => n1(r.received) },
    { head: 'Использовано', num: true, cell: (r) => n1(r.used) },
    { head: 'Потери', num: true, cell: (r) => n1(r.lost) },
    { head: 'Возврат и перемещение', num: true, cell: (r) => n1(r.returned + r.moved) },
    { head: 'Остаток на объекте', num: true, cell: (r) => <Two a={n1(r.left)} b={r.issued ? `у бригады ${n1(r.issued)}` : undefined} /> },
  ] : [
    { head: 'Материал', phone: 'title', cell: (r) => <Wrap>{r.material.name}</Wrap> },
    { head: 'Получено', phone: 'sub', cell: (r) => `получено ${n1(r.received)}` },
    { head: 'Использовано', phone: 'sub', cell: (r) => `использовано ${n1(r.used)}` },
    { head: 'Потери', phone: 'sub', cell: (r) => `потери ${n1(r.lost)}${r.returned + r.moved ? ` · возврат и перемещение ${n1(r.returned + r.moved)}` : ''}${r.issued ? ` · у бригады ${n1(r.issued)}` : ''}` },
    { head: 'Остаток', phone: 'value', cell: (r) => qty(r.left, r.material.unit) },
  ];
  return (
    <>
      <Chips value={show} onChange={setShow} options={[
        { value: 'open', label: 'Не обеспечены', count: open.length },
        { value: 'all', label: 'Все позиции', count: lines.length },
      ]} />
      <Card title="Потребности объекта" flush>
        {list.length ? (
          <div className="list">
            {list.map(({ need, line, done }) => (
              <div key={line.id} className="row" style={{ display: 'block' }}>
                <NeedLineBlock line={line} legend={!done}
                  caption={`Потребность № ${need.num} · нужно к ${dShort(line.wantDate)}${line.comment ? ` · ${line.comment}` : ''}`} />
              </div>
            ))}
          </div>
        ) : <Empty>{lines.length ? 'Все позиции объекта обеспечены.' : 'Потребностей в материалах по объекту ещё не было.'}</Empty>}
      </Card>
      <Card title="Материалы на объекте" note={stock.length ? count(stock.length, 'позиция', 'позиции', 'позиций') : undefined} flush>
        <DataTable cols={cols} rows={stock} keyOf={(r) => r.material.id} empty="На объект ещё ничего не поступало." />
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------- АВР */
const AVR_STATUS: Record<Avr['status'], { text: string; tone: Tone }> = {
  review: { text: 'На проверке', tone: 'hue' },
  accepted: { text: 'Объёмы приняты', tone: 'positive' },
  returned: { text: 'Возвращён на доработку', tone: 'warning' },
};

function AvrTab({ o }: { o: BuildObject }) {
  const d = useData();
  const avrs = d.avrs
    .filter((a) => a.objectId === o.id)
    .sort((a, b) => Number(b.status === 'review') - Number(a.status === 'review') || b.date.localeCompare(a.date) || b.num - a.num);
  if (!avrs.length) return <Card title="Акты выполненных работ"><Empty>Актов выполненных работ по объекту ещё нет.</Empty></Card>;
  return <>{avrs.map((a) => <AvrCard key={a.id} a={a} />)}</>;
}

/** One act. While it is on review the economist sets the accepted volume per work; the reported volume is never touched. */
function AvrCard({ a }: { a: Avr }) {
  const d = useData();
  const [acc, setAcc] = useState<Record<string, number>>(() => Object.fromEntries(a.lines.map((l) => [l.workId, l.qty])));
  const [back, setBack] = useState(false);
  const st = AVR_STATUS[a.status];
  const value = (l: AvrLine): number => acc[l.workId] ?? l.qty;
  const cut = a.lines.filter((l) => value(l) < l.qty).length;
  const nothing = a.lines.every((l) => value(l) <= 0);
  const accept = () => {
    act.decideAvr(a.id, 'accepted', Object.fromEntries(a.lines.map((l) => [l.workId, value(l)])));
    toast(cut ? `АВР № ${a.num}: объёмы приняты с корректировкой` : `АВР № ${a.num}: объёмы приняты полностью`);
  };
  return (
    <Card title={`АВР № ${a.num}`} action={<Pill tone={st.tone}>{st.text}</Pill>} flush>
      <div className="row first" style={{ minHeight: 0, paddingTop: 2, paddingBottom: 8 }}>
        <span className="row-main muted">от {dFull(a.date)} · сформировал {a.by} · {count(a.lines.length, 'работа', 'работы', 'работ')}</span>
      </div>
      {a.status === 'review' ? (
        <>
          <div className="list">
            {a.lines.map((l) => {
              const w = byId(d.works, l.workId);
              const unit = w?.unit ?? '';
              return (
                <div key={l.workId} className="row" style={{ flexWrap: 'wrap', borderTop: '1px solid var(--rule)' }}>
                  <div className="row-main" style={{ flexBasis: 200 }}>
                    <div className="row-title wrap">{w?.name ?? 'Работы нет в плане'}</div>
                    <div className="row-sub">
                      {w ? `${placeOf(d, w)} · ` : ''}заявлено {qty(l.qty, unit)}{w ? ` · по плану ${qty(w.plan, unit)} · принято раньше ${qty(w.accepted, unit)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                    <Stepper value={value(l)} max={l.qty} onChange={(x) => setAcc({ ...acc, [l.workId]: x })} label={`Принятый объём, ${unit}: ${w?.name ?? ''}`} />
                    <span className="muted" style={{ minWidth: 22 }}>{unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="card-body stack" style={{ gap: 10, borderTop: '1px solid var(--rule)' }}>
            <p className="muted" style={{ fontSize: 13, maxWidth: '76ch' }}>
              Заявленный прорабом объём и принятый объём хранятся отдельно: заявленное не изменится, принятое запишется рядом с ним.
              {cut > 0 && !nothing ? ` Сейчас по ${count(cut, 'работе', 'работам', 'работам')} принимается меньше заявленного.` : ''}
              {nothing ? ' Чтобы не принимать ничего, верните акт на доработку.' : ''}
            </p>
            <div className="btn-row" style={{ maxWidth: 480 }}>
              <Btn kind="primary" style={{ flex: '1 1 180px' }} disabled={nothing} onClick={accept}>Принять объёмы</Btn>
              <Btn style={{ flex: '1 1 180px' }} onClick={() => setBack(true)}>Вернуть на доработку</Btn>
            </div>
          </div>
          <NoteSheet open={back} title={`Вернуть АВР № ${a.num} на доработку`} label="Что нужно исправить" action="Вернуть" required
            onClose={() => setBack(false)}
            onSubmit={(note) => { act.decideAvr(a.id, 'returned', {}, note); toast(`АВР № ${a.num} возвращён на доработку`); setBack(false); }} />
        </>
      ) : (
        <div className="list">
          {a.lines.map((l) => {
            const w = byId(d.works, l.workId);
            const unit = w?.unit ?? '';
            const less = a.status === 'accepted' && l.accepted !== undefined && l.accepted < l.qty;
            return (
              <div key={l.workId} className="row" style={{ borderTop: '1px solid var(--rule)' }}>
                <div className="row-main">
                  <div className="row-title wrap">{w?.name ?? 'Работы нет в плане'}</div>
                  <div className="row-sub">{w ? placeOf(d, w) : ''}{less ? `${w ? ' · ' : ''}принято меньше заявленного на ${qty(round1(l.qty - (l.accepted ?? 0)), unit)}` : ''}</div>
                </div>
                <div className="row-side">
                  <div className="row-value">{a.status === 'accepted' ? `принято ${qty(l.accepted ?? 0, unit)}` : 'не принято'}</div>
                  <div className="row-meta">заявлено {qty(l.qty, unit)}</div>
                </div>
              </div>
            );
          })}
          {a.note && (
            <div className="row" style={{ minHeight: 0, borderTop: '1px solid var(--rule)' }}>
              <span className="row-main"><span className="muted">{a.status === 'returned' ? 'Причина возврата:' : 'Комментарий:'}</span> {a.note}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ money */
function MoneyTab({ o }: { o: BuildObject }) {
  const d = useData();
  const [opId, setOpId] = useState<string | null>(null);
  const ops = d.operations.filter((x) => x.objectId === o.id).reverse().sort((a, b) => b.date.localeCompare(a.date));
  const inc = sumIn(ops);
  const out = sumOut(ops);
  const open = d.requests.filter((r) => r.objectId === o.id && ['pending', 'approved', 'noted', 'clarify'].includes(r.status));
  const debts = open.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <Stats items={[
        { label: 'Получено от заказчика', value: inc ? `+${money(inc)}` : money(0), lead: true, zero: !inc, hint: `${share(inc, o.contractSum)} договора на ${money(o.contractSum)}` },
        { label: 'Затраты', value: <span className={out > o.planCost ? 'neg' : ''}>{money(out)}</span>, hint: `из ${money(o.planCost)} по плану` },
        { label: 'Сальдо по объекту', value: signed(inc - out) },
        { label: 'В открытых заявках', value: money(debts), zero: !debts, hint: open.length ? count(open.length, 'заявка', 'заявки', 'заявок') : 'заявок нет' },
      ]} />
      <Card title="Операции по объекту" note={ops.length ? count(ops.length, 'операция', 'операции', 'операций') : undefined} flush>
        {ops.length
          ? <List>{ops.map((x) => <OpRow key={x.id} op={x} onClick={() => setOpId(x.id)} />)}</List>
          : <Empty>Денежных операций по объекту ещё нет.</Empty>}
      </Card>
      <OpSheet op={byId(d.operations, opId) ?? null} onClose={() => setOpId(null)} editable />
    </>
  );
}
