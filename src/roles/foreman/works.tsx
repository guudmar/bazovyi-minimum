// Foreman, works: the plan of works, the fact and the acts, remarks and problems.
// The geometry screens live in ./geometry; a work only keeps the link to the version of the floor its volume was taken from.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, Plus } from 'lucide-react';
import { act, useData } from '../../data/store';
import {
  ISSUE_LABEL, WORK_LABEL, WORK_TONE, basisRoom, byId, confirmedGeo, floorsOf, geoVersionLabel, material, roomSurface, roomsOn, round1, workDone, workState, workToPresent,
  type Tone,
} from '../../data/select';
import { Btn, Card, Empty, Field, List, Page, Photos, Pill, Row, Seg, Sheet, Stepper, Track, toast } from '../../ui/kit';
import { IssueButton } from '../../shared/extras';
import { count, dRel, dShort, num, qty, weekStart, addDays } from '../../lib/format';
import type { Avr, Issue, Work } from '../../data/types';
import { useObject } from './materials';
import { FloorsBody, NumInput, roomPath, sq, workBasis } from './geometry';

const m1 = (v: number) => num(v, Number.isInteger(v) ? 0 : v * 10 === Math.round(v * 10) ? 1 : 2);
const dash = <span className="muted">—</span>;

/* --------------------------------------------------------------- geometry */
/** The geometry of an object inside another screen: its floors with versions. The pages themselves are in ./geometry. */
export function GeometryBody({ objectId }: { objectId: string }) {
  return <FloorsBody objectId={objectId} />;
}

/* ------------------------------------------------------------------ works */
export function WorkLine({ w, onClick }: { w: Work; onClick?: () => void }) {
  const d = useData();
  const done = workDone(w);
  const st = workState(w, d.today);
  const room = byId(d.rooms, w.roomId)?.name;
  const basis = workBasis(d, w);
  const inner = (
    <div className="row-main">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div className="row-title wrap">{w.name}{room ? <span className="muted" style={{ fontWeight: 400 }}> · {room}</span> : null}</div>
        <Pill tone={WORK_TONE[st]}>{WORK_LABEL[st]}</Pill>
      </div>
      <div style={{ margin: '8px 0 0' }}><Track value={w.accepted} second={done} max={w.plan} /></div>
      <div className="track-ends">
        <span>выполнено {m1(done)} из {qty(w.plan, w.unit)}{w.accepted > 0 ? ` · принято ${m1(w.accepted)}` : ''}</span>
        <span className={st === 'late' ? 'neg' : ''}>срок {dShort(w.deadline)}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, lineHeight: '16px', marginTop: 4 }}>
        {w.crew ?? 'исполнитель не назначен'}{basis ? ` · ${basis.text}` : ''}{basis?.stale ? ' · геометрия этажа с тех пор уточнялась' : ''}
      </div>
    </div>
  );
  return onClick ? <button type="button" className="row" onClick={onClick}>{inner}</button> : <div className="row">{inner}</div>;
}

/** Materials for a volume by a technological card. The product is cleaned of binary noise before rounding up. */
const needQty = (volume: number, perUnit: number): number => Math.ceil(Math.round(volume * perUnit * 1e6) / 1e6);
const UNITS = ['м²', 'м', 'м³', 'шт', 'компл'];

interface WorkDraft { normId: string; name: string; unit: string; roomId: string; plan: number; deadline: string; crew: string }

