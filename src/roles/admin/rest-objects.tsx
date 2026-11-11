// «Объекты» and the card of one object. Each tab shows the main thing first; the rest is under «Подробнее».
import { useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { act, useData } from '../../data/store';
import {
  ELEMENT_LABEL, ISSUE_LABEL, METHOD_LABEL, REQUEST_LABEL, REQUEST_TONE, WORK_LABEL, WORK_TONE, byId, confirmedGeo, currentGeo, elementArea, floorsOf, lineState,
  objectView, roomFloor, roomSlopes, roomSurface, roomVolume, roomsOn, round1, siteStock, sumIn, sumOut, totalsOf,
  userName, workDone, workState, workToPresent, type ObjectView, type SiteRow, type Tone,
} from '../../data/select';
import {
  AmountInput, Btn, Card, Chips, DataTable, Details, Empty, Field, List, Page, Pill, Row, Sheet, Stats, Status, Stepper, Tabs, Two, toast, useWide,
  type Col, type StatusKind,
} from '../../ui/kit';
import { NoteSheet, OpRow, OpSheet } from '../../shared/money';
import { addDays, count, dFull, dShort, daysBetween, money, moneySigned, num, pct, plural, qty } from '../../lib/format';
import type { Avr, AvrLine, BuildObject, Data, GeometryAct, Room, Work } from '../../data/types';
import { NeedLineBlock, Wrap, dash, dec, n1 } from './rest-bits';
// the versions of a floor look the same for the foreman who measures and for the economist who checks
import { GeoPill, VersionList, deltaLine, worstUneven } from '../foreman/geometry';

const OBJECTS = { label: 'Объекты', to: '/admin/objects' };
const signed = (v: number): ReactNode => <span className={v < 0 ? 'neg' : v > 0 ? 'pos' : 'muted'}>{moneySigned(v)}</span>;
const placeOf = (d: Data, w: Work): string => {
  const r = byId(d.rooms, w.roomId);
  return r ? `${r.name}, ${r.floor}` : 'Весь объект';
};

/** The one thing that is wrong on an object, the worst first: red for money over the plan or a missed deadline, amber for open remarks. */
function flag(v: ObjectView): { kind: StatusKind; text: string } | undefined {
  if (v.spent > v.object.planCost) return { kind: 'problem', text: 'Перерасход' };
  if (v.lateWorks) return { kind: 'problem', text: 'Срок прошёл' };
  if (v.openIssues) return { kind: 'wait', text: count(v.openIssues, 'замечание', 'замечания', 'замечаний') };
  return undefined;
}

/* --------------------------------------------------------------- the list */
export function Objects() {
  const d = useData();
  const views = d.objects.map((o) => objectView(d, o));
  return (
    <Page title="Объекты">
      <Card flush>
        {views.length ? (
          <List>
            {views.map((v) => {
              const f = flag(v);
              return (
                <Row key={v.object.id} to={`/admin/objects/${v.object.id}`} wrap title={v.object.name} sub={v.object.stage}
                  value={pct(v.progress)} meta="сделано" side={f ? <Status kind={f.kind}>{f.text}</Status> : undefined} />
              );
            })}
          </List>
        ) : <Empty>Объектов пока нет.</Empty>}
      </Card>
    </Page>
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
      <Page title="Объект не найден" path={[OBJECTS, { label: 'Не найден' }]}>
        <Card><Empty>Такого объекта нет. Возможно, ссылка устарела.</Empty></Card>
      </Page>
    );
  }
  const raw = sp.get('tab') as TabId | null;
  const tab: TabId = raw && TAB_IDS.includes(raw) ? raw : 'overview';
  const setTab = (t: TabId) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true });
  const review = d.avrs.filter((a) => a.objectId === o.id && a.status === 'review').length;
  const geoReview = d.geoVersions.filter((v) => v.objectId === o.id && v.status === 'review').length;
  return (
    <Page title={o.name} path={[OBJECTS, { label: o.name }]}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Обзор' },
        { value: 'geometry', label: 'Замеры', count: geoReview || undefined },
        { value: 'works', label: 'Работы' },
        { value: 'materials', label: 'Материалы' },
        { value: 'avr', label: 'Акты', count: review || undefined },
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
  const geo = floorsOf(d, o.id).filter((f) => currentGeo(d, o.id, f)?.status === 'review');
  const toPresent = d.works.filter((w) => w.objectId === o.id && workToPresent(d, w) > 0).length;
  const issues = d.issues.filter((i) => i.objectId === o.id && i.status !== 'done');
  const quiet = !review.length && !geo.length && !over && !v.lateWorks && !toPresent && !v.openLines && !issues.length;
  return (
    <>
      <Stats items={[
        { label: 'Сделано', value: pct(v.progress), lead: true, hint: `принято ${pct(v.accepted)}` },
        { label: 'Затраты', value: <span className={over ? 'neg' : ''}>{money(v.spent)}</span>, hint: over ? `выше плана на ${money(v.spent - o.planCost)}` : `из ${money(o.planCost)} по плану` },
        { label: 'Получено от заказчика', value: money(v.income), hint: `из ${money(o.contractSum)}` },
      ]} />
      <Card title="Что не так" flush>
        {quiet ? <Empty>Отклонений и замечаний нет.</Empty> : (
          <List>
            {review.map((a) => <Row key={a.id} onClick={() => go('avr')} title={`Проверить АВР № ${a.num}`} sub={`от ${dShort(a.date)} · ${a.by}`} />)}
            {geo.map((f) => <Row key={f} onClick={() => go('geometry')} title={`Проверить замеры: ${f}`} />)}
            {over && <Row onClick={() => go('money')} title="Затраты выше плана" value={<span className="neg">{money(v.spent - o.planCost)}</span>} />}
            {v.lateWorks > 0 && <Row onClick={() => go('works')} title="Работы с прошедшим сроком" value={<span className="neg">{v.lateWorks}</span>} />}
            {toPresent > 0 && <Row onClick={() => go('works')} title="Сделано, но не вошло в акт" value={toPresent} />}
            {v.openLines > 0 && <Row onClick={() => go('materials')} title="Материалы ещё не обеспечены" value={v.openLines} />}
            {issues.map((i) => (
              <Row key={i.id} wrap title={`${ISSUE_LABEL[i.kind]}: ${i.place}`} sub={`${i.text} ${i.by}, ${dShort(i.date)}.`}
                side={<Status kind={i.status === 'open' ? 'wait' : 'work'}>{i.status === 'open' ? 'Открыто' : 'В работе'}</Status>} />
            ))}
          </List>
        )}
      </Card>
      <Details label="Договор и сроки">
        <Card>
          <dl className="kv left">
            <dt>Этап</dt><dd>{o.stage}</dd>
            <dt>Адрес</dt><dd>{o.address}</dd>
            <dt>Заказчик</dt><dd>{o.customer}</dd>
            <dt>Договор</dt><dd>{o.contract}</dd>
            <dt>Сумма договора</dt><dd>{money(o.contractSum)}</dd>
            <dt>Плановые затраты</dt><dd>{money(o.planCost)}</dd>
            <dt>Ожидаемый результат</dt><dd className={v.expectedResult < 0 ? 'neg' : ''}>{money(v.expectedResult)}</dd>
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
      </Details>
    </>
  );
}

