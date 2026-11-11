// Foreman, materials: what is coming, what he ordered, what is on the site.
// Built for a phone held in one hand: big steppers, short flows, one main button.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Calculator, Plus, Search, Trash2 } from 'lucide-react';
import { act, useData, useStore, useUser, type State } from '../../data/store';
import {
  LINE_LABEL, LINE_TONE, MOVE_LABEL, NEED_LABEL, NEED_TONE, PART_LABEL, ROUTE_SHORT, byId, confirmedGeo, floorsOf, lineStats, lineState,
  material, needState, objectName, roomSurface, roomsOn, round1, sitePlaces, siteStock, type SiteRow,
} from '../../data/select';
import {
  Btn, Card, Chips, DataTable, Details, Empty, Field, Go, LinkBtn, List, Page, Photos, Pill, RouteBar, Row, Seg, Sheet, Status, Stepper, toast,
  type Col, type Crumb, type StatusKind,
} from '../../ui/kit';
import { IssueButton, ShareButton, VoiceArea } from '../../shared/extras';
import { addDays, count, dRel, dShort, qty } from '../../lib/format';
import type { BuildObject, Data, Delivery, DeliveryLine, Material, Need, NeedDraft, NeedLine, NeedPart, PartStatus, SiteMove, SourcePosition } from '../../data/types';

export function useObject(): BuildObject {
  const d = useData();
  const u = useUser();
  const list = d.objects.filter((o) => u.objectIds?.includes(o.id));
  return list.find((o) => o.id === d.session.objectId) ?? list[0] ?? d.objects[0];
}

/* ---------------------------------------------------------------- helpers */
const dash = <span className="muted">—</span>;
const small = { fontSize: 13, lineHeight: '18px' } as const;

type MatTab = 'deliveries' | 'needs' | 'stock';
const OBJECT: Crumb = { label: 'Объект', to: '/foreman/object' };
const matCrumb = (tab: MatTab): Crumb => ({ label: 'Материалы', to: `/foreman/materials?tab=${tab}` });

/** How many units of application are in the quantity: 60 меш of a 30 kg mix is 1 800 кг. */
const inUse = (m: Material, amount: number): string | undefined => (m.k && m.useUnit ? qty(round1(amount * m.k), m.useUnit) : undefined);

/** The place a record belongs to, in words: «1 этаж, Гостиная». A record without a place is for the whole object. */
function placeText(d: Data, floor?: string, roomId?: string): string | undefined {
  const room = byId(d.rooms, roomId);
  const parts = [floor ?? room?.floor, room?.name].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}
/** The place the person is working in now: the floor is taken from the room when only the room is known. */
function sessionPlace(s: State): { floor?: string; roomId?: string } {
  return { floor: s.session.floor ?? byId(s.rooms, s.session.roomId)?.floor, roomId: s.session.roomId };
}

/** What the quantities of a need were calculated from, in plain words. */
function basisText(d: Data, b: NonNullable<Need['basis']>): string {
  const norm = byId(d.norms, b.normId);
  return `Рассчитано по норме${norm ? ` «${norm.work}»` : ''}${b.volume !== undefined ? `, объём ${qty(b.volume, norm?.unit ?? '').trim()}` : ''}`;
}

const ISSUE_TEXT: Record<NonNullable<DeliveryLine['issue']>, string> = { short: 'недостача', wrong: 'пересорт', damaged: 'повреждение' };
const deliveryOfPart = (d: Data, partId: string): Delivery | undefined => d.deliveries.find((x) => x.lines.some((l) => l.partId === partId));
const SURFACE: Record<'walls' | 'floor' | 'ceiling', string> = { walls: 'стены', floor: 'пол', ceiling: 'потолок' };
const shortList = (d: Data, n: Need): string =>
  `${n.lines.map((l) => material(d, l.materialId).name).slice(0, 2).join(', ')}${n.lines.length > 2 ? ` и ещё ${n.lines.length - 2}` : ''}`;

/* -------------------------------------------------------------- the page */
const TABS: { value: MatTab; label: string }[] = [{ value: 'deliveries', label: 'Поставки' }, { value: 'needs', label: 'Заявки' }, { value: 'stock', label: 'На объекте' }];

