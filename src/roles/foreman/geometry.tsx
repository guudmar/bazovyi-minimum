// Foreman, measurements («Замеры»). Объект → этаж → помещение.
// A floor is sent for checking as a whole and is accepted as a whole. The data keeps versions of every floor;
// the foreman never sees them as versions: he sees «Черновик», «На проверке», «Принято» or «Вернули» and a history.
// The room is its own page because measuring is a long job.
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { act, useData, useStore, useUser } from '../../data/store';
import {
  ELEMENT_LABEL, GEO_LABEL, GEO_TONE, METHOD_LABEL, WORK_LABEL, WORK_TONE, basisRoom, byId, confirmedGeo, currentGeo, elementArea, floorVersions, floorsOf,
  geoVersionLabel, roomFloor, roomSlopes, roomSurface, roomVolume, roomsOn, round1, totalsOf, workState,
} from '../../data/select';
import {
  Btn, Card, DataTable, Details, Empty, Field, LinkBtn, List, Page, Photos, Pill, Row, Sheet, Status, Two, toast, useDesktop, useWide,
  type Col, type Crumb, type StatusKind,
} from '../../ui/kit';
import { IssueButton, ShareButton, VoiceArea } from '../../shared/extras';
import { addDays, count, dFull, dShort, qty } from '../../lib/format';
import type { BuildObject, Data, GeoTotals, GeoVersion, MeasureMethod, Norm, Opening, Room, SurfaceElement, Unevenness, Work, Zone } from '../../data/types';
import { useObject } from './materials';

/* ---------------------------------------------------------------- helpers */
export const floorPath = (floor: string): string => `/foreman/geometry/${encodeURIComponent(floor)}`;
export const roomPath = (floor: string, roomId: string): string => `${floorPath(floor)}/${roomId}`;

