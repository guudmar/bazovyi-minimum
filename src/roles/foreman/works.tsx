// Foreman, works: the list of works, «Сколько сделано сегодня», handing works in, the acts. Remarks and problems live here too.
// The measurement screens are in ./geometry.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, Plus, TriangleAlert } from 'lucide-react';
import { act, useData } from '../../data/store';
import {
  ISSUE_LABEL, WORK_LABEL, WORK_TONE, basisRoom, byId, confirmedGeo, floorsOf, material, roomSurface, roomsOn, round1, workDone, workState, workToPresent,
} from '../../data/select';
import { Btn, Card, Details, Empty, Field, Go, List, Page, Photos, Pill, Row, Seg, Sheet, Status, Stepper, Track, toast, type Crumb, type StatusKind } from '../../ui/kit';
import { IssueSheet } from '../../shared/extras';
import { count, dRel, dShort, num, qty, addDays } from '../../lib/format';
import type { Avr, Issue, Work } from '../../data/types';
import { useObject } from './materials';
import { FloorsBody, NumInput, roomPath, sq } from './geometry';

const m1 = (v: number) => num(v, Number.isInteger(v) ? 0 : v * 10 === Math.round(v * 10) ? 1 : 2);
const dash = <span className="muted">—</span>;
const small = { fontSize: 13, lineHeight: '18px' } as const;
const OBJECT: Crumb = { label: 'Объект', to: '/foreman/object' };

/* --------------------------------------------------------------- geometry */
/** The measurements of an object inside another screen: its floors. The pages themselves are in ./geometry. */
export function GeometryBody({ objectId }: { objectId: string }) {
  return <FloorsBody objectId={objectId} />;
}

/* ------------------------------------------------------------------ works */
/** One work: its name and state, how much is done, the crew and the deadline. */
export function WorkLine({ w, onClick }: { w: Work; onClick?: () => void }) {
  const d = useData();
  const done = workDone(w);
  const st = workState(w, d.today);
  const room = byId(d.rooms, w.roomId)?.name;
  const inner = (
    <div className="row-main">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div className="row-title wrap">{w.name}{room ? <span className="muted" style={{ fontWeight: 400 }}> · {room}</span> : null}</div>
        <Pill tone={WORK_TONE[st]}>{WORK_LABEL[st]}</Pill>
      </div>
      <div style={{ margin: '8px 0 0' }}><Track value={w.accepted} second={done} max={w.plan} /></div>
      <div className="track-ends">
        <span>сделано {m1(done)} из {qty(w.plan, w.unit)}</span>
        {w.accepted > 0 && <span>принято {m1(w.accepted)}</span>}
      </div>
      <div className="muted" style={{ fontSize: 12, lineHeight: '16px', marginTop: 4 }}>
        {w.crew ?? 'бригада не назначена'} · <span className={st === 'late' ? 'neg' : undefined}>до {dShort(w.deadline)}</span>
      </div>
    </div>
  );
  return onClick ? <button type="button" className="row" onClick={onClick}>{inner}</button> : <div className="row">{inner}</div>;
}

/** Materials for a volume by a norm. The product is cleaned of binary noise before rounding up. */
const needQty = (volume: number, perUnit: number): number => Math.ceil(Math.round(volume * perUnit * 1e6) / 1e6);
const UNITS = ['м²', 'м', 'м³', 'шт', 'компл'];

interface WorkDraft { normId: string; name: string; unit: string; roomId: string; plan: number; deadline: string; crew: string }

/** A new work: by a norm or under a free name, for a room or for the whole object. */
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
  /** The surface the norm is calculated by, when the room's measurements are accepted. */
  const surface = (normId: string, roomId: string): number | undefined => {
    const n = byId(d.norms, normId);
    const r = byId(rooms, roomId);
    return n?.base && r && confirmedGeo(d, objectId, r.floor) ? roomSurface(basisRoom(d, r) ?? r, n.base) : undefined;
  };
  const set = (p: Partial<WorkDraft>) => { setTouched(true); setF((x) => ({ ...x, ...p })); };
  // a new norm or another room gives a new volume from the measurements; the person can still correct it
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
    toast(`Работа добавлена: ${name}, ${qty(round1(f.plan), unit)}`);
    onClose();
  };
  return (
    <Sheet open={open} title="Новая работа" onClose={onClose} dirty={touched}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!name || f.plan <= 0 || !f.deadline} onClick={add}>Добавить</Btn></>}>
      <div className="form">
        <Field label="Норма">
          <select className="select" value={f.normId} onChange={(e) => repick({ normId: e.target.value })}>
            <option value="">Без нормы, своё название</option>
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
          help={s !== undefined && conf ? `По замерам: ${sq(s)}` : room && !conf ? 'Замеры этажа ещё не приняты: объём введите сами.' : undefined}>
          <NumInput label="Объём работы" value={f.plan} onChange={(v) => set({ plan: v })} />
        </Field>
        <Field label="Срок"><input className="input" type="date" min={d.today} value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} /></Field>
        <Field label="Бригада">
          <input className="input" list="plan-crews" value={f.crew} onChange={(e) => set({ crew: e.target.value })} placeholder="Например, бригада Сафина" />
          <datalist id="plan-crews">{crews.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
    </Sheet>
  );
}