/** «Материалы»: deliveries, requests and what is on the site, switched in place and kept in the address. */
export function Materials() {
  const d = useData();
  const o = useObject();
  const [sp, setSp] = useSearchParams();
  const waiting = d.deliveries.some((x) => x.objectId === o.id && x.status === 'expected');
  // chosen once: the tab does not jump away when the last delivery is accepted
  const [fallback] = useState<MatTab>(waiting ? 'deliveries' : 'needs');
  const asked = sp.get('tab');
  const tab: MatTab = asked === 'deliveries' || asked === 'needs' || asked === 'stock' ? asked : fallback;
  const setTab = (t: MatTab) => setSp((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
  return (
    <Page title="Материалы" path={[OBJECT, { label: 'Материалы' }]}
      actions={<LinkBtn kind={tab === 'deliveries' && waiting ? 'secondary' : 'primary'} to="/foreman/needs/new"><Plus size={18} /> Заказать материал</LinkBtn>}>
      <Seg wide value={tab} onChange={setTab} options={TABS} />
      {tab === 'deliveries' && <DeliveriesBody objectId={o.id} />}
      {tab === 'needs' && <NeedsBody objectId={o.id} />}
      {tab === 'stock' && <StockBody objectId={o.id} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ needs */
export function NeedsBody({ objectId }: { objectId: string }) {
  const d = useData();
  const needs = d.needs.filter((n) => n.objectId === objectId).sort((a, b) => b.num - a.num);
  const draft = d.session.needDraft?.objectId === objectId ? d.session.needDraft : undefined;
  if (!needs.length && !draft) return <Card><Empty>Заявок по этому объекту ещё не было.</Empty></Card>;
  return (
    <Card flush>
      <List>
        {draft && (
          <Row to="/foreman/needs/new" title="Начатая заявка"
            sub={draft.lines.length ? count(draft.lines.length, 'позиция', 'позиции', 'позиций') : 'позиций пока нет'}
            side={<Status kind="off">Не отправлена</Status>} />
        )}
        {needs.map((n) => {
          const st = needState(n);
          return (
            <Row key={n.id} to={`/foreman/needs/${n.id}`} title={`Заявка № ${n.num}`}
              sub={`${dRel(n.date, d.today)} · ${shortList(d, n)}`}
              side={<Pill tone={NEED_TONE[st]}>{NEED_LABEL[st]}</Pill>} />
          );
        })}
      </List>
    </Card>
  );
}

/** The old list of requests: now a tab of «Материалы». */
export function Needs() {
  return <Go to="/foreman/materials" add={{ tab: 'needs' }} />;
}

type DraftLine = NeedDraft['lines'][number];

/**
 * «Заказать материал». The form has no state of its own: every change is written to the draft kept on the device,
 * so leaving the screen, a call or a closed tab loses nothing. Rare fields are one tap deeper, under «Подробнее».
 */
export function NeedNew() {
  const d = useData();
  const o = useObject();
  const nav = useNavigate();
  const kept = d.session.needDraft;
  const saved = kept?.objectId === o.id ? kept : undefined;
  const foreign = kept && kept.objectId !== o.id ? kept : undefined;
  const { floor, roomId } = sessionPlace(d);
  const room = byId(d.rooms, roomId);
  const form: NeedDraft = saved ?? { objectId: o.id, lines: [], comment: '', urgent: false, floor, roomId };
  const { lines, comment, urgent, basis } = form;

  const [calc, setCalc] = useState(false);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [normId, setNormId] = useState(d.norms[0]?.id ?? '');
  const [typed, setTyped] = useState<number | null>(null);
  const norm = byId(d.norms, normId);
  const want = addDays(d.today, 2);

  // A saved draft brings back the place it was made for, once; after that the draft follows the place.
  const restored = useRef(false);
  useEffect(() => {
    const first = !restored.current;
    restored.current = true;
    const s = useStore.getState();
    const dr = s.session.needDraft?.objectId === o.id ? s.session.needDraft : undefined;
    const now = sessionPlace(s);
    if (!dr || (dr.floor === now.floor && dr.roomId === now.roomId)) return;
    if (first && (dr.floor || dr.roomId)) act.setPlace(dr.floor ?? byId(s.rooms, dr.roomId)?.floor, dr.roomId);
    else act.saveNeedDraft({ ...dr, floor: now.floor, roomId: now.roomId });
  }, [o.id, d.session.floor, d.session.roomId]);

  const write = (p: Partial<NeedDraft>) => {
    const next: NeedDraft = { ...form, ...p, objectId: o.id, floor, roomId };
    if (!next.lines.length) next.basis = undefined;
    const empty = !next.lines.length && !next.comment && !next.urgent;
    act.saveNeedDraft(empty ? undefined : next);
  };
  const added = (list: DraftLine[], materialId: string, amount: number): DraftLine[] => {
    const i = list.findIndex((l) => l.materialId === materialId);
    if (i >= 0) return list.map((l, j) => (j === i ? { ...l, qty: round1(l.qty + amount) } : l));
    return [...list, { materialId, qty: amount, wantDate: want, comment: '' }];
  };
  const patch = (i: number, p: Partial<DraftLine>) => write({ lines: lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const clear = () => { act.saveNeedDraft(undefined); toast('Заявка очищена'); };

  // the calculator proposes the volume from the measured room when the norm says which surface the work covers
  const geo = room ? confirmedGeo(d, o.id, room.floor) : undefined;
  const fromRoom = room && norm?.base ? roomSurface(room, norm.base) : undefined;
  const volume = typed ?? fromRoom ?? 10;
  const calculate = () => {
    if (!norm) return;
    const next = norm.lines.reduce((ls, l) => added(ls, l.materialId, Math.ceil(volume * l.perUnit)), lines);
    const same = basis && basis.normId === norm.id && (basis.normVersion ?? norm.version) === norm.version;
    write({
      lines: next,
      basis: same ? { ...basis, volume: round1((basis.volume ?? 0) + volume) }
        : basis ?? { normId: norm.id, normVersion: norm.version, volume, geoVersionId: fromRoom !== undefined ? geo?.id : undefined },
    });
    setCalc(false);
    setTyped(null);
    toast('Материалы добавлены. Проверьте количество.');
  };

  // the materials this object uses most come first
  const used = new Map<string, number>();
  for (const n of d.needs) if (n.objectId === o.id) for (const l of n.lines) used.set(l.materialId, (used.get(l.materialId) ?? 0) + 1);
  for (const m of d.siteMoves) if (m.objectId === o.id) used.set(m.materialId, (used.get(m.materialId) ?? 0) + 1);
  const s = q.trim().toLowerCase();
  const matching = d.materials
    .filter((m) => !s || `${m.name} ${m.group} ${m.family ?? ''} ${m.code ?? ''}`.toLowerCase().includes(s))
    .sort((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'ru'));
  const found = s || all ? matching : matching.slice(0, 6);
  const pickMaterial = (m: Material) => { write({ lines: added(lines, m.id, 1) }); setQ(''); toast(`Добавлено: ${m.name}`); };

  const filled = lines.filter((l) => l.qty > 0);
  const send = () => {
    const id = act.createNeed({ objectId: o.id, comment: comment.trim(), urgent, floor, roomId, basis, lines: filled });
    toast('Заявка отправлена менеджеру');
    nav(`/foreman/needs/${id}`, { replace: true });
  };
  const floors = floorsOf(d, o.id);
  const where = placeText(d, floor, roomId);

  return (
    <Page title="Заказать материал" path={[OBJECT, matCrumb('needs'), { label: 'Заказать материал' }]} sub={where ? `Место: ${where}` : undefined}>
      {foreign && <div className="notice">Начатая заявка для объекта «{objectName(d, foreign.objectId)}» будет заменена.</div>}
      {basis && <p className="muted" style={small}>{basisText(d, basis)}</p>}

      {lines.length > 0 && (
        <Card title="В заявке" note={count(lines.length, 'позиция', 'позиции', 'позиций')}
          action={<button type="button" className="link" onClick={clear}>Очистить</button>}>
          <div className="stack">
            {lines.map((l, i) => {
              const m = material(d, l.materialId);
              const use = inUse(m, l.qty);
              return (
                <div key={l.materialId} className="stack" style={{ gap: 8, paddingBottom: i < lines.length - 1 ? 12 : 0, borderBottom: i < lines.length - 1 ? '1px solid var(--rule)' : undefined }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{m.name}</div>
                    <button type="button" className="icon-btn" style={{ margin: '-10px -8px 0 0' }} aria-label={`Убрать: ${m.name}`}
                      onClick={() => write({ lines: lines.filter((_, j) => j !== i) })}><Trash2 size={18} color="var(--muted)" /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Stepper value={l.qty} onChange={(v) => patch(i, { qty: v })} label={`Количество, ${m.unit}`} />
                    <span className="muted num">{m.unit}{use ? ` · ${use}` : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={lines.length ? 'Добавить ещё' : 'Что нужно'} flush>
        <div className="card-body" style={{ paddingBottom: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="input" style={{ paddingLeft: 38 }} type="search" placeholder="Найти материал" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск материала" />
          </div>
        </div>
        {found.length ? (
          <List>
            {found.map((m) => (
              <button key={m.id} type="button" className="row" onClick={() => pickMaterial(m)}>
                <div className="row-main">
                  <div className="row-title">{m.name}</div>
                  <div className="row-sub">{[m.family ?? m.group, m.pack ?? m.unit].filter(Boolean).join(' · ')}</div>
                </div>
                {lines.some((l) => l.materialId === m.id) && <span className="row-meta">в заявке</span>}
                <Plus size={18} className="chev" />
              </button>
            ))}
          </List>
        ) : <Empty>Такого материала нет. Опишите его в комментарии.</Empty>}
        {found.length < matching.length && (
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 12 }}>
            <button type="button" className="link" onClick={() => setAll(true)}>Все материалы ({matching.length})</button>
          </div>
        )}
      </Card>

      <Details>
        <div><Btn onClick={() => setCalc(true)}><Calculator size={18} /> Рассчитать по норме</Btn></div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={urgent} onChange={(e) => write({ urgent: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} />
          <span>Срочно: без этих материалов работы стоят</span>
        </label>
        {floors.length > 0 && (
          <div className="form-2">
            <Field label="Этаж">
              <select className="select" aria-label="Этаж" value={floor ?? ''} onChange={(e) => act.setPlace(e.target.value || undefined, undefined)}>
                <option value="">Весь объект</option>
                {floors.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Помещение">
              <select className="select" aria-label="Помещение" value={roomId ?? ''} disabled={!floor} onChange={(e) => act.setPlace(floor, e.target.value || undefined)}>
                <option value="">{floor ? 'Весь этаж' : 'Не выбрано'}</option>
                {floor && roomsOn(d, o.id, floor).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        {lines.map((l, i) => {
          const m = material(d, l.materialId);
          return (
            <div key={l.materialId} className="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 500 }}>{m.name}</div>
              <div className="form-2">
                <Field label="Нужно к">
                  <input className="input" type="date" aria-label={`Нужно к: ${m.name}`} value={l.wantDate} min={d.today} onChange={(e) => patch(i, { wantDate: e.target.value || want })} />
                </Field>
                <Field label="Комментарий">
                  <input className="input" aria-label={`Комментарий к позиции: ${m.name}`} value={l.comment} onChange={(e) => patch(i, { comment: e.target.value })} />
                </Field>
              </div>
            </div>
          );
        })}
        <Field label="Комментарий для менеджера">
          <VoiceArea label="Комментарий к заявке" value={comment} onChange={(text) => write({ comment: text })} placeholder="Для каких работ, когда начинаете" />
        </Field>
        {saved && !lines.length && <div><button type="button" className="link" onClick={clear}>Очистить</button></div>}
      </Details>

      <div className="sticky-cta">
        <Btn kind="primary" block disabled={!filled.length} onClick={send}>Отправить заявку</Btn>
      </div>

      <Sheet open={calc} title="Рассчитать по норме" onClose={() => { setCalc(false); setTyped(null); }} dirty={typed !== null}
        foot={<><Btn onClick={() => { setCalc(false); setTyped(null); }}>Отмена</Btn><Btn kind="primary" disabled={!norm || volume <= 0} onClick={calculate}>Добавить в заявку</Btn></>}>
        <div className="form">
          <Field label="Работа">
            <select className="select" aria-label="Работа" value={normId} onChange={(e) => { setNormId(e.target.value); setTyped(null); }}>
              {d.norms.map((n) => <option key={n.id} value={n.id}>{n.work}</option>)}
            </select>
          </Field>
          <Field label={`Объём, ${norm?.unit ?? ''}`}
            help={room && norm?.base && fromRoom !== undefined ? `По замерам «${room.name}»: ${SURFACE[norm.base]} ${qty(fromRoom, norm.unit)}` : undefined}>
            <Stepper value={volume} onChange={setTyped} step={1} label={`Объём, ${norm?.unit ?? ''}`} />
          </Field>
          {norm && (
            <dl className="kv">
              {norm.lines.map((l) => {
                const m = material(d, l.materialId);
                return [<dt key={m.id + 'a'}>{m.name}</dt>, <dd key={m.id + 'b'}>{qty(Math.ceil(volume * l.perUnit), m.unit)}</dd>];
              })}
            </dl>
          )}
        </div>
      </Sheet>
    </Page>
  );
}

/* ------------------------------------------------------------ one request */
const PART_ORDER: PartStatus[] = ['received', 'shipped', 'reserved', 'ordered', 'handed', 'clarify'];
const PART_SAY: Record<PartStatus, string> = {
  received: 'получено', shipped: 'едет', reserved: 'отложено на складе', ordered: 'заказано', handed: 'у снабженца', clarify: 'ждёт вашего ответа',
};
/** What is happening to one position, in one sentence: «Едет 30 шт, заказано 40 шт, ждёт вашего ответа 10 шт». */
function lineSentence(l: NeedLine, unit: string): string {
  const parts: string[] = [];
  for (const s of PART_ORDER) {
    const q = l.parts.filter((p) => p.status === s).reduce((sum, p) => sum + (s === 'received' ? p.received ?? p.qty : p.qty), 0);
    if (q > 0) parts.push(`${PART_SAY[s]} ${qty(round1(q), unit)}`);
  }
  const open = lineStats(l).open;
  if (open > 0) parts.push(`ждёт решения менеджера ${qty(round1(open), unit)}`);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One part of a position with the record behind it: a delivery opens from here, an order or a purchase is named. */
function PartLine({ p, unit }: { p: NeedPart; unit: string }) {
  const d = useData();
  const dl = deliveryOfPart(d, p.id);
  const pu = d.purchases.find((x) => x.partId === p.id);
  const order = d.tradeOrders.find((x) => x.partId === p.id);
  const eta = p.eta && p.status !== 'received' && p.status !== 'clarify' ? `, к ${dShort(p.eta)}` : '';
  const record = dl
    ? <Link className="link" style={{ minHeight: 20 }} to={`/foreman/deliveries/${dl.id}`}>поставка № {dl.num}</Link>
    : pu ? `закупка № ${pu.num}${pu.supplier ? `, ${pu.supplier}` : ''}` : order ? `заказ № ${order.num}, ${order.supplier}` : undefined;
  const short = p.status === 'received' && p.received !== undefined && p.received !== p.qty;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, ...small }}>
      <span>{PART_LABEL[p.status]}{eta} · откуда: {ROUTE_SHORT[p.route]}{record ? <> · {record}</> : null}</span>
      <span className="num nowrap">{short ? `${qty(p.received ?? 0, unit)} из ${qty(p.qty, unit)}` : qty(p.qty, unit)}</span>
    </div>
  );
}

export function NeedDetail() {
  const d = useData();
  const { id } = useParams();
  const need = byId(d.needs, id);
  const [answer, setAnswer] = useState('');
  if (!need) {
    return (
      <Page title="Заявка не найдена" path={[OBJECT, matCrumb('needs'), { label: 'Не найдена' }]}>
        <Card><Empty>Возможно, демо-данные были сброшены.</Empty></Card>
      </Page>
    );
  }
  const st = needState(need);
  const label = `Заявка № ${need.num}`;
  const where = placeText(d, need.floor, need.roomId);
  const work = byId(d.works, need.basis?.workId);
  const question = need.question;
  return (
    <Page title={label} path={[OBJECT, matCrumb('needs'), { label: `№ ${need.num}` }]} sub={`${NEED_LABEL[st]}${need.urgent ? ' · срочно' : ''}`}>
      {question && !question.answer && (
        <Card title="Вопрос менеджера">
          <div className="stack">
            <p><span className="muted">{question.by}:</span> {question.text}</p>
            <VoiceArea label="Ответ менеджеру" placeholder="Ваш ответ" value={answer} onChange={setAnswer} />
            <Btn kind="primary" block disabled={!answer.trim()} onClick={() => { act.answerQuestion(need.id, answer.trim()); setAnswer(''); toast('Ответ отправлен менеджеру'); }}>Ответить</Btn>
          </div>
        </Card>
      )}
      {need.lines.map((l) => {
        const m = material(d, l.materialId);
        const ls = lineState(l);
        const use = inUse(m, l.qty);
        return (
          <Card key={l.id} title={m.name} note={qty(l.qty, m.unit)} action={<Pill tone={LINE_TONE[ls]}>{LINE_LABEL[ls]}</Pill>} flush>
            <div className="card-body"><p>{lineSentence(l, m.unit)}</p></div>
            <Details>
              <div className="muted" style={small}>Нужно к {dShort(l.wantDate)}{use ? ` · ${use}` : ''}{l.comment ? ` · ${l.comment}` : ''}</div>
              <RouteBar line={l} legend />
              {l.parts.length > 0 && <div className="stack" style={{ gap: 8 }}>{l.parts.map((p) => <PartLine key={p.id} p={p} unit={m.unit} />)}</div>}
            </Details>
          </Card>
        );
      })}
      <Details>
        <dl className="kv left">
          <dt>Создана</dt><dd>{dShort(need.date)}</dd>
          <dt>Место</dt><dd>{where ?? 'Весь объект'}</dd>
          {need.basis && <><dt>Расчёт</dt><dd>{basisText(d, need.basis)}</dd></>}
          {work && <><dt>Работа</dt><dd><Link className="link" style={{ minHeight: 20 }} to="/foreman/works">{work.name}</Link></dd></>}
          {need.comment && <><dt>Комментарий</dt><dd>{need.comment}</dd></>}
          {question?.answer && <><dt>Вопрос</dt><dd>{question.by}: {question.text}</dd><dt>Ваш ответ</dt><dd>{question.answer}</dd></>}
        </dl>
        <div className="btn-row">
          <IssueButton ctx={{ objectId: need.objectId, place: where ?? '', kind: 'delay', source: { kind: 'need', id: need.id, label } }}>Сообщить о проблеме</IssueButton>
          <ShareButton path={`/foreman/needs/${need.id}`} title={label} />
        </div>
      </Details>
    </Page>
  );
}

/* ------------------------------------------------------------- deliveries */
function DeliveryLines({ dl }: { dl: Delivery }) {
  const d = useData();
  return (
    <dl className="kv">
      {dl.lines.map((l, i) => {
        const m = material(d, l.materialId);
        return [<dt key={i + 'a'}>{m.name}</dt>, <dd key={i + 'b'}>{qty(l.qty, m.unit)}</dd>];
      })}
    </dl>
  );
}

/** «Поставки»: what is coming first, each with «Всё пришло»; received ones are folded. */
export function DeliveriesBody({ objectId }: { objectId: string }) {
  const d = useData();
  const all = d.deliveries.filter((x) => x.objectId === objectId);
  const wait = all.filter((x) => x.status === 'expected').sort((a, b) => a.eta.localeCompare(b.eta));
  const done = all.filter((x) => x.status !== 'expected').sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''));
  const allCame = (dl: Delivery) => {
    act.confirmDelivery(dl.id, dl.lines.map((l) => ({ received: l.qty })), '', 0, { place: 'Склад на объекте' });
    toast(`Поставка № ${dl.num} принята`);
  };
  return (
    <>
      {wait.length ? wait.map((dl) => (
        <Card key={dl.id} title={dl.source} note={`№ ${dl.num} · ${dl.eta < d.today ? 'ждали ' + dShort(dl.eta) : dRel(dl.eta, d.today).toLowerCase()}`}>
          <div className="stack">
            <DeliveryLines dl={dl} />
            <div className="stack" style={{ gap: 8 }}>
              <Btn kind="primary" block onClick={() => allCame(dl)}>Всё пришло</Btn>
              <LinkBtn block to={`/foreman/deliveries/${dl.id}`}>Есть расхождение</LinkBtn>
            </div>
          </div>
        </Card>
      )) : <Card><Empty>Поставок сейчас не ждём.</Empty></Card>}
      {done.length > 0 && (
        <Details label={`Полученные (${done.length})`}>
          <Card flush>
            <List>
              {done.map((dl) => (
                <Row key={dl.id} to={`/foreman/deliveries/${dl.id}`} title={dl.source}
                  sub={`№ ${dl.num} · ${dShort(dl.receivedAt ?? dl.eta)}${dl.place ? ` · ${dl.place}` : ''}`}
                  side={dl.status === 'problem' ? <Status kind="problem">Расхождение</Status> : <Status kind="done">Получено</Status>} />
              ))}
            </List>
          </Card>
        </Details>
      )}
    </>
  );
}

/** The old list of deliveries: now a tab of «Материалы». */
export function Deliveries() {
  return <Go to="/foreman/materials" add={{ tab: 'deliveries' }} />;
}

const deliveryPath = (label: string): Crumb[] => [OBJECT, matCrumb('deliveries'), { label }];

/** The requests a delivery was sent for: the way back from the goods to the request. */
function NeedLinks({ dl }: { dl: Delivery }) {
  const d = useData();
  const needs = [...new Set(dl.lines.map((l) => l.needId))].map((id) => byId(d.needs, id)).filter((n): n is Need => !!n);
  if (!needs.length) return null;
  return (
    <p className="muted" style={small}>
      По {needs.length === 1 ? 'заявке' : 'заявкам'}{' '}
      {needs.map((n, i) => <span key={n.id}>{i > 0 && ', '}<Link className="link" style={{ minHeight: 24 }} to={`/foreman/needs/${n.id}`}>№ {n.num}</Link></span>)}
    </p>
  );
}

/** What the shipping document calls the position, next to what the catalogue calls it: this is what is checked on the spot. */
function SourceLine({ l, m }: { l: DeliveryLine; m: Material }) {
  return (
    <div style={small}>
      {l.sourceName && <div><span className="muted">По документу:</span> {l.sourceName}{l.sourceCode ? `, код ${l.sourceCode}` : ''}</div>}
      {(m.code || m.pack) && <div className="muted">В каталоге: {[m.code, m.pack].filter(Boolean).join(' · ')}</div>}
    </div>
  );
}

function DeliveryMore({ dl }: { dl: Delivery }) {
  const label = `Поставка № ${dl.num}`;
  return (
    <>
      <NeedLinks dl={dl} />
      <div className="btn-row">
        <IssueButton ctx={{ objectId: dl.objectId, place: dl.place ?? '', kind: 'damage', source: { kind: 'delivery', id: dl.id, label } }}>Сообщить о проблеме</IssueButton>
        <ShareButton path={`/foreman/deliveries/${dl.id}`} title={label} />
      </div>
    </>
  );
}

type IssueKey = 'ok' | 'short' | 'wrong' | 'damaged';
interface Extra { key: number; sourceName: string; sourceCode: string; qty: number; unit: string }

/** Receiving with a discrepancy: the foreman counts what is physically in front of him. */
function DeliveryForm({ dl }: { dl: Delivery }) {
  const d = useData();
  const places = sitePlaces(d, dl.objectId);
  const [got, setGot] = useState<{ received: number; issue: IssueKey }[]>(() => dl.lines.map((l) => ({ received: l.qty, issue: 'ok' as IssueKey })));
  const [place, setPlace] = useState(places[0]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState(0);
  const set = (i: number, p: Partial<{ received: number; issue: IssueKey }>) => setGot((g) => g.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const setExtra = (key: number, p: Partial<Extra>) => setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const units = [...new Set(['шт', ...d.materials.map((m) => m.unit)])];

  const ready = (x: Extra) => !!x.sourceName.trim() && x.qty > 0 && !!x.unit.trim();
  const outside = extras.filter(ready);
  const unfinished = extras.some((x) => (x.sourceName.trim() || x.sourceCode.trim()) && !ready(x));
  const lineProblem = got.some((g, i) => g.issue !== 'ok' || g.received !== dl.lines[i].qty);
  const problem = lineProblem || outside.length > 0;

  const confirm = () => {
    act.confirmDelivery(
      dl.id,
      got.map((g, i) => ({ received: g.received, issue: g.issue === 'ok' ? (g.received < dl.lines[i].qty ? 'short' : undefined) : g.issue })),
      comment.trim(), photos,
      { place, extras: outside.map((x) => ({ sourceName: x.sourceName.trim(), sourceCode: x.sourceCode.trim() || undefined, qty: x.qty, unit: x.unit.trim() })) },
    );
    toast(problem ? 'Поставка принята, расхождение передано менеджеру' : 'Поставка принята');
    window.scrollTo(0, 0);
  };
  const notes = (
    <>
      <Photos count={photos} onChange={setPhotos} />
      <VoiceArea label="Комментарий к получению" placeholder={lineProblem ? 'Что не так' : 'Комментарий'} value={comment} onChange={setComment} />
    </>
  );

  return (
    <Page title={`Поставка № ${dl.num}`} path={deliveryPath(`№ ${dl.num}`)} sub={dl.source}>
      {dl.lines.map((l, i) => {
        const m = material(d, l.materialId);
        return (
          <Card key={i} title={m.name} note={`отправлено ${qty(l.qty, m.unit)}`}>
            <div className="stack">
              <SourceLine l={l} m={m} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Stepper value={got[i].received} max={l.qty * 2} onChange={(v) => set(i, { received: v, issue: v < l.qty && got[i].issue === 'ok' ? 'short' : v >= l.qty && got[i].issue === 'short' ? 'ok' : got[i].issue })} label={`Пришло, ${m.unit}`} />
                <span className="muted">{m.unit} пришло</span>
              </div>
              <Chips value={got[i].issue} onChange={(issue) => set(i, { issue })}
                options={[{ value: 'ok', label: 'В порядке' }, { value: 'short', label: 'Недостача' }, { value: 'wrong', label: 'Пересорт' }, { value: 'damaged', label: 'Повреждение' }]} />
            </div>
          </Card>
        );
      })}
      {lineProblem && <Card title="Фото и комментарий"><div className="form">{notes}</div></Card>}

      <Details>
        <Field label="Куда положили">
          <select className="select" aria-label="Куда положили" value={place} onChange={(e) => setPlace(e.target.value)}>
            {places.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        {!lineProblem && notes}
        <div className="stack" style={{ gap: 10 }}>
          <div style={{ fontWeight: 500 }}>Пришло то, чего нет в заказе</div>
          {extras.map((x) => (
            <div key={x.key} className="stack" style={{ gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="input" style={{ flex: 1 }} placeholder="Название как в документе" aria-label="Название как в документе" value={x.sourceName}
                  onChange={(e) => setExtra(x.key, { sourceName: e.target.value })} />
                <button type="button" className="icon-btn" style={{ marginRight: -8 }} aria-label="Убрать позицию вне заказа" onClick={() => setExtras((xs) => xs.filter((y) => y.key !== x.key))}>
                  <Trash2 size={18} color="var(--muted)" />
                </button>
              </div>
              <input className="input" placeholder="Код поставщика, если есть" aria-label="Код поставщика, если есть" value={x.sourceCode}
                onChange={(e) => setExtra(x.key, { sourceCode: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Stepper value={x.qty} onChange={(v) => setExtra(x.key, { qty: v })} label="Количество" />
                <input className="input" style={{ width: 112, flex: 'none' }} list="foreman-extra-units" placeholder="Единица" aria-label="Единица" value={x.unit}
                  onChange={(e) => setExtra(x.key, { unit: e.target.value })} />
              </div>
            </div>
          ))}
          <datalist id="foreman-extra-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
          <div>
            <Btn small onClick={() => setExtras((xs) => [...xs, { key: (xs[xs.length - 1]?.key ?? 0) + 1, sourceName: '', sourceCode: '', qty: 1, unit: 'шт' }])}>
              <Plus size={16} /> Добавить позицию
            </Btn>
          </div>
        </div>
        <DeliveryMore dl={dl} />
      </Details>

      {unfinished && <p className="neg" style={small}>У позиции вне заказа нужны название, количество и единица.</p>}
      <div className="sticky-cta"><Btn kind="primary" block disabled={unfinished} onClick={confirm}>{problem ? 'Принять с расхождением' : 'Принять поставку'}</Btn></div>
    </Page>
  );
}

const SOURCE_STATE: Record<SourcePosition['status'], { label: string; kind: StatusKind }> = {
  temp: { label: 'Не в каталоге', kind: 'off' }, queue: { label: 'Проверяют', kind: 'wait' }, matched: { label: 'В каталоге', kind: 'done' },
};

/** A delivery after receipt: what arrived against what was sent; where it was put is one tap deeper. */
function DeliveryReceived({ dl }: { dl: Delivery }) {
  const d = useData();
  const bad = dl.lines.filter((l) => l.issue || (l.received !== undefined && l.received !== l.qty));
  const extras = dl.extras ?? [];
  const differs = bad.length > 0 || extras.length > 0;
  return (
    <Page title={`Поставка № ${dl.num}`} path={deliveryPath(`№ ${dl.num}`)} sub={`${dl.source} · получена ${dShort(dl.receivedAt ?? dl.eta)}`}>
      <Card title="Что пришло" action={differs ? <Status kind="problem">Расхождение</Status> : <Status kind="done">Получено</Status>} flush>
        <List>
          {dl.lines.map((l, i) => {
            const m = material(d, l.materialId);
            const got = l.received ?? 0;
            const issue = l.issue ? ISSUE_TEXT[l.issue] : got > l.qty ? 'привезли больше' : got < l.qty ? 'недостача' : '';
            const doc = l.sourceName ? `по документу: ${l.sourceName}${l.sourceCode ? `, код ${l.sourceCode}` : ''}` : '';
            return (
              <Row key={i} wrap title={m.name}
                sub={doc || issue ? <>{doc}{doc && issue ? ' · ' : ''}{issue && <span className="neg">{issue}</span>}</> : undefined}
                value={<span className={got !== l.qty ? 'neg' : ''}>{qty(got, m.unit)}</span>} meta={`из ${qty(l.qty, m.unit)}`} />
            );
          })}
        </List>
      </Card>
      {dl.comment && <p className="muted">{dl.comment}</p>}
      {extras.length > 0 && (
        <Card title="Пришло вне заказа" flush>
          <List>
            {extras.map((x) => {
              const src = d.sources.find((s) => s.deliveryId === dl.id && s.name === x.sourceName);
              const st = SOURCE_STATE[src?.status ?? 'temp'];
              const linked = src?.materialId ? material(d, src.materialId) : undefined;
              return (
                <Row key={x.id} wrap title={x.sourceName}
                  sub={[x.sourceCode ? `код ${x.sourceCode}` : '', linked ? `в каталоге: ${linked.name}` : ''].filter(Boolean).join(' · ') || undefined}
                  value={qty(x.qty, x.unit)} meta={<Status kind={st.kind}>{st.label}</Status>} />
              );
            })}
          </List>
        </Card>
      )}
      <Details>
        <dl className="kv left">
          <dt>Куда положили</dt><dd>{dl.place ?? dash}</dd>
          <dt>Фото</dt><dd>{dl.photos ?? 0}</dd>
        </dl>
        <DeliveryMore dl={dl} />
      </Details>
    </Page>
  );
}

export function DeliveryConfirm() {
  const d = useData();
  const { id } = useParams();
  const dl = byId(d.deliveries, id);
  if (!dl) return <Page title="Поставка не найдена" path={deliveryPath('Не найдена')}><Card><Empty>Возможно, демо-данные были сброшены.</Empty></Card></Page>;
  return dl.status === 'expected' ? <DeliveryForm key={dl.id} dl={dl} /> : <DeliveryReceived key={dl.id} dl={dl} />;
}

/* ------------------------------------------------------------- site stock */
const MOVES: { value: SiteMove['kind']; label: string }[] = [
  { value: 'use', label: 'Использовано' }, { value: 'issue', label: 'Выдано бригаде' }, { value: 'move', label: 'Перемещено' },
  { value: 'return', label: 'Возврат' }, { value: 'loss', label: 'Потеря' },
];
interface StockRow extends SiteRow { places: string[] }

/** Positions that came with the deliveries of one object and are not in the catalogue yet. */
const looseSources = (d: Data, objectId: string): SourcePosition[] => {
  const ids = new Set(d.deliveries.filter((x) => x.objectId === objectId).map((x) => x.id));
  return d.sources.filter((s) => (s.status === 'temp' || s.status === 'queue') && !!s.deliveryId && ids.has(s.deliveryId));
};

/** «На объекте»: what is on the site; a tap records a movement (used, issued to a crew, moved, returned, lost). */
export function StockBody({ objectId }: { objectId: string }) {
  const d = useData();
  const places = sitePlaces(d, objectId);
  const all = d.siteMoves.filter((m) => m.objectId === objectId);
  // where each material lies: the place it was received to and every place it was moved to on the site
  const rows: StockRow[] = siteStock(d, objectId).map((r) => {
    const kept = all.filter((m) => m.materialId === r.material.id)
      .flatMap((m) => (m.kind === 'receive' ? [m.place ?? places[0]] : m.kind === 'move' && m.place ? [m.place] : []));
    return { ...r, places: [...new Set(kept)] };
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<SiteMove['kind']>('use');
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState('');
  const [to, setTo] = useState('');
  const row = rows.find((r) => r.material.id === openId);
  const moves = all.filter((m) => m.kind !== 'receive').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const loose = looseSources(d, objectId);
  const where = (r: StockRow) => (r.places.length ? r.places.join(', ') : dash);
  const cols: Col<StockRow>[] = [
    { head: 'Материал', phone: 'title', cell: (r) => r.material.name },
    { head: 'Где лежит', phone: 'sub', cell: where },
    { head: 'Получено', num: true, phone: 'hide', cell: (r) => qty(r.received, r.material.unit) },
    { head: 'Использовано', num: true, phone: 'hide', cell: (r) => qty(r.used, r.material.unit) },
    { head: 'У бригады', num: true, phone: 'hide', cell: (r) => (r.issued ? qty(r.issued, r.material.unit) : dash) },
    { head: 'Осталось', num: true, phone: 'value', cell: (r) => <b style={{ fontWeight: 600 }}>{qty(r.left, r.material.unit)}</b> },
  ];
  const max = row?.left ?? 0;
  const oneOnly = places.length < 2;
  const open = (r: StockRow) => {
    setOpenId(r.material.id); setAmount(Math.min(1, r.left)); setKind('use'); setNote('');
    setTo(places.find((p) => !r.places.includes(p)) ?? places[places.length - 1]);
  };
  const save = () => {
    if (!row) return;
    const moving = kind === 'move';
    act.addSiteMove({ objectId, materialId: row.material.id, kind, qty: amount, note: note.trim(), place: moving ? to : undefined });
    toast(`${MOVE_LABEL[kind]}: ${qty(amount, row.material.unit)}${moving ? `, ${to}` : ''}`);
    setOpenId(null);
  };
  return (
    <>
      {rows.length ? <Card flush><DataTable cols={cols} rows={rows} keyOf={(r) => r.material.id} onRow={open} /></Card>
        : <Card><Empty>На объект ещё ничего не поступало.</Empty></Card>}
      {moves.length > 0 && (
        <Details label="Последние движения">
          <Card flush>
            <List>
              {moves.map((m) => (
                <Row key={m.id} title={`${MOVE_LABEL[m.kind]}: ${material(d, m.materialId).name}`}
                  sub={[dRel(m.date, d.today), m.kind === 'move' && m.place ? `куда: ${m.place}` : '', m.note ?? ''].filter(Boolean).join(' · ')}
                  value={qty(m.qty, material(d, m.materialId).unit)} />
              ))}
            </List>
          </Card>
        </Details>
      )}
      {loose.length > 0 && (
        <Details label={`Пришло вне заказа (${loose.length})`}>
          <Card flush>
            <List>
              {loose.map((s) => {
                const dl = byId(d.deliveries, s.deliveryId);
                return (
                  <Row key={s.id} wrap to={dl ? `/foreman/deliveries/${dl.id}` : undefined} title={s.name}
                    sub={`${dl ? `поставка № ${dl.num} · ${dl.place ?? places[0]}` : s.supplier}${s.code ? ` · код ${s.code}` : ''}`}
                    value={s.qty !== undefined ? qty(s.qty, s.unit) : dash} />
                );
              })}
            </List>
          </Card>
        </Details>
      )}
      <Sheet open={!!row} title={row?.material.name ?? ''} onClose={() => setOpenId(null)} dirty={!!note.trim()}
        foot={<><Btn onClick={() => setOpenId(null)}>Отмена</Btn><Btn kind="primary" disabled={amount <= 0 || amount > max || (kind === 'move' && (oneOnly || !to))} onClick={save}>Записать</Btn></>}>
        {row && (
          <div className="form">
            <p className="muted">
              Осталось {qty(row.left, row.material.unit)}{row.issued ? `, из них у бригады ${qty(row.issued, row.material.unit)}` : ''}
              {row.places.length ? `. Лежит: ${row.places.join(', ')}` : ''}.
            </p>
            <Chips value={kind} onChange={setKind} options={MOVES} />
            <Field label={`Сколько, ${row.material.unit}`}><Stepper value={amount} max={max} onChange={setAmount} /></Field>
            {kind === 'move' && (
              <Field label="Куда" help={oneOnly ? 'На объекте пока одно место хранения.' : undefined}>
                <select className="select" aria-label="Куда переместили" value={to} disabled={oneOnly} onChange={(e) => setTo(e.target.value)}>
                  {places.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            )}
            <Field label="Комментарий"><input className="input" aria-label="Комментарий" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'use' ? 'На какие работы' : ''} /></Field>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** The old stock page: now a tab of «Материалы». */
export function Stock() {
  return <Go to="/foreman/materials" add={{ tab: 'stock' }} />;
}