const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
/** A measured or computed value as it is: 2,75 stays 2,75 and a whole number has no tail. */
export const dec = (v: number): string => nf2.format(v);
export const sq = (v: number): string => `${dec(v)} м²`;
const signed = (v: number, unit: string): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dec(Math.abs(round1(v)))} ${unit}`;
const dash = <span className="muted">—</span>;
const rooms3 = (n: number): string => count(n, 'помещение', 'помещения', 'помещений');
const small = { fontSize: 13, lineHeight: '18px' } as const;
const OBJECT: Crumb = { label: 'Объект', to: '/foreman/object' };
const MEASURES: Crumb = { label: 'Замеры', to: '/foreman/geometry' };

/** The largest unevenness measured in a room, in mm. Nothing measured is not a zero. */
export function worstUneven(r: Pick<Room, 'uneven' | 'deviation'>): number | undefined {
  if (r.uneven) return r.uneven.length ? r.uneven.reduce((mx, u) => Math.max(mx, u.mm), 0) : undefined;
  return r.deviation;
}

/** Totals of a version: fixed when it was sent; for the draft being filled they are counted from the rooms as they are now. */
export function versionTotals(d: Data, v: GeoVersion): GeoTotals | undefined {
  const current = currentGeo(d, v.objectId, v.floor)?.id === v.id;
  if (current && (v.status === 'draft' || !v.totals)) return totalsOf(roomsOn(d, v.objectId, v.floor));
  return v.totals;
}
/** How the totals moved from one version to another: «Δ пол +1,2 м² · Δ стены 0 м²». */
export function deltaLine(now: GeoTotals, before: GeoTotals): string {
  const parts = [`Δ пол ${signed(now.floor - before.floor, 'м²')}`, `Δ стены ${signed(now.walls - before.walls, 'м²')}`];
  if (now.rooms !== before.rooms) parts.push(`Δ помещений ${now.rooms > before.rooms ? '+' : '−'}${Math.abs(now.rooms - before.rooms)}`);
  return parts.join(' · ');
}
/** The same movement in the foreman's words: «пол +1,2 м², стены 0 м²». */
function changeLine(now: GeoTotals, before: GeoTotals): string {
  const parts = [`пол ${signed(now.floor - before.floor, 'м²')}`, `стены ${signed(now.walls - before.walls, 'м²')}`];
  if (now.rooms !== before.rooms) parts.push(`помещений ${now.rooms > before.rooms ? '+' : '−'}${Math.abs(now.rooms - before.rooms)}`);
  return parts.join(', ');
}

/** What the planned volume of a work rests on, and whether that version is still the confirmed one. Not shown to the foreman. */
export function workBasis(d: Data, w: Work): { text: string; stale: boolean } | undefined {
  const v = byId(d.geoVersions, w.geoVersionId);
  if (!v && !w.roomId) return undefined;
  return { text: v ? `по геометрии: ${geoVersionLabel(v)}` : geoVersionLabel(undefined), stale: !!v && confirmedGeo(d, v.objectId, v.floor)?.id !== v.id };
}

export function GeoPill({ v }: { v?: GeoVersion }) {
  return v ? <Pill tone={GEO_TONE[v.status]}>{GEO_LABEL[v.status]}</Pill> : <Pill>Версии нет</Pill>;
}

/** The state of a floor's measurements as the foreman sees it: «Черновик», «На проверке», «Принято» or «Вернули». */
export function floorState(v?: GeoVersion): { kind: StatusKind; label: string; note?: string } {
  if (!v) return { kind: 'off', label: 'Нет замеров' };
  if (v.status === 'draft') return v.note ? { kind: 'problem', label: 'Вернули', note: v.note } : { kind: 'off', label: 'Черновик' };
  if (v.status === 'review') return { kind: 'wait', label: 'На проверке' };
  if (v.status === 'confirmed') return { kind: 'done', label: 'Принято' };
  return { kind: 'off', label: GEO_LABEL[v.status] };
}
function FloorStatus({ v }: { v?: GeoVersion }) {
  const s = floorState(v);
  return <Status kind={s.kind}>{s.label}</Status>;
}

/** The main thing to know about the measurements of an object, in one sentence. */
export function geoFinding(d: Data, objectId: string): string {
  const floors = floorsOf(d, objectId);
  if (!floors.length) return 'Замеров ещё нет.';
  const list = floors.map((floor) => ({ floor, v: currentGeo(d, objectId, floor), rooms: roomsOn(d, objectId, floor).length }));
  const returned = list.find((x) => x.v?.status === 'draft' && x.v.note);
  if (returned) return `${returned.floor}: замеры вернули на доработку.`;
  const draft = list.find((x) => x.v?.status === 'draft' && x.rooms > 0);
  if (draft) return `${draft.floor}: замеры не отправлены на проверку.`;
  const review = list.find((x) => x.v?.status === 'review');
  if (review) return `${review.floor}: замеры на проверке.`;
  const none = list.filter((x) => !confirmedGeo(d, objectId, x.floor));
  if (none.length) return `${none.map((x) => x.floor).join(', ')}: замеры ещё не приняты.`;
  return 'Замеры приняты по всем этажам.';
}

const parseNum = (t: string): number => {
  const v = parseFloat(t.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};
const showNum = (v: number): string => (v ? String(v).replace('.', ',') : '');
/** A number typed on a phone keypad. A comma is accepted and stays on screen while the person types. */
export function NumInput({ value, onChange, label, placeholder = '0' }: { value: number; onChange: (v: number) => void; label: string; placeholder?: string }) {
  const [text, setText] = useState(() => showNum(value));
  // a value set from outside (a prefilled volume, a row removed above) replaces the text; the person's own typing is left as typed
  useEffect(() => { setText((t) => (parseNum(t) === value ? t : showNum(value))); }, [value]);
  return (
    <input className="input num" inputMode="decimal" aria-label={label} placeholder={placeholder} value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => { const t = e.target.value.replace(/[^\d.,]/g, ''); setText(t); onChange(parseNum(t)); }} />
  );
}
/** A small caption over a control inside a row of several controls. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 12, lineHeight: '16px', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
const Past = ({ list }: { list: { at: string; by: string; text: string }[] }) => (
  <>{list.map((h, i) => <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)}</>
);
/** A history line in the foreman's words: the data says «версия», he reads «Принято». */
const plainText = (t: string): string => (t.startsWith('Подтверждено') ? 'Принято' : t);

/* --------------------------------------------------------------- versions */
/**
 * Every version of a floor, the newest first: who made it, who accepted it, why it was opened, what changed and how the totals moved.
 * `plain` is the foreman's view: the same history with dates instead of version numbers.
 */
export function VersionList({ objectId, floor, plain }: { objectId: string; floor: string; plain?: boolean }) {
  const d = useData();
  const versions = floorVersions(d, objectId, floor);
  if (!versions.length) return <Empty>{plain ? 'Истории пока нет.' : 'Версий геометрии по этажу ещё нет.'}</Empty>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      {versions.map((v, i) => {
        const prev = versions[i + 1];
        const t = versionTotals(d, v);
        const before = prev ? versionTotals(d, prev) : undefined;
        return (
          <div key={v.id} style={i ? { borderTop: '1px solid var(--rule)', paddingTop: 14 } : undefined}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <b style={{ fontWeight: 600 }}>{plain ? `Замеры от ${dFull(v.createdAt)}` : `Версия ${v.num}`}</b>
              {plain ? <FloorStatus v={v} /> : <GeoPill v={v} />}
            </div>
            <dl className="kv left" style={{ marginTop: 8 }}>
              <dt>{plain ? 'Начаты' : 'Создана'}</dt><dd>{dFull(v.createdAt)}, {v.by}</dd>
              {v.sentAt && <><dt>На проверке</dt><dd>с {dFull(v.sentAt)}</dd></>}
              {v.confirmedAt && <><dt>{plain ? 'Приняты' : 'Подтверждена'}</dt><dd>{dFull(v.confirmedAt)}, {v.confirmedBy ?? dash}</dd></>}
              {v.reason && <><dt>Причина</dt><dd>{v.reason}</dd></>}
              {v.note && <><dt>Замечание</dt><dd>{v.note}</dd></>}
              <dt>Итоги</dt><dd>{t ? `${rooms3(t.rooms)} · пол ${sq(t.floor)} · стены ${sq(t.walls)}` : dash}</dd>
              {prev && (plain
                ? <><dt>Изменение</dt><dd>{t && before ? changeLine(t, before) : dash}</dd></>
                : <><dt>К версии {prev.num}</dt><dd>{t && before ? deltaLine(t, before) : dash}</dd></>)}
            </dl>
            {v.changes.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="section-title" style={{ margin: '0 0 6px' }}>Изменения</div>
                <Past list={plain ? v.changes.map((c) => ({ ...c, text: plainText(c.text) })) : v.changes} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- floors */
/** The floors of an object as cards: rooms and floor area, the state, one button to send a draft for checking. */
export function FloorsBody({ objectId }: { objectId: string }) {
  const d = useData();
  const nav = useNavigate();
  const floors = floorsOf(d, objectId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const sendable = (floor: string): boolean => currentGeo(d, objectId, floor)?.status === 'draft' && roomsOn(d, objectId, floor).length > 0;
  const clean = name.trim().replace(/[\\/]+/g, '-');
  const taken = floors.some((f) => f.toLowerCase() === clean.toLowerCase());
  const closeAdd = () => { setAdding(false); setName(''); };
  return (
    <>
      {floors.length === 0 && <Card><Empty>Замеров ещё нет.</Empty></Card>}
      {floors.length > 0 && (
        <div className="grid cols-2">
          {floors.map((floor) => {
            const cur = currentGeo(d, objectId, floor);
            const s = floorState(cur);
            const t = totalsOf(roomsOn(d, objectId, floor));
            return (
              <Card key={floor} flush>
                <List>
                  <Row to={floorPath(floor)} wrap title={floor}
                    sub={<>{rooms3(t.rooms)}, {sq(t.floor)} пола{s.note && <span className="neg"><br />Вернули: {s.note}</span>}</>}
                    side={<FloorStatus v={cur} />} />
                </List>
                {sendable(floor) && (
                  <div className="card-body" style={{ paddingTop: 0 }}>
                    <Btn kind="primary" block onClick={() => { act.sendFloor(objectId, floor); toast(`${floor}: замеры отправлены на проверку`); }}>Отправить на проверку</Btn>
                  </div>
                )}
                <Details label="История"><VersionList objectId={objectId} floor={floor} plain /></Details>
              </Card>
            );
          })}
        </div>
      )}
      <div>
        <Btn kind={floors.length ? 'secondary' : 'primary'} small={floors.length > 0} onClick={() => setAdding(true)}><Plus size={floors.length ? 16 : 18} /> Добавить этаж</Btn>
      </div>

      <Sheet open={adding} title="Новый этаж" onClose={closeAdd} dirty={!!clean}
        foot={<><Btn onClick={closeAdd}>Отмена</Btn><Btn kind="primary" disabled={!clean || taken}
          onClick={() => { closeAdd(); nav(`${floorPath(clean)}/new`); }}>Добавить первое помещение</Btn></>}>
        <div className="form">
          <Field label="Название этажа" help={taken ? 'Такой этаж уже есть.' : undefined}>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, 3 этаж или подвал" />
          </Field>
        </div>
      </Sheet>
    </>
  );
}

/** «Замеры»: the floors of the current object. */
export function Geometry() {
  const d = useData();
  const o = useObject();
  const [sp] = useSearchParams();
  // a document «Акт геометрии» links here with the floor in the query
  const asked = sp.get('floor');
  if (asked && floorsOf(d, o.id).includes(asked)) return <Navigate to={floorPath(asked)} replace />;
  return <Page title="Замеры" path={[OBJECT, { label: 'Замеры' }]}><FloorsBody objectId={o.id} /></Page>;
}

/* -------------------------------------------------------------- one floor */
export function FloorPage() {
  const d = useData();
  const o = useObject();
  const nav = useNavigate();
  const wide = useWide();
  const { floor = '' } = useParams();
  const exists = floorsOf(d, o.id).includes(floor);
  // the place is kept in the session, so the next form opens with the floor filled in
  useEffect(() => {
    if (!exists) return;
    const s = useStore.getState().session;
    if (s.floor !== floor || s.roomId !== undefined) act.setPlace(floor);
  }, [floor, exists, o.id]);

  const path: Crumb[] = [OBJECT, MEASURES, { label: floor }];
  if (!exists) {
    return (
      <Page title={floor} path={path}>
        <Card><Empty>На этаже ещё нет помещений.</Empty></Card>
        <div className="btn-row">
          <LinkBtn kind="primary" to={`${floorPath(floor)}/new`}><Plus size={18} /> Добавить помещение</LinkBtn>
        </div>
      </Page>
    );
  }

  const rooms = roomsOn(d, o.id, floor);
  const t = totalsOf(rooms);
  const slopes = round1(rooms.reduce((s, r) => s + roomSlopes(r), 0));
  const cur = currentGeo(d, o.id, floor);
  const state = floorState(cur);
  const sendable = cur?.status === 'draft' && rooms.length > 0;
  const dims = (r: Room): string => `${dec(r.length)} × ${dec(r.width)} × ${dec(r.height)}`;
  // from 10 mm noticeably more material goes into levelling: the room is marked in the list
  const bumpy = (r: Room): ReactNode => { const mm = worstUneven(r); return mm !== undefined && mm >= 10 ? <> <Pill tone="warning">неровность {mm} мм</Pill></> : null; };
  const cols: Col<Room>[] = wide ? [
    { head: 'Помещение', cell: (r) => <Two a={<>{r.name}{bumpy(r)}</>} b={r.purpose} /> },
    { head: 'Д × Ш × В, м', cell: dims },
    { head: 'Пол, м²', num: true, cell: (r) => dec(roomFloor(r)) },
    { head: 'Стены, м²', num: true, cell: (r) => dec(roomSurface(r, 'walls')) },
  ] : [
    { head: 'Помещение', phone: 'title', cell: (r) => <>{r.name}{bumpy(r)}</> },
    { head: 'Размеры', phone: 'sub', cell: (r) => `${dims(r)} м` },
    { head: 'Стены', phone: 'sub', cell: (r) => `стены ${sq(roomSurface(r, 'walls'))}` },
    { head: 'Пол', phone: 'value', cell: (r) => sq(roomFloor(r)) },
    { head: 'Что', phone: 'meta', cell: () => 'пол' },
  ];
  return (
    <Page title={floor} path={path}>
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{rooms3(t.rooms)} · пол {sq(t.floor)} · стены {sq(t.walls)}</span>
            <FloorStatus v={cur} />
          </div>
          {state.note && <p className="neg">Вернули: {state.note}</p>}
          {sendable && (
            <Btn kind="primary" block onClick={() => { act.sendFloor(o.id, floor); toast(`${floor}: замеры отправлены на проверку`); }}>Отправить на проверку</Btn>
          )}
        </div>
      </Card>
      <Card title="Помещения" flush>
        <DataTable cols={cols} rows={rooms} keyOf={(r) => r.id} onRow={(r) => nav(roomPath(floor, r.id))} empty="На этаже ещё нет помещений."
          foot={['Итого', '', dec(t.floor), dec(t.walls)]} />
      </Card>
      <div className="btn-row">
        <LinkBtn kind={sendable ? 'secondary' : 'primary'} to={`${floorPath(floor)}/new`}><Plus size={18} /> Добавить помещение</LinkBtn>
      </div>
      <Details label="История">
        <dl className="kv">
          <dt>Откосы</dt><dd>{sq(slopes)}</dd>
          <dt>Периметр</dt><dd>{dec(t.perimeter)} м</dd>
        </dl>
        <VersionList objectId={o.id} floor={floor} plain />
      </Details>
    </Page>
  );
}

/* ------------------------------------------------------------ the room page */
type RoomInput = Parameters<typeof act.saveRoom>[0];
interface RoomDraft {
  name: string; purpose: string; method: MeasureMethod;
  length: number; width: number; height: number;
  openings: Opening[]; elements: SurfaceElement[]; zones: Zone[]; uneven: Unevenness[];
  note: string; photos: number;
}
let rowSeq = 0;
const rowId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${++rowSeq}`;