/* --------------------------------------------------------------- geometry */
/** Measurements are checked floor by floor: a version on review is accepted as a whole or returned with a note. */
function Geometry({ o }: { o: BuildObject }) {
  const d = useData();
  const wide = useWide();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const floors = floorsOf(d, o.id);
  const rooms = d.rooms.filter((r) => r.objectId === o.id);
  const acts = d.acts.filter((a) => a.objectId === o.id).sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num);
  const firstReview = floors.find((f) => currentGeo(d, o.id, f)?.status === 'review');
  const back = returning ? currentGeo(d, o.id, returning) : undefined;
  const room = byId(rooms, roomId);
  const dims = (r: Room): string => `${dec(r.length)} × ${dec(r.width)} × ${dec(r.height)}`;
  const all = totalsOf(rooms);
  const edits = (r: Room): number => Math.max(0, r.history.length - 1);
  const uneven = (r: Room): number | undefined => worstUneven(r);
  const cols: Col<Room>[] = [
    { head: 'Этаж и помещение', phone: 'title', cell: (r) => (wide ? <Two a={r.name} b={r.floor} /> : `${r.name}, ${r.floor}`) },
    { head: 'Д × Ш × В, м', phone: 'sub', cell: (r) => (wide ? dims(r) : `${dims(r)} м`) },
    { head: 'Пол, м²', num: true, phone: 'value', cell: (r) => (wide ? num(roomFloor(r), 1) : `${num(roomFloor(r), 1)} м²`) },
    { head: 'Стены, м²', num: true, phone: 'sub', cell: (r) => (wide ? num(roomSurface(r, 'walls'), 1) : `стены ${num(roomSurface(r, 'walls'), 1)} м²`) },
    { head: 'Неровность, мм', num: true, phone: 'sub', cell: (r) => { const mm = uneven(r); return mm === undefined ? (wide ? dash : 'неровности не замерены') : wide ? num(mm) : `неровность ${num(mm)} мм`; } },
    { head: 'Замер', phone: 'meta', cell: (r) => (wide ? <Two a={dShort(r.measuredAt)} b={edits(r) ? count(edits(r), 'правка', 'правки', 'правок') : undefined} /> : dShort(r.measuredAt)) },
  ];
  return (
    <>
      {floors.length === 0 && <Card><Empty>Замеров по объекту ещё нет.</Empty></Card>}
      {floors.length > 0 && (
        <div className="grid cols-2">
          {floors.map((floor) => {
            const cur = currentGeo(d, o.id, floor);
            const conf = confirmedGeo(d, o.id, floor);
            const live = totalsOf(roomsOn(d, o.id, floor));
            // on review the figures are the ones fixed when the foreman sent the floor
            const t = cur?.status === 'review' ? cur.totals ?? live : live;
            return (
              <Card key={floor} title={floor} note={cur ? `версия ${cur.num}` : undefined} action={<GeoPill v={cur} />}>
                <div className="stack">
                  {cur?.status === 'draft' && <p>Прораб ещё не отправил на проверку.{cur.note ? <> <span className="muted">Вернули:</span> {cur.note}</> : null}</p>}
                  {cur?.status === 'confirmed' && <p className="muted">Принято{cur.confirmedAt ? ` ${dFull(cur.confirmedAt)}` : ''}{cur.confirmedBy ? `, ${cur.confirmedBy}` : ''}</p>}
                  {!cur && <p className="muted">Замеров по этажу ещё нет.</p>}
                  <dl className="kv">
                    <dt>Помещений</dt><dd>{t.rooms}</dd>
                    <dt>Пол</dt><dd>{dec(t.floor)} м²</dd>
                    <dt>Стены</dt><dd>{dec(t.walls)} м²</dd>
                    <dt>Периметр</dt><dd>{dec(t.perimeter)} м</dd>
                  </dl>
                  {cur && cur.status !== 'confirmed' && (
                    conf?.totals
                      ? <p><span className="muted">К принятым (версия {conf.num}):</span> <span className="num">{deltaLine(t, conf.totals)}</span></p>
                      : <p className="muted">Принятых замеров по этажу ещё нет.</p>
                  )}
                  {cur?.status === 'review' && (
                    <div className="btn-row">
                      <Btn kind={floor === firstReview ? 'primary' : 'secondary'} style={{ flex: '1 1 180px' }}
                        onClick={() => { act.decideFloor(o.id, floor, true); toast(`${floor}: замеры приняты`); }}>Принять замеры</Btn>
                      <Btn style={{ flex: '1 1 180px' }} onClick={() => setReturning(floor)}>Вернуть на доработку</Btn>
                    </div>
                  )}
                  {cur && (
                    <Details label={cur.status === 'review' ? 'Что изменилось и версии' : 'Версии'}>
                      {cur.status === 'review' && (
                        <div>
                          <p className="muted" style={{ marginBottom: 6 }}>Отправил {cur.by}{cur.sentAt ? `, ${dFull(cur.sentAt)}` : ''}</p>
                          {cur.reason && <p style={{ marginBottom: 6 }}><span className="muted">Причина:</span> {cur.reason}</p>}
                          {cur.changes.length
                            ? cur.changes.map((h, i) => <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)
                            : <p className="muted">Изменений не записано.</p>}
                        </div>
                      )}
                      <VersionList objectId={o.id} floor={floor} />
                    </Details>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {rooms.length > 0 && (
        <Details label={`Помещения: ${rooms.length}, пол ${num(all.floor, 1)} м²`}>
          <Card flush>
            <DataTable cols={cols} rows={rooms} keyOf={(r) => r.id} onRow={(r) => setRoomId(r.id)}
              foot={['Итого', '', num(all.floor, 1), num(all.walls, 1), '', '']} />
          </Card>
        </Details>
      )}
      {acts.length > 0 && (
        <Details label={`Акты замеров: ${acts.length}`}>
          <Card flush>
            <List>
              {acts.map((a: GeometryAct) => {
                const ver = byId(d.geoVersions, a.versionId);
                return (
                  <Row key={a.id} title={`Акт замеров № ${a.num}${a.floor ? `, ${a.floor}` : ''}`}
                    sub={`${dFull(a.date)} · ${a.by}${ver ? ` · версия ${ver.num}` : ''}`}
                    value={`${num(a.floorArea, 1)} м²`} meta={count(a.rooms, 'помещение', 'помещения', 'помещений')} />
                );
              })}
            </List>
          </Card>
        </Details>
      )}

      <NoteSheet open={!!back} title={back ? `Вернуть на доработку: ${back.floor}` : ''} label="Что нужно исправить" action="Вернуть" required
        onClose={() => setReturning(null)}
        onSubmit={(note) => { if (back) { act.decideFloor(o.id, back.floor, false, note); toast(`${back.floor}: замеры возвращены на доработку`); } setReturning(null); }} />
      <Sheet open={!!room} title={room ? `${room.name}, ${room.floor}` : ''} onClose={() => setRoomId(null)}>
        {room && (
          <div className="stack" style={{ gap: 16 }}>
            <dl className="kv">
              <dt>Длина × ширина × высота</dt><dd>{dims(room)} м</dd>
              <dt>Пол</dt><dd>{num(roomFloor(room), 1)} м²</dd>
              <dt>Стены без проёмов</dt><dd>{num(roomSurface(room, 'walls'), 1)} м²</dd>
              <dt>Откосы</dt><dd>{num(roomSlopes(room), 1)} м²</dd>
              <dt>Объём</dt><dd>{num(roomVolume(room), 1)} м³</dd>
              <dt>Наибольшая неровность</dt><dd>{uneven(room) === undefined ? dash : `${num(uneven(room) ?? 0)} мм`}</dd>
              <dt>Последний замер</dt><dd>{dFull(room.measuredAt)}, {room.measuredBy}</dd>
            </dl>
            {room.note && <p>{room.note}</p>}
            <Details>
              <dl className="kv">
                <dt>Назначение</dt><dd>{room.purpose ?? dash}</dd>
                <dt>Чем мерили</dt><dd>{room.method ? METHOD_LABEL[room.method] : dash}</dd>
                <dt>Фото</dt><dd>{room.photos}</dd>
              </dl>
              <div>
                <div className="section-title" style={{ margin: '0 0 6px' }}>Проёмы</div>
                {room.openings.length ? room.openings.map((op, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                    <span>{op.kind === 'door' ? 'Дверь' : 'Окно'} {dec(op.w)} × {dec(op.h)} м</span>
                    <span className="num muted">{num(op.w * op.h, 1)} м²</span>
                  </div>
                )) : <p className="muted">Проёмов нет.</p>}
              </div>
              {(room.elements?.length ?? 0) > 0 && (
                <div>
                  <div className="section-title" style={{ margin: '0 0 6px' }}>Ниши, выступы и откосы</div>
                  {room.elements?.map((e) => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <span>{e.name} <span className="muted">· {ELEMENT_LABEL[e.kind].toLowerCase()}, {dec(e.length)} × {dec(e.height)} м × {e.count}</span></span>
                      <span className="num muted nowrap">{num(elementArea(e), 1)} м²</span>
                    </div>
                  ))}
                </div>
              )}
              {(room.zones?.length ?? 0) > 0 && (
                <div>
                  <div className="section-title" style={{ margin: '0 0 6px' }}>Зоны</div>
                  {room.zones?.map((z) => (
                    <div key={z.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <span>{z.name}{z.purpose ? <span className="muted"> · {z.purpose}</span> : null}</span>
                      <span className="num muted nowrap">{num(z.area, 1)} м²</span>
                    </div>
                  ))}
                </div>
              )}
              {(room.uneven?.length ?? 0) > 0 && (
                <div>
                  <div className="section-title" style={{ margin: '0 0 6px' }}>Неровности</div>
                  {room.uneven?.map((x) => (
                    <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <span>{x.place}</span>
                      <span className="num muted nowrap">{num(x.mm)} мм</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="section-title" style={{ margin: '0 0 6px' }}>История изменений</div>
                {[...room.history].reverse().map((h, i) => (
                  <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>
                ))}
              </div>
            </Details>
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
    { head: 'Сделано', num: true, cell: (w) => qty(workDone(w), w.unit) },
    { head: 'Принято', num: true, cell: (w) => qty(w.accepted, w.unit) },
    { head: 'Срок', cell: deadline },
    { head: 'Состояние', cell: state },
  ] : [
    { head: 'Работа', phone: 'title', cell: (w) => <Wrap>{w.name}</Wrap> },
    { head: 'Помещение', phone: 'sub', cell: (w) => placeOf(d, w) },
    { head: 'Принято', phone: 'sub', cell: (w) => `принято ${qty(w.accepted, w.unit)}` },
    { head: 'Срок', phone: 'sub', cell: (w) => <>срок {deadline(w)}</> },
    { head: 'Сделано', phone: 'value', cell: (w) => `${n1(workDone(w))} из ${qty(w.plan, w.unit)}` },
    { head: 'Состояние', phone: 'meta', cell: state },
  ];
  const facts = work ? [...work.facts].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const inActs = work ? d.avrs.flatMap((a) => a.lines.filter((l) => l.workId === work.id).map((l) => ({ a, l }))) : [];
  return (
    <>
      <Card title="Работы" note={works.length ? `сделано ${pct(v.progress)} · принято ${pct(v.accepted)}` : undefined} flush>
        <DataTable cols={cols} rows={works} keyOf={(w) => w.id} onRow={(w) => setWorkId(w.id)} empty="План работ по объекту ещё не составлен." />
      </Card>
      <Sheet open={!!work} title={work?.name ?? ''} onClose={() => setWorkId(null)}>
        {work && (
          <div className="stack" style={{ gap: 16 }}>
            <dl className="kv">
              <dt>Помещение</dt><dd>{placeOf(d, work)}</dd>
              <dt>План</dt><dd>{qty(work.plan, work.unit)}</dd>
              <dt>Сделано</dt><dd>{qty(workDone(work), work.unit)}</dd>
              <dt>Принято</dt><dd>{qty(work.accepted, work.unit)}</dd>
              <dt>Сделано, но не в акте</dt><dd>{qty(workToPresent(d, work), work.unit)}</dd>
              <dt>Срок</dt><dd>{deadline(work)}</dd>
              <dt>Состояние</dt><dd>{state(work)}</dd>
            </dl>
            <Details label="Записи и акты">
              <div>
                <div className="section-title" style={{ margin: '0 0 6px' }}>Что отмечал прораб</div>
                {facts.length ? facts.map((f, i) => (
                  <p key={i} style={{ marginBottom: 4 }}>
                    <span className="muted">{dShort(f.date)}, {f.by}:</span> {qty(f.qty, work.unit)}
                    {f.note ? `. ${f.note}` : ''}{f.photos ? <span className="muted"> · фото: {f.photos}</span> : null}
                  </p>
                )) : <p className="muted">Записей ещё нет.</p>}
              </div>
              <div>
                <div className="section-title" style={{ margin: '0 0 6px' }}>В актах</div>
                {inActs.length ? inActs.map(({ a, l }) => (
                  <p key={a.id} style={{ marginBottom: 4 }}>
                    <span className="muted">АВР № {a.num} от {dShort(a.date)}:</span> заявлено {qty(l.qty, work.unit)},{' '}
                    {a.status === 'accepted' ? `принято ${qty(l.accepted ?? 0, work.unit)}` : a.status === 'review' ? 'на проверке' : 'возвращён на доработку'}
                  </p>
                )) : <p className="muted">Ни в одном акте.</p>}
              </div>
            </Details>
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
      <Card title="Заявки объекта" flush>
        {list.length ? (
          <div className="list">
            {list.map(({ need, line, done }) => (
              <div key={line.id} className="row" style={{ display: 'block' }}>
                <NeedLineBlock line={line} legend={!done}
                  caption={`Заявка № ${need.num} · нужно к ${dShort(line.wantDate)}${line.comment ? ` · ${line.comment}` : ''}`} />
              </div>
            ))}
          </div>
        ) : <Empty>{lines.length ? 'Все позиции объекта обеспечены.' : 'Заявок на материалы по объекту ещё не было.'}</Empty>}
      </Card>
      <Details label={stock.length ? `Остатки на объекте: ${count(stock.length, 'позиция', 'позиции', 'позиций')}` : 'Остатки на объекте'}>
        <Card flush>
          <DataTable cols={cols} rows={stock} keyOf={(r) => r.material.id} empty="На объект ещё ничего не поступало." />
        </Card>
      </Details>
    </>
  );
}

/* -------------------------------------------------------------------- АВР */
const AVR_STATUS: Record<Avr['status'], { text: string; tone: Tone }> = {
  review: { text: 'На проверке', tone: 'warning' },
  accepted: { text: 'Принято', tone: 'positive' },
  returned: { text: 'Возвращён прорабу', tone: 'warning' },
};

function AvrTab({ o }: { o: BuildObject }) {
  const d = useData();
  const avrs = d.avrs
    .filter((a) => a.objectId === o.id)
    .sort((a, b) => Number(b.status === 'review') - Number(a.status === 'review') || b.date.localeCompare(a.date) || b.num - a.num);
  if (!avrs.length) return <Card><Empty>Актов по объекту ещё нет.</Empty></Card>;
  const fresh = avrs.filter((a) => a.status === 'review');
  const old = avrs.filter((a) => a.status !== 'review');
  return (
    <>
      {fresh.map((a) => <AvrCard key={a.id} a={a} />)}
      {/* nothing to check: the newest act stays open, the older ones are one tap deeper */}
      {!fresh.length && old[0] && <AvrCard a={old[0]} />}
      {old.length > (fresh.length ? 0 : 1) && (
        <Details label={`Прежние акты: ${old.length - (fresh.length ? 0 : 1)}`}>
          {old.slice(fresh.length ? 0 : 1).map((a) => <AvrCard key={a.id} a={a} />)}
        </Details>
      )}
    </>
  );
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
    <Card title={`АВР № ${a.num}`} note={`от ${dShort(a.date)} · ${a.by}`} action={<Pill tone={st.tone}>{st.text}</Pill>} flush>
      {a.status === 'review' ? (
        <>
          <div className="list" style={{ marginTop: 8 }}>
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
            {nothing
              ? <p className="neg" style={{ fontSize: 13 }}>Принять ноль нельзя: верните акт на доработку.</p>
              : cut > 0 && <p style={{ fontSize: 13 }}>Меньше заявленного: {count(cut, 'работа', 'работы', 'работ')}.</p>}
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
        <div className="list" style={{ marginTop: 8 }}>
          {a.lines.map((l) => {
            const w = byId(d.works, l.workId);
            const unit = w?.unit ?? '';
            const less = a.status === 'accepted' && l.accepted !== undefined && l.accepted < l.qty;
            return (
              <div key={l.workId} className="row" style={{ borderTop: '1px solid var(--rule)' }}>
                <div className="row-main">
                  <div className="row-title wrap">{w?.name ?? 'Работы нет в плане'}</div>
                  <div className="row-sub">{w ? placeOf(d, w) : ''}{less ? `${w ? ' · ' : ''}меньше заявленного на ${qty(round1(l.qty - (l.accepted ?? 0)), unit)}` : ''}</div>
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
          {a.status === 'accepted' && <AvrPay a={a} />}
        </div>
      )}
    </Card>
  );
}

/** Paying for an accepted act: a person creates the request, and it goes through approval like any other. */
function AvrPay({ a }: { a: Avr }) {
  const d = useData();
  const o = byId(d.objects, a.objectId);
  const tied = d.requests.filter((r) => r.avrId === a.id);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState(addDays(d.today, 3));
  const basis = `Оплата работ по АВР № ${a.num}, ${o?.name ?? ''}`;
  return (
    <div className="row" style={{ borderTop: '1px solid var(--rule)', flexWrap: 'wrap' }}>
      <div className="row-main" style={{ flexBasis: 220 }}>
        <div className="row-title wrap">Оплата по акту</div>
        <div className="row-sub wrap">
          {tied.length
            ? tied.map((r) => <span key={r.id}>заявка № {r.num} на {money(r.amount)} <Pill tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Pill> </span>)
            : 'Заявки на оплату ещё нет.'}
        </div>
      </div>
      <Btn small onClick={() => setOpen(true)}>Создать заявку на оплату</Btn>
      <Sheet open={open} title={`Заявка на оплату по АВР № ${a.num}`} onClose={() => setOpen(false)} dirty={amount > 0}
        foot={<><Btn onClick={() => setOpen(false)}>Отмена</Btn><Btn kind="primary" disabled={!amount || !o}
          onClick={() => { if (o) { act.createRequest({ amount, basis, articleId: 'a-out2', entityId: o.entityId, objectId: o.id, due, avrId: a.id }); toast('Заявка создана и отправлена на согласование'); } setAmount(0); setOpen(false); }}>Отправить на согласование</Btn></>}>
        <div className="form">
          <p>{basis}</p>
          <Field label="Сумма"><AmountInput autoFocus value={amount} onChange={setAmount} /></Field>
          <Field label="Оплатить до"><input className="input" type="date" min={d.today} value={due} onChange={(e) => setDue(e.target.value || due)} /></Field>
        </div>
      </Sheet>
    </div>
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
  return (
    <>
      <Stats items={[
        { label: 'Получено от заказчика', value: inc ? `+${money(inc)}` : money(0), lead: true, zero: !inc, hint: `из ${money(o.contractSum)} по договору` },
        { label: 'Затраты', value: <span className={out > o.planCost ? 'neg' : ''}>{money(out)}</span>, hint: `из ${money(o.planCost)} по плану` },
        { label: 'Сальдо', value: signed(inc - out) },
      ]} />
      <Card title="Операции" note={ops.length ? String(ops.length) : undefined} flush>
        {ops.length
          ? <List>{ops.map((x) => <OpRow key={x.id} op={x} onClick={() => setOpId(x.id)} />)}</List>
          : <Empty>Денежных операций по объекту ещё нет.</Empty>}
      </Card>
      {open.length > 0 && (
        <Details label={`Открытые заявки: ${open.length} на ${money(open.reduce((s, r) => s + r.amount, 0))}`}>
          <Card flush>
            <List>
              {open.map((r) => (
                <Row key={r.id} to="/admin/requests" wrap title={r.basis} sub={`№ ${r.num} · ${REQUEST_LABEL[r.status].toLowerCase()}`} value={money(r.amount)} money />
              ))}
            </List>
          </Card>
        </Details>
      )}
      <OpSheet op={byId(d.operations, opId) ?? null} onClose={() => setOpId(null)} editable />
    </>
  );
}