/** «Сдать работы (N)»: everything done and not yet in an act, handed in with one sheet. */
function HandIn({ objectId }: { objectId: string }) {
  const d = useData();
  const ready = d.works.filter((w) => w.objectId === objectId && workToPresent(d, w) > 0);
  const [open, setOpen] = useState(false);
  const [off, setOff] = useState<string[]>([]);
  const picked = ready.filter((w) => !off.includes(w.id));
  if (!ready.length) return null;
  const hand = () => {
    act.createAvr(objectId, picked.map((w) => ({ workId: w.id, qty: workToPresent(d, w) })));
    setOpen(false);
    toast('Работы сданы на проверку');
  };
  return (
    <>
      <Btn kind="primary" block onClick={() => { setOff([]); setOpen(true); }}>Сдать работы ({ready.length})</Btn>
      <Sheet open={open} title="Сдать работы" onClose={() => setOpen(false)}
        foot={<><Btn onClick={() => setOpen(false)}>Отмена</Btn><Btn kind="primary" disabled={!picked.length} onClick={hand}>Сдать</Btn></>}>
        <div className="stack" style={{ gap: 4 }}>
          {ready.map((w) => (
            <label key={w.id} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 48 }}>
              <input type="checkbox" checked={!off.includes(w.id)} onChange={(e) => setOff((x) => (e.target.checked ? x.filter((i) => i !== w.id) : [...x, w.id]))} style={{ width: 20, height: 20, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0 }}>{w.name}{byId(d.rooms, w.roomId) ? <span className="muted"> · {byId(d.rooms, w.roomId)?.name}</span> : null}</span>
              <span className="num nowrap">{qty(workToPresent(d, w), w.unit)}</span>
            </label>
          ))}
        </div>
      </Sheet>
    </>
  );
}

