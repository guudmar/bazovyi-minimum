// Foreman, works: geometry of the object, the plan of works, the fact and the acts, remarks and problems.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { act, useData } from '../../data/store';
import {
  ISSUE_LABEL, WORK_LABEL, WORK_TONE, byId, roomFloor, roomVolume, roomWalls, round1, workDone, workState, workToPresent, type Tone,
} from '../../data/select';
import { Btn, Card, Chips, Empty, Field, List, Page, Photos, Pill, Row, Seg, Sheet, Stepper, Track, toast } from '../../ui/kit';
import { count, dRel, dShort, num, qty, weekStart, addDays } from '../../lib/format';
import type { Avr, Issue, IssueKind, Opening, Room, Work } from '../../data/types';
import { useObject } from './materials';

const m1 = (v: number) => num(v, Number.isInteger(v) ? 0 : v * 10 === Math.round(v * 10) ? 1 : 2);

/* --------------------------------------------------------------- geometry */
type RoomDraft = Omit<Room, 'id' | 'history' | 'measuredAt' | 'measuredBy'> & { id?: string };
function Dim({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input className="input num" inputMode="decimal" value={String(value).replace('.', ',')} onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseFloat(e.target.value.replace(',', '.')) || 0)} />
    </Field>
  );
}

export function GeometryBody({ objectId }: { objectId: string }) {
  const d = useData();
  const rooms = d.rooms.filter((r) => r.objectId === objectId);
  const acts = d.acts.filter((a) => a.objectId === objectId).sort((a, b) => b.date.localeCompare(a.date));
  const floors = [...new Set(rooms.map((r) => r.floor))];
  const [draft, setDraft] = useState<RoomDraft | null>(null);
  const original = byId(d.rooms, draft?.id);
  const set = (p: Partial<RoomDraft>) => setDraft((x) => (x ? { ...x, ...p } : x));
  const blank: RoomDraft = { objectId, floor: floors[0] ?? '1 этаж', name: '', length: 4, width: 3, height: 2.7, openings: [{ kind: 'door', w: 0.8, h: 2.1 }], deviation: 0, note: '', photos: 0 };
  const total = round1(rooms.reduce((s, r) => s + r.length * r.width, 0));
  const lastAct = acts[0];
  const changedAfterAct = lastAct ? rooms.some((r) => r.measuredAt > lastAct.date) : rooms.length > 0;
  return (
    <>
      {floors.map((floor) => (
        <Card key={floor} title={floor} note={`${m1(round1(rooms.filter((r) => r.floor === floor).reduce((s, r) => s + r.length * r.width, 0)))} м² пола`} flush>
          <List>
            {rooms.filter((r) => r.floor === floor).map((r) => (
              <Row key={r.id} onClick={() => setDraft({ ...r })} title={r.name}
                sub={`${m1(r.length)} × ${m1(r.width)} × ${m1(r.height)} м · стены ${m1(roomWalls(r))} м²${(r.deviation ?? 0) >= 10 ? ` · отклонение ${r.deviation} мм` : ''}`}
                value={`${m1(roomFloor(r))} м²`} meta="пол" />
            ))}
          </List>
        </Card>
      ))}
      {!rooms.length && <Card><Empty>Замеров по объекту ещё нет. Начните с первого помещения.</Empty></Card>}
      <div className="btn-row">
        <Btn kind="primary" onClick={() => setDraft(blank)}><Plus size={18} /> Добавить помещение</Btn>
        <Btn disabled={!rooms.length || !changedAfterAct} onClick={() => { act.makeAct(objectId); toast('Акт геометрии сформирован'); }}>Сформировать акт геометрии</Btn>
      </div>
      <Card title="Акты геометрии" flush>
        {acts.length ? (
          <List>{acts.map((a) => <Row key={a.id} title={`Акт геометрии № ${a.num}`} sub={`${dShort(a.date)} · ${a.by} · ${count(a.rooms, 'помещение', 'помещения', 'помещений')}`} value={`${m1(a.floorArea)} м²`} />)}</List>
        ) : <Empty>Акт ещё не формировался.</Empty>}
      </Card>
      <p className="muted" style={{ fontSize: 13 }}>
        Всего по объекту {m1(total)} м² пола. Замеры хранятся с историей: прежние значения не затираются.
        {changedAfterAct && lastAct ? ' После последнего акта замеры менялись.' : ''} Замер камерой телефона появится позже, сейчас размеры вводятся вручную.
      </p>

      <Sheet open={!!draft} wide title={draft?.id ? draft.name : 'Новое помещение'} onClose={() => setDraft(null)}
        foot={<><Btn onClick={() => setDraft(null)}>Отмена</Btn><Btn kind="primary" disabled={!draft?.name.trim() || !draft.length || !draft.width || !draft.height}
          onClick={() => { if (draft) { act.saveRoom(draft); toast(draft.id ? 'Замер сохранён, изменение записано в историю' : 'Помещение добавлено'); } setDraft(null); }}>Сохранить замер</Btn></>}>
        {draft && (
          <div className="form">
            <div className="form-2">
              <Field label="Помещение"><input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Например, кухня" /></Field>
              <Field label="Этаж"><input className="input" value={draft.floor} onChange={(e) => set({ floor: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <Dim label="Длина, м" value={draft.length} onChange={(v) => set({ length: v })} />
              <Dim label="Ширина, м" value={draft.width} onChange={(v) => set({ width: v })} />
              <Dim label="Высота, м" value={draft.height} onChange={(v) => set({ height: v })} />
            </div>
            <div className="notice plain">
              <b style={{ color: 'var(--text)', fontWeight: 600 }}>Пол {m1(roomFloor(draft))} м² · стены {m1(roomWalls(draft))} м² · объём {m1(roomVolume(draft))} м³</b>
              <br />Площадь стен уже без дверей и окон.
            </div>
            <div>
              <div className="label" style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Двери и окна <span className="muted" style={{ fontWeight: 400 }}>· ширина и высота, м</span></div>
              <div className="stack" style={{ gap: 8 }}>
                {draft.openings.map((o, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) 44px', gap: 8, alignItems: 'center' }}>
                    <select className="select" aria-label="Тип проёма" value={o.kind} onChange={(e) => set({ openings: draft.openings.map((x, j) => (j === i ? { ...x, kind: e.target.value as Opening['kind'] } : x)) })}>
                      <option value="door">Дверь</option><option value="window">Окно</option>
                    </select>
                    <input className="input num" inputMode="decimal" aria-label="Ширина проёма, м" value={String(o.w).replace('.', ',')} onChange={(e) => set({ openings: draft.openings.map((x, j) => (j === i ? { ...x, w: parseFloat(e.target.value.replace(',', '.')) || 0 } : x)) })} />
                    <input className="input num" inputMode="decimal" aria-label="Высота проёма, м" value={String(o.h).replace('.', ',')} onChange={(e) => set({ openings: draft.openings.map((x, j) => (j === i ? { ...x, h: parseFloat(e.target.value.replace(',', '.')) || 0 } : x)) })} />
                    <button className="icon-btn" aria-label="Убрать проём" onClick={() => set({ openings: draft.openings.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <div><Btn small onClick={() => set({ openings: [...draft.openings, { kind: 'window', w: 1.4, h: 1.5 }] })}><Plus size={16} /> Добавить проём</Btn></div>
              </div>
            </div>
            <Field label="Отклонение стен или пола, мм" help="От 10 мм материала уйдёт заметно больше расчётного.">
              <Stepper value={draft.deviation ?? 0} onChange={(v) => set({ deviation: v })} />
            </Field>
            <Field label="Особенности замера"><textarea className="textarea" value={draft.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="Неровности, выступы, что мешало измерить" /></Field>
            <Photos count={draft.photos} onChange={(n) => set({ photos: n })} />
            {original && original.history.length > 0 && (
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}>История замеров</div>
                {original.history.map((h, i) => <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
export function Geometry() {
  const o = useObject();
  return <Page title="Геометрия" sub={o.name}><GeometryBody objectId={o.id} /></Page>;
}

/* ------------------------------------------------------------------ works */
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
        <span>выполнено {m1(done)} из {qty(w.plan, w.unit)}{w.accepted > 0 ? ` · принято ${m1(w.accepted)}` : ''}</span>
        <span className={st === 'late' ? 'neg' : ''}>срок {dShort(w.deadline)}</span>
      </div>
    </div>
  );
  return onClick ? <button type="button" className="row" onClick={onClick}>{inner}</button> : <div className="row">{inner}</div>;
}

export function WorksBody({ objectId }: { objectId: string }) {
  const d = useData();
  const works = d.works.filter((w) => w.objectId === objectId);
  const [work, setWork] = useState<Work | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState(0);
  const weekEnd = addDays(weekStart(d.today), 6);
  const open = (w: Work) => { setWork(w); setAmount(round1(w.plan - workDone(w))); setNote(''); setPhotos(0); };
  const now = works.filter((w) => !['accepted', 'done'].includes(workState(w, d.today)) && (w.deadline <= weekEnd || workDone(w) > 0));
  const later = works.filter((w) => !['accepted', 'done'].includes(workState(w, d.today)) && !now.includes(w));
  const finished = works.filter((w) => ['accepted', 'done'].includes(workState(w, d.today)));
  const left = work ? round1(work.plan - workDone(work)) : 0;
  const group = (title: string, list: Work[], empty: string, tappable: boolean) => (
    <Card title={title} note={list.length ? String(list.length) : undefined} flush>
      {list.length ? <List>{list.map((w) => <WorkLine key={w.id} w={w} onClick={tappable ? () => open(w) : undefined} />)}</List> : <Empty>{empty}</Empty>}
    </Card>
  );
  return (
    <>
      {group('На этой неделе', now, 'На эту неделю работ не запланировано.', true)}
      {later.length > 0 && group('Дальше по плану', later, '', true)}
      {group('Выполнено', finished, 'Завершённых работ пока нет.', false)}
      <Sheet open={!!work} title={work ? `Факт: ${work.name}` : ''} onClose={() => setWork(null)}
        foot={<><Btn onClick={() => setWork(null)}>Отмена</Btn><Btn kind="primary" disabled={amount <= 0 || amount > left}
          onClick={() => { if (work) { act.addFact(work.id, amount, note, photos); toast(`Записано: ${qty(amount, work.unit)}`); } setWork(null); }}>Записать факт</Btn></>}>
        {work && (
          <div className="form">
            <p className="muted">{byId(d.rooms, work.roomId)?.name ? `${byId(d.rooms, work.roomId)?.name} · ` : ''}по плану {qty(work.plan, work.unit)}, осталось {qty(left, work.unit)}.</p>
            <Field label={`Выполнено сегодня, ${work.unit}`}><Stepper value={amount} max={left} onChange={setAmount} /></Field>
            <Photos count={photos} onChange={setPhotos} />
            <Field label="Замечание, если есть"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        )}
      </Sheet>
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
      <WorksBody objectId={o.id} />
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

export function IssuesBody({ objectId }: { objectId: string }) {
  const d = useData();
  const [filter, setFilter] = useState<'active' | 'done'>('active');
  const [issue, setIssue] = useState<Issue | null>(null);
  const [form, setForm] = useState(false);
  const [f, setF] = useState<{ kind: IssueKind; place: string; text: string; photos: number }>({ kind: 'defect', place: '', text: '', photos: 0 });
  const all = d.issues.filter((i) => i.objectId === objectId);
  const active = all.filter((i) => i.status !== 'done');
  const list = (filter === 'active' ? active : all.filter((i) => i.status === 'done')).sort((a, b) => b.date.localeCompare(a.date));
  const current = byId(d.issues, issue?.id);
  return (
    <>
      <div className="btn-row"><Btn kind="primary" onClick={() => setForm(true)}><Plus size={18} /> Зафиксировать проблему</Btn></div>
      <Seg value={filter} onChange={setFilter} options={[{ value: 'active', label: `Открытые · ${active.length}` }, { value: 'done', label: `Решённые · ${all.length - active.length}` }]} />
      <Card flush>
        {list.length ? (
          <List>
            {list.map((i) => (
              <Row key={i.id} wrap onClick={() => setIssue(i)} title={i.text}
                sub={`${ISSUE_LABEL[i.kind]} · ${i.place} · ${dRel(i.date, d.today).toLowerCase()}${i.photos ? ` · ${count(i.photos, 'фото', 'фото', 'фото')}` : ''}`}
                side={<Pill tone={ISSUE_TONE[i.status]}>{ISSUE_STATUS[i.status]}</Pill>} />
            ))}
          </List>
        ) : <Empty>{filter === 'active' ? 'Открытых замечаний по объекту нет.' : 'Решённых замечаний пока нет.'}</Empty>}
      </Card>

      <Sheet open={!!current} title={current ? ISSUE_LABEL[current.kind] : ''} onClose={() => setIssue(null)}>
        {current && (
          <div className="stack">
            <p>{current.text}</p>
            <dl className="kv left">
              <dt>Место</dt><dd>{current.place}</dd>
              <dt>Дата</dt><dd>{dShort(current.date)}, {current.by}</dd>
              <dt>Фото</dt><dd>{current.photos || '—'}</dd>
            </dl>
            <Field label="Состояние">
              <Seg wide value={current.status} onChange={(s) => { act.setIssueStatus(current.id, s); toast(`Замечание: ${ISSUE_STATUS[s].toLowerCase()}`); }}
                options={[{ value: 'open', label: 'Открыто' }, { value: 'work', label: 'Решается' }, { value: 'done', label: 'Решено' }]} />
            </Field>
          </div>
        )}
      </Sheet>

      <Sheet open={form} title="Новое замечание" onClose={() => setForm(false)}
        foot={<><Btn onClick={() => setForm(false)}>Отмена</Btn><Btn kind="primary" disabled={!f.text.trim() || !f.place.trim()}
          onClick={() => { act.addIssue({ objectId, ...f }); setF({ kind: 'defect', place: '', text: '', photos: 0 }); setForm(false); toast('Замечание записано'); }}>Записать</Btn></>}>
        <div className="form">
          <Field label="Что случилось">
            <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as IssueKind })}>
              {(Object.keys(ISSUE_LABEL) as IssueKind[]).map((k) => <option key={k} value={k}>{ISSUE_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Место"><input className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="Помещение, стена, зона" /></Field>
          <Field label="Описание"><textarea className="textarea" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Коротко: что не так и что мешает" /></Field>
          <Photos count={f.photos} onChange={(n) => setF({ ...f, photos: n })} />
        </div>
      </Sheet>
    </>
  );
}
export function Issues() {
  const o = useObject();
  return <Page title="Замечания и проблемы" sub={o.name}><IssuesBody objectId={o.id} /></Page>;
}