/** A new line of the plan: by a technological card or under a free name, for a room or for the whole object. */
function AddWorkSheet({ open, onClose, objectId }: { open: boolean; onClose: () => void; objectId: string }) {
  const d = useData();
  const rooms = d.rooms.filter((r) => r.objectId === objectId);
  const here = byId(rooms, d.session.roomId)?.id ?? '';
  const blank = (): WorkDraft => ({ normId: '', name: '', unit: 'м²', roomId: here, plan: 0, deadline: addDays(d.today, 7), crew: '' });
  const [f, setF] = useState<WorkDraft>(blank);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setF(blank()); setTouched(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const norm = byId(d.norms, f.normId);
  const room = byId(rooms, f.roomId);
  const conf = room ? confirmedGeo(d, objectId, room.floor) : undefined;
  /** The surface the card is calculated by, when the room's floor has a confirmed version. */
  const surface = (normId: string, roomId: string): number | undefined => {
    const n = byId(d.norms, normId);
    const r = byId(rooms, roomId);
    return n?.base && r && confirmedGeo(d, objectId, r.floor) ? roomSurface(basisRoom(d, r) ?? r, n.base) : undefined;
  };
  const set = (p: Partial<WorkDraft>) => { setTouched(true); setF((x) => ({ ...x, ...p })); };
  // a new card or another room gives a new volume from geometry; the person can still correct it
  const repick = (p: { normId?: string; roomId?: string }) => {
    const next = { ...f, ...p };
    const s = surface(next.normId, next.roomId);
    set({ ...p, plan: s ?? next.plan });
  };
  const name = norm ? norm.work : f.name.trim();
  const unit = norm ? norm.unit : f.unit;
  const s = surface(f.normId, f.roomId);
  const crews = [...new Set(d.works.map((w) => w.crew).filter((c): c is string => !!c))];
  const add = () => {
    act.createWork({ objectId, roomId: f.roomId || undefined, normId: norm?.id, name, unit, plan: f.plan, deadline: f.deadline, crew: f.crew.trim() });
    toast(`Работа добавлена в план: ${name}, ${qty(round1(f.plan), unit)}`);
    onClose();
  };
  return (
    <Sheet open={open} title="Новая работа" onClose={onClose} dirty={touched}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!name || f.plan <= 0 || !f.deadline} onClick={add}>Добавить в план</Btn></>}>
      <div className="form">
        <Field label="Технологическая карта">
          <select className="select" value={f.normId} onChange={(e) => repick({ normId: e.target.value })}>
            <option value="">Без карты, своё название</option>
            {d.norms.map((n) => <option key={n.id} value={n.id}>{n.work}</option>)}
          </select>
        </Field>
        {!norm && (
          <>
            <Field label="Название работы"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Например, монтаж радиаторов" /></Field>
            <Field label="Единица">
              <select className="select" value={f.unit} onChange={(e) => set({ unit: e.target.value })}>
                {UNITS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Помещение">
          <select className="select" value={f.roomId} onChange={(e) => repick({ roomId: e.target.value })}>
            <option value="">Весь объект</option>
            {floorsOf(d, objectId).map((floor) => (
              <optgroup key={floor} label={floor}>
                {roomsOn(d, objectId, floor).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label={`Объём, ${unit}`}
          help={s !== undefined && conf ? `По геометрии: ${geoVersionLabel(conf)}, ${sq(s)}. Объём можно поправить.`
            : room && !conf ? 'Геометрия этажа не подтверждена: объём вводится вручную, без привязки к версии.' : undefined}>
          <NumInput label="Объём работы" value={f.plan} onChange={(v) => set({ plan: v })} />
        </Field>
        <Field label="Срок"><input className="input" type="date" min={d.today} value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} /></Field>
        <Field label="Бригада или исполнитель">
          <input className="input" list="plan-crews" value={f.crew} onChange={(e) => set({ crew: e.target.value })} placeholder="Например, бригада Сафина" />
          <datalist id="plan-crews">{crews.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
    </Sheet>
  );
}

export function WorksBody({ objectId, addKind = 'secondary' }: { objectId: string; addKind?: 'primary' | 'secondary' }) {
  const d = useData();
  const nav = useNavigate();
  const works = d.works.filter((w) => w.objectId === objectId);
  const [workId, setWorkId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState(0);
  const [adding, setAdding] = useState(false);
  const work = byId(works, workId);
  const weekEnd = addDays(weekStart(d.today), 6);
  const open = (w: Work) => { setWorkId(w.id); setAmount(round1(w.plan - workDone(w))); setNote(''); setPhotos(0); };
  // the state of a work comes only from its facts and acceptance, never from geometry
  const now = works.filter((w) => !['accepted', 'done'].includes(workState(w, d.today)) && (w.deadline <= weekEnd || workDone(w) > 0));
  const later = works.filter((w) => !['accepted', 'done'].includes(workState(w, d.today)) && !now.includes(w));
  const finished = works.filter((w) => ['accepted', 'done'].includes(workState(w, d.today)));
  const done = work ? workDone(work) : 0;
  const left = work ? round1(work.plan - done) : 0;
  const norm = byId(d.norms, work?.normId);
  const room = byId(d.rooms, work?.roomId);
  const geo = byId(d.geoVersions, work?.geoVersionId);
  const pending = d.session.needDraft?.lines.length ?? 0;
  const calcNeed = () => {
    if (!work || !norm) return;
    act.saveNeedDraft({
      objectId, comment: `Для работы «${work.name}»`, urgent: false, floor: room?.floor, roomId: work.roomId,
      lines: norm.lines.map((l) => ({ materialId: l.materialId, qty: needQty(left, l.perUnit), wantDate: addDays(d.today, 2), comment: '' })),
      basis: { workId: work.id, normId: norm.id, normVersion: norm.version, geoVersionId: work.geoVersionId, volume: left },
    });
    toast('Потребность рассчитана по техкарте. Проверьте количество перед отправкой.');
    setWorkId(null);
    nav('/foreman/needs/new');
  };
  const group = (title: string, list: Work[], empty: string, tappable: boolean) => (
    <Card title={title} note={list.length ? String(list.length) : undefined} flush>
      {list.length ? <List>{list.map((w) => <WorkLine key={w.id} w={w} onClick={tappable ? () => open(w) : undefined} />)}</List> : <Empty>{empty}</Empty>}
    </Card>
  );
  return (
    <>
      <div className="btn-row"><Btn kind={addKind} onClick={() => setAdding(true)}><Plus size={18} /> Добавить работу</Btn></div>
      {group('На этой неделе', now, 'На эту неделю работ не запланировано.', true)}
      {later.length > 0 && group('Дальше по плану', later, '', true)}
      {group('Выполнено', finished, 'Завершённых работ пока нет.', false)}
      <Sheet open={!!work} title={work ? `Факт: ${work.name}` : ''} onClose={() => setWorkId(null)} dirty={!!note.trim() || photos > 0}
        foot={<><Btn onClick={() => setWorkId(null)}>Отмена</Btn><Btn kind="primary" disabled={amount <= 0 || amount > left}
          onClick={() => { if (work) { act.addFact(work.id, amount, note, photos); toast(`Записано: ${qty(amount, work.unit)}`); } setWorkId(null); }}>Записать факт</Btn></>}>
        {work && (
          <div className="form">
            <p className="muted">{room ? `${room.name} · ` : ''}по плану {qty(work.plan, work.unit)}, выполнено {qty(done, work.unit)}, осталось {qty(left, work.unit)}.</p>
            <Field label={`Выполнено за сегодня, ${work.unit}`}
              help={`Вводится только новый объём. Всего будет выполнено ${qty(round1(done + amount), work.unit)} из ${qty(work.plan, work.unit)}.`}>
              <Stepper value={amount} max={left} onChange={setAmount} />
            </Field>
            <Photos count={photos} onChange={setPhotos} />
            <Field label="Замечание, если есть"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            {norm && left > 0 && (
              <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
                <div style={{ fontWeight: 500 }}>Материалы на остаток {qty(left, work.unit)}</div>
                <dl className="kv">
                  {norm.lines.map((l) => {
                    const m = material(d, l.materialId);
                    return [<dt key={m.id + 'a'}>{m.name}</dt>, <dd key={m.id + 'b'}>{qty(needQty(left, l.perUnit), m.unit)}</dd>];
                  })}
                </dl>
                <p className="muted" style={{ fontSize: 13 }}>
                  По техкарте «{norm.work}», версия {norm.version}{geo ? `. Объём работы взят по геометрии: ${geoVersionLabel(geo)}` : ''}.
                  {pending > 0 ? ' Неотправленный черновик потребности будет заменён этим расчётом.' : ''}
                </p>
                <Btn onClick={calcNeed}><Calculator size={18} /> Рассчитать потребность по техкарте</Btn>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <AddWorkSheet open={adding} onClose={() => setAdding(false)} objectId={objectId} />
    </>
  );
}
export function Works() {
  const o = useObject();
  const d = useData();
  const works = d.works.filter((w) => w.objectId === o.id);
  const late = works.filter((w) => workState(w, d.today) === 'late');
  return (
    <Page title="План работ"
      sub={late.length ? `${o.name}. Срок прошёл: ${late.map((w) => w.name.toLowerCase()).join(', ')}.` : `${o.name}. Работ с прошедшим сроком нет.`}>
      <WorksBody objectId={o.id} addKind="primary" />
    </Page>
  );
}

/* ------------------------------------------------------------ fact and AVR */
const AVR_LABEL: Record<Avr['status'], string> = { review: 'На проверке', accepted: 'Объёмы приняты', returned: 'Возвращён' };
const AVR_TONE: Record<Avr['status'], Tone> = { review: 'warning', accepted: 'positive', returned: 'negative' };

export function FactBody({ objectId }: { objectId: string }) {
  const d = useData();
  const ready = d.works.filter((w) => w.objectId === objectId && workToPresent(d, w) > 0);
  const avrs = d.avrs.filter((a) => a.objectId === objectId).sort((a, b) => b.num - a.num);
  const [off, setOff] = useState<string[]>([]);
  const picked = ready.filter((w) => !off.includes(w.id));
  return (
    <>
      <Card title="Можно предъявить к приёмке" note={ready.length ? count(ready.length, 'работа', 'работы', 'работ') : undefined}>
        {ready.length ? (
          <div className="stack">
            {ready.map((w) => (
              <label key={w.id} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 44 }}>
                <input type="checkbox" checked={!off.includes(w.id)} onChange={(e) => setOff((x) => (e.target.checked ? x.filter((i) => i !== w.id) : [...x, w.id]))} style={{ width: 20, height: 20, flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0 }}>{w.name}{byId(d.rooms, w.roomId) ? <span className="muted"> · {byId(d.rooms, w.roomId)?.name}</span> : null}</span>
                <span className="num nowrap">{qty(workToPresent(d, w), w.unit)}</span>
              </label>
            ))}
            <Btn kind="primary" block disabled={!picked.length}
              onClick={() => { act.createAvr(objectId, picked.map((w) => ({ workId: w.id, qty: workToPresent(d, w) }))); setOff([]); toast('АВР сформирован и отправлен на проверку'); }}>
              Сформировать АВР
            </Btn>
          </div>
        ) : <Empty>Выполненных и не предъявленных объёмов сейчас нет. Сначала внесите факт в плане работ.</Empty>}
      </Card>
      <Card title="Акты выполненных работ" flush>
        {avrs.length ? avrs.map((a) => (
          <div key={a.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div className="row-main">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div className="row-title">АВР № {a.num} от {dShort(a.date)}</div>
                <Pill tone={AVR_TONE[a.status]}>{AVR_LABEL[a.status]}</Pill>
              </div>
              <dl className="kv" style={{ marginTop: 8 }}>
                {a.lines.map((l) => {
                  const w = byId(d.works, l.workId);
                  return [
                    <dt key={l.workId + 'a'}>{w?.name}</dt>,
                    <dd key={l.workId + 'b'}>{a.status === 'accepted' ? `принято ${m1(l.accepted ?? 0)} из ${qty(l.qty, w?.unit ?? '')}` : `предъявлено ${qty(l.qty, w?.unit ?? '')}`}</dd>,
                  ];
                })}
              </dl>
              {a.note && <p className="muted" style={{ marginTop: 6 }}>{a.note}</p>}
            </div>
          </div>
        )) : <Empty>Актов по объекту ещё нет.</Empty>}
      </Card>
      <p className="muted" style={{ fontSize: 13 }}>Выполненный объём вносите вы. Принятый объём фиксирует руководитель проекта после проверки, и они хранятся отдельно.</p>
    </>
  );
}
export function Fact() {
  const o = useObject();
  return <Page title="Факт работ и АВР" sub={o.name}><FactBody objectId={o.id} /></Page>;
}

/* ----------------------------------------------------------------- issues */
const ISSUE_STATUS: Record<Issue['status'], string> = { open: 'Открыто', work: 'Решается', done: 'Решено' };
const ISSUE_TONE: Record<Issue['status'], Tone> = { open: 'negative', work: 'warning', done: 'positive' };
const overdue = (i: Issue, today: string): boolean => !!i.due && i.status !== 'done' && i.due < today;

export function IssuesBody({ objectId }: { objectId: string }) {
  const d = useData();
  const [filter, setFilter] = useState<'active' | 'done'>('active');
  const [issueId, setIssueId] = useState<string | null>(null);
  const all = d.issues.filter((i) => i.objectId === objectId);
  const active = all.filter((i) => i.status !== 'done');
  const list = (filter === 'active' ? active : all.filter((i) => i.status === 'done')).sort((a, b) => b.date.localeCompare(a.date));
  const current = byId(all, issueId);
  // a new remark opens with the place the person is working in
  const room = d.session.objectId === objectId ? byId(d.rooms, d.session.roomId) : undefined;
  const floor = d.session.objectId === objectId ? d.session.floor ?? room?.floor : undefined;
  const place = [room?.name, floor].filter(Boolean).join(', ');
  /** The card of the record a remark was created from, where the foreman has one. */
  const sourceLink = (i: Issue): string | undefined => {
    const s = i.source;
    if (!s) return undefined;
    if (s.kind === 'room') { const r = byId(d.rooms, s.id); return r ? roomPath(r.floor, r.id) : undefined; }
    if (s.kind === 'need') return byId(d.needs, s.id) ? `/foreman/needs/${s.id}` : undefined;
    if (s.kind === 'delivery') return byId(d.deliveries, s.id) ? `/foreman/deliveries/${s.id}` : undefined;
    if (s.kind === 'work') return '/foreman/works';
    return `/foreman/object/${s.id}`;
  };
  const link = current ? sourceLink(current) : undefined;
  return (
    <>
      <div className="btn-row"><IssueButton small={false} ctx={{ objectId, place }}>Зафиксировать проблему</IssueButton></div>
      <Seg value={filter} onChange={setFilter} options={[{ value: 'active', label: `Открытые · ${active.length}` }, { value: 'done', label: `Решённые · ${all.length - active.length}` }]} />
      <Card flush>
        {list.length ? (
          <List>
            {list.map((i) => (
              <Row key={i.id} wrap onClick={() => setIssueId(i.id)} title={i.text}
                sub={<>
                  {ISSUE_LABEL[i.kind]} · {i.place}
                  {i.due ? <> · <span className={overdue(i, d.today) ? 'neg' : undefined}>{overdue(i, d.today) ? 'срок прошёл' : 'срок'} {dShort(i.due)}</span></> : null}
                  {i.responsible ? ` · ответственный ${i.responsible}` : ''}
                  {i.source ? ` · ${i.source.label}` : ''}
                  {` · ${dRel(i.date, d.today).toLowerCase()}`}
                  {i.photos ? ` · ${count(i.photos, 'фото', 'фото', 'фото')}` : ''}
                </>}
                side={<Pill tone={ISSUE_TONE[i.status]}>{ISSUE_STATUS[i.status]}</Pill>} />
            ))}
          </List>
        ) : <Empty>{filter === 'active' ? 'Открытых замечаний по объекту нет.' : 'Решённых замечаний пока нет.'}</Empty>}
      </Card>

      <Sheet open={!!current} title={current ? ISSUE_LABEL[current.kind] : ''} onClose={() => setIssueId(null)}>
        {current && (
          <div className="stack">
            <p>{current.text}</p>
            <dl className="kv left">
              <dt>Место</dt><dd>{current.place}</dd>
              <dt>Источник</dt>
              <dd>{current.source ? (link ? <Link className="link" style={{ minHeight: 20 }} to={link}>{current.source.label}</Link> : current.source.label) : dash}</dd>
              <dt>Ответственный</dt><dd>{current.responsible ?? dash}</dd>
              <dt>Срок</dt>
              <dd>{current.due ? <span className={overdue(current, d.today) ? 'neg' : undefined}>{dShort(current.due)}{overdue(current, d.today) ? ', срок прошёл' : ''}</span> : dash}</dd>
              <dt>Создано</dt><dd>{dShort(current.date)}, {current.by}</dd>
              <dt>Фото</dt><dd>{current.photos}</dd>
            </dl>
            <Field label="Состояние">
              <Seg wide value={current.status} onChange={(s) => { act.setIssueStatus(current.id, s); toast(`Замечание: ${ISSUE_STATUS[s].toLowerCase()}`); }}
                options={[{ value: 'open', label: 'Открыто' }, { value: 'work', label: 'Решается' }, { value: 'done', label: 'Решено' }]} />
            </Field>
            <div>
              <div className="section-title" style={{ margin: '0 0 6px' }}>История</div>
              {current.history?.length
                ? current.history.map((h, i) => <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)
                : <p className="muted">Изменений состояния ещё не было.</p>}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
export function Issues() {
  const o = useObject();
  const d = useData();
  const active = d.issues.filter((i) => i.objectId === o.id && i.status !== 'done');
  const late = active.filter((i) => overdue(i, d.today)).length;
  return (
    <Page title="Замечания и проблемы"
      sub={active.length
        ? `${count(active.length, 'открытое замечание', 'открытых замечания', 'открытых замечаний')}${late ? `, срок прошёл у ${late}` : ', просроченных нет'}.`
        : 'Открытых замечаний по объекту нет.'}>
      <IssuesBody objectId={o.id} />
    </Page>
  );
}