const AVR_STATUS: Record<Avr['status'], { label: string; kind: StatusKind }> = {
  review: { label: 'На проверке', kind: 'wait' }, accepted: { label: 'Принят', kind: 'done' }, returned: { label: 'Вернули', kind: 'problem' },
};
/** The acts of an object with the volumes handed in and accepted. */
function Acts({ objectId }: { objectId: string }) {
  const d = useData();
  const avrs = d.avrs.filter((a) => a.objectId === objectId).sort((a, b) => b.num - a.num);
  if (!avrs.length) return <Card><Empty>Актов пока нет.</Empty></Card>;
  return (
    <Card flush>
      {avrs.map((a, i) => (
        <div key={a.id} className="card-body" style={i ? { borderTop: '1px solid var(--rule)' } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500 }}>Акт № {a.num} от {dShort(a.date)}</span>
            <Status kind={AVR_STATUS[a.status].kind}>{AVR_STATUS[a.status].label}</Status>
          </div>
          <dl className="kv" style={{ marginTop: 8 }}>
            {a.lines.map((l) => {
              const w = byId(d.works, l.workId);
              return [
                <dt key={l.workId + 'a'}>{w?.name}</dt>,
                <dd key={l.workId + 'b'}>{a.status === 'accepted' ? `принято ${m1(l.accepted ?? 0)} из ${qty(l.qty, w?.unit ?? '')}` : `сдано ${qty(l.qty, w?.unit ?? '')}`}</dd>,
              ];
            })}
          </dl>
          {a.note && <p className="muted" style={{ marginTop: 6 }}>{a.note}</p>}
        </div>
      ))}
    </Card>
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
  const open = (w: Work) => { setWorkId(w.id); setAmount(0); setNote(''); setPhotos(0); };
  // late works first, then by deadline; the state of a work comes only from what is done and accepted
  const late = (w: Work) => (workState(w, d.today) === 'late' ? 0 : 1);
  const active = works.filter((w) => !['accepted', 'done'].includes(workState(w, d.today))).sort((a, b) => late(a) - late(b) || a.deadline.localeCompare(b.deadline));
  const finished = works.filter((w) => ['accepted', 'done'].includes(workState(w, d.today)));
  const done = work ? workDone(work) : 0;
  const left = work ? round1(work.plan - done) : 0;
  const norm = byId(d.norms, work?.normId);
  const room = byId(d.rooms, work?.roomId);
  const pending = d.session.needDraft?.lines.length ?? 0;
  const record = () => {
    if (work) { act.addFact(work.id, amount, note, photos); toast(`Записано: ${qty(amount, work.unit)}`); }
    setWorkId(null);
  };
  const calcNeed = () => {
    if (!work || !norm) return;
    act.saveNeedDraft({
      objectId, comment: `Для работы «${work.name}»`, urgent: false, floor: room?.floor, roomId: work.roomId,
      lines: norm.lines.map((l) => ({ materialId: l.materialId, qty: needQty(left, l.perUnit), wantDate: addDays(d.today, 2), comment: '' })),
      basis: { workId: work.id, normId: norm.id, normVersion: norm.version, geoVersionId: work.geoVersionId, volume: left },
    });
    toast('Заявка рассчитана по норме. Проверьте количество.');
    setWorkId(null);
    nav('/foreman/needs/new');
  };
  return (
    <>
      <HandIn objectId={objectId} />
      <div><Btn small kind={addKind} onClick={() => setAdding(true)}><Plus size={16} /> Добавить работу</Btn></div>
      {active.length
        ? <Card flush><List>{active.map((w) => <WorkLine key={w.id} w={w} onClick={() => open(w)} />)}</List></Card>
        : <Card><Empty>Незаконченных работ нет.</Empty></Card>}
      {finished.length > 0 && (
        <Details label={`Сделанные (${finished.length})`}>
          <Card flush><List>{finished.map((w) => <WorkLine key={w.id} w={w} />)}</List></Card>
        </Details>
      )}
      <Details label="Акты"><Acts objectId={objectId} /></Details>

      <Sheet open={!!work} title="Сколько сделано сегодня" onClose={() => setWorkId(null)} dirty={amount > 0 || !!note.trim() || photos > 0}
        foot={<><Btn onClick={() => setWorkId(null)}>Отмена</Btn><Btn kind="primary" disabled={amount <= 0 || amount > left} onClick={record}>Записать</Btn></>}>
        {work && (
          <div className="form">
            <div>
              <div style={{ fontWeight: 500 }}>{work.name}</div>
              <div className="muted" style={small}>{room ? `${room.name} · ` : ''}осталось {qty(left, work.unit)}</div>
            </div>
            <Field label={`Сделано сегодня, ${work.unit}`} help={`Всего будет ${qty(round1(done + amount), work.unit)} из ${qty(work.plan, work.unit)}`}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <Stepper value={amount} max={left} onChange={setAmount} />
                {left > 0 && <button type="button" className="link" onClick={() => setAmount(left)}>всё, {qty(left, work.unit)}</button>}
              </div>
            </Field>
            <Photos count={photos} onChange={setPhotos} />
            <Field label="Комментарий"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            {norm && left > 0 && (
              <Details label="Рассчитать материалы по норме">
                <div className="muted" style={small}>На остаток {qty(left, work.unit)} по норме «{norm.work}»</div>
                <dl className="kv">
                  {norm.lines.map((l) => {
                    const m = material(d, l.materialId);
                    return [<dt key={m.id + 'a'}>{m.name}</dt>, <dd key={m.id + 'b'}>{qty(needQty(left, l.perUnit), m.unit)}</dd>];
                  })}
                </dl>
                {pending > 0 && <p className="muted" style={small}>Начатая заявка будет заменена этим расчётом.</p>}
                <div><Btn onClick={calcNeed}><Calculator size={18} /> Заказать материал</Btn></div>
              </Details>
            )}
          </div>
        )}
      </Sheet>
      <AddWorkSheet open={adding} onClose={() => setAdding(false)} objectId={objectId} />
    </>
  );
}

/** «Работы»: plan, what is done, handing in and the acts on one screen. */
export function Works() {
  const o = useObject();
  return (
    <Page title="Работы" path={[OBJECT, { label: 'Работы' }]}>
      <WorksBody objectId={o.id} />
    </Page>
  );
}

/* ---------------------------------------------------------- handing works in */
/** Handing in and the acts of an object, without the list of works. */
export function FactBody({ objectId }: { objectId: string }) {
  return (
    <>
      <HandIn objectId={objectId} />
      <Acts objectId={objectId} />
    </>
  );
}
/** The old «Факт и АВР» page: now part of «Работы». */
export function Fact() {
  return <Go to="/foreman/works" />;
}