function toDraft(room?: Room): RoomDraft {
  if (!room) return { name: '', purpose: '', method: 'manual', length: 0, width: 0, height: 0, openings: [], elements: [], zones: [], uneven: [], note: '', photos: 0 };
  return {
    name: room.name, purpose: room.purpose ?? '', method: room.method ?? 'manual', length: room.length, width: room.width, height: room.height,
    openings: room.openings.map((x) => ({ ...x })),
    elements: (room.elements ?? []).map((x) => ({ ...x })),
    zones: (room.zones ?? []).map((x) => ({ ...x, purpose: x.purpose ?? '' })),
    uneven: room.uneven ? room.uneven.map((x) => ({ ...x })) : room.deviation ? [{ id: `${room.id}u0`, place: 'Стены', mm: room.deviation }] : [],
    note: room.note ?? '', photos: room.photos,
  };
}
/** What goes to the store: rows the person started and left empty are dropped. */
function toInput(f: RoomDraft, objectId: string, floor: string, id?: string): RoomInput {
  return {
    id, objectId, floor, name: f.name.trim(), purpose: f.purpose.trim() || undefined, method: f.method,
    length: f.length, width: f.width, height: f.height,
    openings: f.openings.filter((x) => x.w > 0 && x.h > 0),
    elements: f.elements.filter((x) => x.length > 0 && x.height > 0 && x.count > 0).map((x) => ({ ...x, name: x.name.trim() || ELEMENT_LABEL[x.kind] })),
    zones: f.zones.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim(), purpose: x.purpose?.trim() || undefined })),
    uneven: f.uneven.filter((x) => x.mm > 0).map((x) => ({ ...x, place: x.place.trim() || 'Место не указано' })),
    note: f.note.trim() || undefined, photos: f.photos,
  };
}

const BASE_LABEL: Record<NonNullable<Norm['base']>, string> = { walls: 'Стены', floor: 'Пол', ceiling: 'Потолок' };

export function RoomPage() {
  const d = useData();
  const u = useUser();
  const current = useObject();
  const { floor = '', roomId } = useParams();
  const room = byId(d.rooms, roomId);
  const mine = !!room && !!u.objectIds?.includes(room.objectId);
  if (roomId && !mine) {
    return (
      <Page title="Помещение не найдено" path={[OBJECT, MEASURES, { label: 'Помещение' }]}>
        <Card><Empty>Такого помещения нет на ваших объектах.</Empty></Card>
      </Page>
    );
  }
  const o = byId(d.objects, room?.objectId) ?? current;
  const at = room?.floor ?? floor;
  // a new key gives a clean form when the address changes to another room
  return <RoomForm key={`${o.id}/${at}/${room?.id ?? 'new'}`} o={o} floor={at} room={room} />;
}

function RoomForm({ o, floor, room }: { o: BuildObject; floor: string; room?: Room }) {
  const d = useData();
  const nav = useNavigate();
  const desktop = useDesktop();
  const [f, setF] = useState<RoomDraft>(() => toDraft(room));
  const [initial] = useState(() => JSON.stringify(toDraft(room)));
  const [leave, setLeave] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState(false);
  const dirty = JSON.stringify(f) !== initial;
  const floorExists = floorsOf(d, o.id).includes(floor);
  const back = floorExists ? floorPath(floor) : '/foreman/geometry';

  // a permanent link may open a room of another object: the session follows the card, then remembers the place
  useEffect(() => {
    if (useStore.getState().session.objectId !== o.id) act.setObject(o.id);
    if (!room && !floorExists) return;
    const s = useStore.getState().session;
    if (s.floor !== floor || s.roomId !== room?.id) act.setPlace(floor, room?.id);
  }, [o.id, floor, room?.id, floorExists]);
  // closing the tab or reloading with typed data asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const cur = currentGeo(d, o.id, floor);
  const conf = confirmedGeo(d, o.id, floor);
  const needsReason = cur?.status === 'confirmed';
  const input = toInput(f, o.id, floor, room?.id);
  const calc: Room = { ...input, id: room?.id ?? 'draft', measuredAt: d.today, measuredBy: '', history: [] };
  const zonesArea = round1(input.zones?.reduce((s, z) => s + z.area, 0) ?? 0);
  const worst = worstUneven({ uneven: input.uneven });
  const valid = !!input.name && f.length > 0 && f.width > 0 && f.height > 0;
  const canSave = valid && dirty;
  const works = room ? d.works.filter((w) => w.roomId === room.id) : [];
  const purposes = [...new Set(d.rooms.map((r) => r.purpose).filter((p): p is string => !!p))];

  const set = (p: Partial<RoomDraft>) => setF((x) => ({ ...x, ...p }));
  const setOpening = (i: number, p: Partial<Opening>) => set({ openings: f.openings.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const setElement = (i: number, p: Partial<SurfaceElement>) => set({ elements: f.elements.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const setZone = (i: number, p: Partial<Zone>) => set({ zones: f.zones.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const setUneven = (i: number, p: Partial<Unevenness>) => set({ uneven: f.uneven.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  const go = (to: string) => { if (dirty) setLeave(to); else nav(to); };
  // breadcrumbs and any other link of the page ask before leaving a form with typed data
  const guard = (e: MouseEvent<HTMLDivElement>) => {
    if (!dirty) return;
    const href = (e.target as Element).closest('a[href]')?.getAttribute('href') ?? '';
    const hash = href.indexOf('#');
    if (hash < 0) return;
    e.preventDefault();
    e.stopPropagation();
    setLeave(href.slice(hash + 1));
  };
  const save = (why?: string) => {
    act.saveRoom(input, why);
    const after = currentGeo(useStore.getState(), o.id, floor);
    if (after && cur && after.id !== cur.id) toast('Замер сохранён. Этаж снова в черновике');
    else if (cur?.status === 'review' && after?.status === 'draft') toast('Замер сохранён. Этаж снят с проверки');
    else toast(room ? 'Замер сохранён' : 'Помещение добавлено');
    nav(floorPath(floor), { replace: true });
  };

  const path: Crumb[] = [OBJECT, MEASURES, { label: floor, to: back }, { label: room ? room.name : 'Новое помещение' }];
  const label = room ? `${room.name}, ${floor}` : '';
  const removeBtn = (what: string, onClick: () => void) => (
    <button type="button" className="icon-btn" aria-label={what} onClick={onClick}><X size={18} color="var(--muted)" /></button>
  );

  return (
    <div onClickCapture={guard}>
      <Page title={room ? room.name : 'Новое помещение'} path={path}>
        {needsReason && <div className="notice">Замеры уже приняты: изменение отправится на проверку заново.</div>}
        {cur?.status === 'review' && <div className="notice">Замеры этажа на проверке: изменение снимет их с проверки.</div>}
        {cur?.status === 'draft' && cur.note && <div className="notice">Вернули: {cur.note}</div>}

        <Card>
          <div className="form">
            <Field label="Название"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Например, кухня" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <Field label="Длина, м"><NumInput label="Длина, м" value={f.length} onChange={(v) => set({ length: v })} /></Field>
              <Field label="Ширина, м"><NumInput label="Ширина, м" value={f.width} onChange={(v) => set({ width: v })} /></Field>
              <Field label="Высота, м"><NumInput label="Высота, м" value={f.height} onChange={(v) => set({ height: v })} /></Field>
            </div>
          </div>
        </Card>

        <Card title="Двери и окна">
          <div className="stack" style={{ gap: 8 }}>
            {f.openings.length > 0 && (
              <div className="muted" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) 44px', gap: 8, fontSize: 12, lineHeight: '16px' }}>
                <span>Проём</span><span>Ширина, м</span><span>Высота, м</span><span />
              </div>
            )}
            {f.openings.map((x, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) 44px', gap: 8, alignItems: 'center' }}>
                <select className="select" aria-label="Вид проёма" value={x.kind} onChange={(e) => setOpening(i, { kind: e.target.value as Opening['kind'] })}>
                  <option value="door">Дверь</option><option value="window">Окно</option>
                </select>
                <NumInput label="Ширина проёма, м" value={x.w} onChange={(v) => setOpening(i, { w: v })} />
                <NumInput label="Высота проёма, м" value={x.h} onChange={(v) => setOpening(i, { h: v })} />
                {removeBtn('Убрать проём', () => set({ openings: f.openings.filter((_, j) => j !== i) }))}
              </div>
            ))}
            <div className="btn-row">
              <Btn small onClick={() => set({ openings: [...f.openings, { kind: 'door', w: 0, h: 0 }] })}><Plus size={16} /> Дверь</Btn>
              <Btn small onClick={() => set({ openings: [...f.openings, { kind: 'window', w: 0, h: 0 }] })}><Plus size={16} /> Окно</Btn>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', gap: '4px 20px', flexWrap: 'wrap' }}>
            <span><span className="muted">Пол</span> <b className="num" style={{ fontWeight: 600 }}>{sq(roomFloor(calc))}</b></span>
            <span><span className="muted">Стены</span> <b className="num" style={{ fontWeight: 600 }}>{sq(Math.max(0, roomSurface(calc, 'walls')))}</b></span>
          </div>
        </Card>

        <Details>
          <div className="form">
            <Field label="Назначение">
              <input className="input" list="room-purposes" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="Жилая, кухня, мокрая зона" />
              <datalist id="room-purposes">{purposes.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="Чем мерили" help={f.method === 'phone' ? 'Проверьте рулеткой: телефон меряет неточно.' : undefined}>
              <select className="select" value={f.method} onChange={(e) => set({ method: e.target.value as MeasureMethod })}>
                {(Object.keys(METHOD_LABEL) as MeasureMethod[]).map((k) => <option key={k} value={k}>{METHOD_LABEL[k]}</option>)}
              </select>
            </Field>
          </div>

          <Card title="Ниши, выступы и откосы">
            <div className="stack">
              {f.elements.map((x, i) => (
                <div key={x.id} className="stack" style={{ gap: 8, paddingTop: i ? 12 : 0, borderTop: i ? '1px solid var(--rule)' : undefined }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 44px', gap: 8, alignItems: 'center' }}>
                    <select className="select" aria-label="Вид элемента" value={x.kind} onChange={(e) => setElement(i, { kind: e.target.value as SurfaceElement['kind'] })}>
                      {(Object.keys(ELEMENT_LABEL) as SurfaceElement['kind'][]).map((k) => <option key={k} value={k}>{ELEMENT_LABEL[k]}</option>)}
                    </select>
                    <span className="num nowrap" style={{ fontWeight: 500 }}>{sq(elementArea(x))}</span>
                    {removeBtn('Убрать элемент', () => set({ elements: f.elements.filter((_, j) => j !== i) }))}
                  </div>
                  <input className="input" aria-label="Название элемента" value={x.name} onChange={(e) => setElement(i, { name: e.target.value })}
                    placeholder={x.kind === 'slope' ? 'Например, откосы окон' : x.kind === 'niche' ? 'Например, ниша под телевизор' : 'Например, короб стояка'} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <Cell label="Длина, м"><NumInput label="Длина элемента, м" value={x.length} onChange={(v) => setElement(i, { length: v })} /></Cell>
                    <Cell label="Высота, м"><NumInput label="Высота или глубина элемента, м" value={x.height} onChange={(v) => setElement(i, { height: v })} /></Cell>
                    <Cell label="Сколько"><NumInput label="Количество одинаковых элементов" value={x.count} onChange={(v) => setElement(i, { count: Math.round(v) })} /></Cell>
                  </div>
                </div>
              ))}
              <div><Btn small onClick={() => set({ elements: [...f.elements, { id: rowId('e'), kind: 'slope', name: '', length: 0, height: 0, count: 1 }] })}><Plus size={16} /> Добавить</Btn></div>
            </div>
          </Card>

          <dl className="kv">
            <dt>Откосы</dt><dd>{sq(roomSlopes(calc))}</dd>
            <dt>Периметр</dt><dd>{dec(round1(2 * (calc.length + calc.width)))} м</dd>
            <dt>Объём</dt><dd>{dec(roomVolume(calc))} м³</dd>
          </dl>

          <Card title="Зоны" note={f.zones.length ? `${sq(zonesArea)} из ${sq(roomFloor(calc))} пола` : undefined}>
            <div className="stack">
              {zonesArea > roomFloor(calc) && <p className="neg">Зоны больше пола на {sq(round1(zonesArea - roomFloor(calc)))}.</p>}
              {f.zones.map((x, i) => (
                <div key={x.id} className="stack" style={{ gap: 8, paddingTop: i ? 12 : 0, borderTop: i ? '1px solid var(--rule)' : undefined }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px', gap: 8, alignItems: 'center' }}>
                    <input className="input" aria-label="Название зоны" value={x.name} onChange={(e) => setZone(i, { name: e.target.value })} placeholder="Например, душевая" />
                    {removeBtn('Убрать зону', () => set({ zones: f.zones.filter((_, j) => j !== i) }))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 8 }}>
                    <Cell label="Назначение"><input className="input" aria-label="Назначение зоны" value={x.purpose ?? ''} onChange={(e) => setZone(i, { purpose: e.target.value })} /></Cell>
                    <Cell label="Площадь, м²"><NumInput label="Площадь зоны, м²" value={x.area} onChange={(v) => setZone(i, { area: v })} /></Cell>
                  </div>
                </div>
              ))}
              <div><Btn small onClick={() => set({ zones: [...f.zones, { id: rowId('z'), name: '', purpose: '', area: 0 }] })}><Plus size={16} /> Добавить зону</Btn></div>
            </div>
          </Card>

          <Card title="Неровности" action={worst !== undefined && worst >= 10 ? <Pill tone="warning">до {worst} мм</Pill> : undefined}>
            <div className="stack" style={{ gap: 8 }}>
              {f.uneven.map((x, i) => (
                <div key={x.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 92px 44px', gap: 8, alignItems: 'center' }}>
                  <input className="input" aria-label="Место неровности" value={x.place} onChange={(e) => setUneven(i, { place: e.target.value })} placeholder="Где: стена у окна" />
                  <NumInput label="Неровность, мм" placeholder="мм" value={x.mm} onChange={(v) => setUneven(i, { mm: v })} />
                  {removeBtn('Убрать неровность', () => set({ uneven: f.uneven.filter((_, j) => j !== i) }))}
                </div>
              ))}
              <div><Btn small onClick={() => set({ uneven: [...f.uneven, { id: rowId('u'), place: '', mm: 0 }] })}><Plus size={16} /> Добавить неровность</Btn></div>
            </div>
          </Card>

          <Card title="Заметки и фото">
            <div className="form">
              <VoiceArea label="Особенности помещения" value={f.note} onChange={(note) => set({ note })} placeholder="Что мешало измерить, что важно знать бригаде" />
              <Photos count={f.photos} onChange={(photos) => set({ photos })} />
            </div>
          </Card>

          {room && (
            <Card title="Работы в помещении" flush>
              {works.length > 0 && (
                <List>
                  {works.map((w) => {
                    const st = workState(w, d.today);
                    return (
                      <Row key={w.id} wrap title={w.name} sub={`${w.crew ?? 'бригада не назначена'} · до ${dShort(w.deadline)}`}
                        value={qty(w.plan, w.unit)} meta={<Pill tone={WORK_TONE[st]}>{WORK_LABEL[st]}</Pill>} />
                    );
                  })}
                </List>
              )}
              <div className="card-body stack" style={{ gap: 8, borderTop: works.length ? '1px solid var(--rule)' : undefined }}>
                <div><Btn small disabled={!conf || dirty} onClick={() => setPlan(true)}><Plus size={16} /> Запланировать работу</Btn></div>
                {!conf && <p className="muted" style={small}>Можно после того, как замеры этажа примут.</p>}
                {conf && dirty && <p className="muted" style={small}>Сначала сохраните замер.</p>}
              </div>
            </Card>
          )}

          {room && (
            <Card title="История помещения">
              <Past list={[...room.history].reverse()} />
            </Card>
          )}

          {room && (
            <div className="btn-row">
              <IssueButton ctx={{ objectId: o.id, place: label, source: { kind: 'room', id: room.id, label } }}>Сообщить о проблеме</IssueButton>
              <ShareButton path={roomPath(floor, room.id)} title={label} />
            </div>
          )}
        </Details>

        <div className="sticky-cta" style={desktop ? { position: 'sticky', bottom: 16 } : undefined}>
          {leave ? (
            <div className="card" role="alertdialog" aria-label="Несохранённые данные">
              <div className="card-body stack">
                <p>Уйти без сохранения? Введённые данные пропадут.</p>
                <div className="btn-row">
                  <Btn style={{ flex: '1 1 150px' }} onClick={() => setLeave(null)}>Вернуться к форме</Btn>
                  <Btn kind="danger" style={{ flex: '1 1 150px' }} onClick={() => nav(leave)}>Уйти без сохранения</Btn>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={() => go(back)}><ChevronLeft size={18} /> Назад</Btn>
              <Btn kind="primary" style={{ flex: 1 }} disabled={!canSave} onClick={() => (needsReason ? setAsking(true) : save())}>Сохранить замер</Btn>
            </div>
          )}
        </div>

        <Sheet open={asking} title="Причина изменения" onClose={() => setAsking(false)} dirty={!!reason.trim()}
          foot={<><Btn onClick={() => setAsking(false)}>Отмена</Btn><Btn kind="primary" disabled={!reason.trim()} onClick={() => save(reason.trim())}>Сохранить</Btn></>}>
          <div className="form">
            <p>Замеры уже приняты: изменение отправится на проверку заново.</p>
            <Field label="Почему меняете">
              <VoiceArea label="Причина изменения" value={reason} onChange={setReason} placeholder="Например, повторный замер после демонтажа перегородки" />
            </Field>
          </div>
        </Sheet>
        {room && <PlanWorkSheet open={plan} onClose={() => setPlan(false)} room={room} />}
      </Page>
    </div>
  );
}

/** Plan a work from the room: the volume comes from the surface the norm is calculated by and stays editable. */
function PlanWorkSheet({ open, onClose, room }: { open: boolean; onClose: () => void; room: Room }) {
  const d = useData();
  const conf = confirmedGeo(d, room.objectId, room.floor);
  const cur = currentGeo(d, room.objectId, room.floor);
  // the volume comes from the accepted measurements, not from a draft that is still being edited
  const surfaceOf = (n?: Norm): number => (n?.base ? roomSurface(basisRoom(d, room) ?? room, n.base) : 0);
  const [normId, setNormId] = useState(() => d.norms[0]?.id ?? '');
  const [volume, setVolume] = useState(() => surfaceOf(d.norms[0]));
  const [deadline, setDeadline] = useState(() => addDays(d.today, 7));
  const [crew, setCrew] = useState('');
  const [touched, setTouched] = useState(false);
  // every opening starts from the first norm and the surface of the room as it is saved now
  useEffect(() => {
    if (!open) return;
    const first = d.norms[0];
    setNormId(first?.id ?? ''); setVolume(surfaceOf(first)); setDeadline(addDays(d.today, 7)); setCrew(''); setTouched(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const norm = byId(d.norms, normId);
  const crews = [...new Set(d.works.map((w) => w.crew).filter((c): c is string => !!c))];
  const ok = !!norm && !!conf && volume > 0 && !!deadline;
  const add = () => {
    if (!norm) return;
    act.createWork({ objectId: room.objectId, roomId: room.id, normId: norm.id, name: norm.work, unit: norm.unit, plan: volume, deadline, crew: crew.trim() });
    toast(`Работа добавлена: ${qty(round1(volume), norm.unit)}`);
    onClose();
  };
  return (
    <Sheet open={open} title="Запланировать работу" onClose={onClose} dirty={touched}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={add}>Добавить</Btn></>}>
      <div className="form">
        <p className="muted" style={small}>{room.name}, {room.floor}</p>
        {conf && cur && cur.id !== conf.id && <div className="notice">Замеры этажа меняются: объём взят из принятых.</div>}
        <Field label="Норма">
          <select className="select" value={normId} onChange={(e) => { const n = byId(d.norms, e.target.value); setNormId(e.target.value); setVolume(surfaceOf(n)); setTouched(true); }}>
            {d.norms.map((n) => <option key={n.id} value={n.id}>{n.work}</option>)}
          </select>
        </Field>
        <Field label={`Объём, ${norm?.unit ?? ''}`}
          help={norm?.base ? `${BASE_LABEL[norm.base]} помещения: ${sq(surfaceOf(norm))}` : 'Введите объём вручную.'}>
          <NumInput label="Объём работы" value={volume} onChange={(v) => { setVolume(v); setTouched(true); }} />
        </Field>
        <Field label="Срок">
          <input className="input" type="date" min={d.today} value={deadline} onChange={(e) => { setDeadline(e.target.value); setTouched(true); }} />
        </Field>
        <Field label="Бригада">
          <input className="input" list="work-crews" value={crew} onChange={(e) => { setCrew(e.target.value); setTouched(true); }} placeholder="Например, бригада Сафина" />
          <datalist id="work-crews">{crews.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
    </Sheet>
  );
}