/* ----------------------------------------------------------------- issues */
const ISSUE_STATUS: Record<Issue['status'], { label: string; kind: StatusKind }> = {
  open: { label: 'Открыто', kind: 'problem' }, work: { label: 'Решается', kind: 'work' }, done: { label: 'Решено', kind: 'done' },
};
const overdue = (i: Issue, today: string): boolean => !!i.due && i.status !== 'done' && i.due < today;

/** The remarks of an object: open ones first, solved ones folded. A tap opens the remark and its state. */
export function IssuesBody({ objectId }: { objectId: string }) {
  const d = useData();
  const [issueId, setIssueId] = useState<string | null>(null);
  const all = d.issues.filter((i) => i.objectId === objectId).sort((a, b) => b.date.localeCompare(a.date));
  const open = all.filter((i) => i.status !== 'done');
  const solved = all.filter((i) => i.status === 'done');
  const current = byId(all, issueId);
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
  const row = (i: Issue) => (
    <Row key={i.id} wrap onClick={() => setIssueId(i.id)} title={i.text}
      sub={<>
        {i.place}
        {i.due ? <> · <span className={overdue(i, d.today) ? 'neg' : undefined}>{overdue(i, d.today) ? 'срок прошёл' : 'до'} {dShort(i.due)}</span></> : null}
      </>}
      side={<Status kind={ISSUE_STATUS[i.status].kind}>{ISSUE_STATUS[i.status].label}</Status>} />
  );
  return (
    <>
      {open.length ? <Card flush><List>{open.map(row)}</List></Card> : <Card><Empty>Открытых замечаний нет.</Empty></Card>}
      {solved.length > 0 && (
        <Details label={`Решённые (${solved.length})`}>
          <Card flush><List>{solved.map(row)}</List></Card>
        </Details>
      )}

      <Sheet open={!!current} title={current ? ISSUE_LABEL[current.kind] : ''} onClose={() => setIssueId(null)}>
        {current && (
          <div className="stack">
            <p>{current.text}</p>
            <Field label="Состояние">
              <Seg wide value={current.status} onChange={(s) => { act.setIssueStatus(current.id, s); toast(`Замечание: ${ISSUE_STATUS[s].label.toLowerCase()}`); }}
                options={[{ value: 'open', label: 'Открыто' }, { value: 'work', label: 'Решается' }, { value: 'done', label: 'Решено' }]} />
            </Field>
            <dl className="kv left">
              <dt>Место</dt><dd>{current.place}</dd>
              <dt>Ответственный</dt><dd>{current.responsible ?? dash}</dd>
              <dt>Срок</dt>
              <dd>{current.due ? <span className={overdue(current, d.today) ? 'neg' : undefined}>{dShort(current.due)}{overdue(current, d.today) ? ', срок прошёл' : ''}</span> : dash}</dd>
              {current.source && (
                <><dt>Связано с</dt><dd>{link ? <Link className="link" style={{ minHeight: 20 }} to={link}>{current.source.label}</Link> : current.source.label}</dd></>
              )}
              <dt>Записал</dt><dd>{dRel(current.date, d.today)}, {current.by}</dd>
              {current.photos > 0 && <><dt>Фото</dt><dd>{count(current.photos, 'фото', 'фото', 'фото')}</dd></>}
            </dl>
            <Details label="История">
              {current.history?.length
                ? current.history.map((h, i) => <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)
                : <p className="muted">Изменений ещё не было.</p>}
            </Details>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** «Замечания»: one main button to report a problem, then the list. */
export function Issues() {
  const o = useObject();
  const d = useData();
  const [adding, setAdding] = useState(false);
  // a new remark opens with the place the person is working in
  const room = d.session.objectId === o.id ? byId(d.rooms, d.session.roomId) : undefined;
  const floor = d.session.objectId === o.id ? d.session.floor ?? room?.floor : undefined;
  const place = [room?.name, floor].filter(Boolean).join(', ');
  return (
    <Page title="Замечания" path={[OBJECT, { label: 'Замечания' }]}
      actions={<Btn kind="primary" onClick={() => setAdding(true)}><TriangleAlert size={16} /> Сообщить о проблеме</Btn>}>
      <IssuesBody objectId={o.id} />
      <IssueSheet open={adding} onClose={() => setAdding(false)} ctx={{ objectId: o.id, place }} />
    </Page>
  );
}
