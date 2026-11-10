// Foreman, materials: the need for materials, receiving deliveries, what is on the site.
// Built for a phone held in one hand: big steppers, short flows, one main button at the bottom.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Calculator, Plus, Search, Trash2 } from 'lucide-react';
import { act, useData, useStore, useUser, type State } from '../../data/store';
import {
  LINE_LABEL, LINE_TONE, MOVE_LABEL, NEED_LABEL, NEED_TONE, PART_LABEL, PURCHASE_LABEL, ROUTE_SHORT, byId, confirmedGeo, floorsOf, geoVersionLabel,
  lineState, material, needProgress, needState, objectName, roomSurface, roomsOn, round1, sitePlaces, siteStock, type SiteRow, type Tone,
} from '../../data/select';
import {
  Btn, Card, Chips, DataTable, Empty, Field, LinkBtn, List, More, Page, Photos, Pill, RouteBar, Row, Sheet, Stepper, Tabs, toast, useSticky, type Col,
} from '../../ui/kit';
import { IssueButton, PlaceLine, ShareButton, VoiceArea } from '../../shared/extras';
import { addDays, count, dRel, dShort, pct, qty } from '../../lib/format';
import type { BuildObject, Data, Delivery, DeliveryLine, Material, Need, NeedDraft, NeedPart, SiteMove, SourcePosition } from '../../data/types';

export function useObject(): BuildObject {
  const d = useData();
  const u = useUser();
  const list = d.objects.filter((o) => u.objectIds?.includes(o.id));
  return list.find((o) => o.id === d.session.objectId) ?? list[0] ?? d.objects[0];
}

/* ---------------------------------------------------------------- helpers */
const dash = <span className="muted">—</span>;
const small = { fontSize: 13, lineHeight: '18px' } as const;

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

/** What the quantities of a need were calculated from. */
function basisText(d: Data, b: NonNullable<Need['basis']>): string {
  const norm = byId(d.norms, b.normId);
  const geo = byId(d.geoVersions, b.geoVersionId);
  const version = b.normVersion ?? norm?.version;
  return [
    norm ? `Рассчитано по технологической карте «${norm.work}»` : 'Рассчитано по нормам расхода',
    version ? `версия ${version}` : '',
    b.volume !== undefined ? `объём ${qty(b.volume, norm?.unit ?? '').trim()}` : '',
    geo ? `геометрия: ${geoVersionLabel(geo)}` : geoVersionLabel(undefined),
  ].filter(Boolean).join(', ');
}

const DELIVERY_STATE: Record<Delivery['status'], { label: string; tone: Tone }> = {
  expected: { label: 'Ждёт приёмки', tone: 'hue' }, received: { label: 'Получена', tone: 'positive' }, problem: { label: 'С расхождением', tone: 'negative' },
};
const ISSUE_TEXT: Record<NonNullable<DeliveryLine['issue']>, string> = { short: 'недостача', wrong: 'пересорт', damaged: 'повреждение' };
const deliveryOfPart = (d: Data, partId: string): Delivery | undefined => d.deliveries.find((x) => x.lines.some((l) => l.partId === partId));
const SURFACE: Record<'walls' | 'floor' | 'ceiling', string> = { walls: 'стены', floor: 'пол', ceiling: 'потолок' };

/* ------------------------------------------------------------------ needs */
export function NeedsBody({ objectId }: { objectId: string }) {
  const d = useData();
  const needs = d.needs.filter((n) => n.objectId === objectId).sort((a, b) => b.num - a.num);
  const draft = d.session.needDraft?.objectId === objectId ? d.session.needDraft : undefined;
  return (
    <>
      {draft && (
        <p className="muted" style={small}>
          Неотправленный черновик сохранён на этом устройстве: {draft.lines.length ? count(draft.lines.length, 'позиция', 'позиции', 'позиций') : 'позиций пока нет'}.{' '}
          <Link className="link" style={{ minHeight: 24 }} to="/foreman/needs/new">Продолжить</Link>
        </p>
      )}
      {needs.length ? (
        <Card flush>
          <List>
            {needs.map((n) => {
              const st = needState(n);
              const where = placeText(d, n.floor, n.roomId);
              return (
                <Row key={n.id} to={`/foreman/needs/${n.id}`}
                  title={<>Потребность № {n.num} <Pill tone={NEED_TONE[st]}>{NEED_LABEL[st]}</Pill></>}
                  sub={`${dRel(n.date, d.today)}${where ? ` · ${where}` : ''} · ${n.lines.map((l) => material(d, l.materialId).name).slice(0, 2).join(', ')}${n.lines.length > 2 ? ` и ещё ${n.lines.length - 2}` : ''}`}
                  value={pct(needProgress(n))} meta="получено" />
              );
            })}
          </List>
        </Card>
      ) : <Card><Empty>По этому объекту потребностей ещё не было.</Empty></Card>}
    </>
  );
}

export function Needs() {
  const d = useData();
  const o = useObject();
  const all = d.needs.filter((n) => n.objectId === o.id);
  const open = all.filter((n) => needState(n) !== 'done').length;
  return (
    <Page title="Потребность в материалах"
      sub={`${o.name}: ${!all.length ? 'потребностей ещё не было' : open ? count(open, 'потребность в работе', 'потребности в работе', 'потребностей в работе') : 'все потребности обеспечены'}.`}
      actions={<LinkBtn kind="primary" to="/foreman/needs/new"><Plus size={18} /> Создать потребность</LinkBtn>}>
      <NeedsBody objectId={o.id} />
    </Page>
  );
}

type DraftLine = NeedDraft['lines'][number];

/**
 * The form of a new need. It has no state of its own: every change is written to the draft kept on the device,
 * so leaving the screen, a call or a closed tab loses nothing. The place is the one shown in the place line.
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

  const [pick, setPick] = useState(false);
  const [calc, setCalc] = useState(false);
  const [q, setQ] = useState('');
  const [normId, setNormId] = useState(d.norms[0]?.id ?? '');
  const [typed, setTyped] = useState<number | null>(null);
  const norm = byId(d.norms, normId);
  const want = addDays(d.today, 2);

  // A saved draft brings back the place it was made for, once; after that the draft follows the place line.
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
  const clear = () => { act.saveNeedDraft(undefined); toast('Черновик очищен'); };

  // the calculator proposes the volume from the measured room when the card says which surface the work covers
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
    toast('Позиции добавлены. Проверьте количество.');
  };

  const s = q.trim().toLowerCase();
  const found = d.materials.filter((m) => !s || `${m.name} ${m.group} ${m.family ?? ''} ${m.code ?? ''}`.toLowerCase().includes(s));
  const filled = lines.filter((l) => l.qty > 0);
  const send = () => {
    const id = act.createNeed({ objectId: o.id, comment: comment.trim(), urgent, floor, roomId, basis, lines: filled });
    toast('Потребность отправлена менеджеру');
    nav(`/foreman/needs/${id}`, { replace: true });
  };
  const floors = floorsOf(d, o.id);
  const nearest = filled.map((l) => l.wantDate).sort()[0];

  return (
    <Page title="Новая потребность" path={[{ label: 'Потребности', to: '/foreman/needs' }, { label: 'Новая потребность' }]}
      sub={filled.length
        ? `${count(filled.length, 'позиция', 'позиции', 'позиций')}, самый ранний срок ${dShort(nearest)}${urgent ? ', отмечена как срочная' : ''}.`
        : 'Позиций в потребности пока нет.'}>
      <PlaceLine />
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
      {saved ? (
        <p className="muted" style={small}>
          Черновик сохранён на этом устройстве{' '}
          <button type="button" className="link" style={{ minHeight: 24, marginLeft: 6 }} onClick={clear}>Очистить</button>
        </p>
      ) : foreign && (
        <p className="muted" style={small}>
          На этом устройстве лежит черновик для объекта «{objectName(d, foreign.objectId)}». Новая потребность заменит его.
        </p>
      )}
      {basis && (
        <div className="notice plain">
          {basisText(d, basis)}. Система предлагает, вы проверяете: количество можно изменить.
        </div>
      )}

      <Card title="Позиции" note={lines.length ? count(lines.length, 'позиция', 'позиции', 'позиций') : undefined}>
        <div className="stack">
          {lines.length === 0 && <Empty>Материалы добавляются вручную или расчётом по технологической карте для вида работ.</Empty>}
          {lines.map((l, i) => {
            const m = material(d, l.materialId);
            const use = inUse(m, l.qty);
            return (
              <div key={l.materialId} className="stack" style={{ gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{m.name}</div>
                    {(m.code || m.pack) && <div className="muted" style={small}>{[m.code, m.pack].filter(Boolean).join(' · ')}</div>}
                  </div>
                  <button type="button" className="icon-btn" style={{ margin: '-10px -8px 0 0' }} aria-label={`Убрать: ${m.name}`}
                    onClick={() => write({ lines: lines.filter((_, j) => j !== i) })}><Trash2 size={18} color="var(--muted)" /></button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Stepper value={l.qty} onChange={(v) => patch(i, { qty: v })} label={`Количество, ${m.unit}`} />
                  <span className="muted num">{m.unit}{use ? ` · ${use}` : ''}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px' }}>
                    <span className="muted nowrap">нужно к</span>
                    <input className="input" type="date" value={l.wantDate} min={d.today} onChange={(e) => patch(i, { wantDate: e.target.value || want })} />
                  </label>
                </div>
                <input className="input" placeholder="Комментарий к позиции, если нужен" aria-label={`Комментарий к позиции: ${m.name}`} value={l.comment}
                  onChange={(e) => patch(i, { comment: e.target.value })} />
              </div>
            );
          })}
          <div className="btn-row">
            <Btn onClick={() => setPick(true)}><Plus size={18} /> Добавить материал</Btn>
            <Btn onClick={() => setCalc(true)}><Calculator size={18} /> Рассчитать по карте</Btn>
          </div>
        </div>
      </Card>
      <Card title="Для менеджера">
        <div className="form">
          <Field label="Комментарий">
            <VoiceArea label="Комментарий к потребности" value={comment} onChange={(text) => write({ comment: text })} placeholder="Для каких работ, когда начинаете" />
          </Field>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={urgent} onChange={(e) => write({ urgent: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} />
            <span>Срочно: без этих материалов работы стоят</span>
          </label>
        </div>
      </Card>
      <div className="sticky-cta">
        <Btn kind="primary" block disabled={!filled.length} onClick={send}>Отправить потребность</Btn>
      </div>

      <Sheet open={pick} title="Добавить материал" onClose={() => { setPick(false); setQ(''); }}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input" style={{ paddingLeft: 38 }} type="search" placeholder="Название, группа или код" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск материала" />
        </div>
        <div className="list" style={{ margin: '0 -16px' }}>
          {found.map((m) => (
            <Row key={m.id} title={m.name} sub={[m.code, m.family ?? m.group, m.pack ?? m.unit].filter(Boolean).join(' · ')}
              onClick={() => { write({ lines: added(lines, m.id, 1) }); setPick(false); setQ(''); toast(`Добавлено: ${m.name}`); }} />
          ))}
          {!found.length && <Empty>Такого материала в каталоге нет. Опишите его в комментарии к потребности.</Empty>}
        </div>
      </Sheet>

      <Sheet open={calc} title="Расчёт по технологической карте" onClose={() => { setCalc(false); setTyped(null); }} dirty={typed !== null}
        foot={<><Btn onClick={() => { setCalc(false); setTyped(null); }}>Отмена</Btn><Btn kind="primary" disabled={!norm || volume <= 0} onClick={calculate}>Добавить в потребность</Btn></>}>
        <div className="form">
          <Field label="Вид работ">
            <select className="select" aria-label="Вид работ" value={normId} onChange={(e) => { setNormId(e.target.value); setTyped(null); }}>
              {d.norms.map((n) => <option key={n.id} value={n.id}>{n.work}</option>)}
            </select>
          </Field>
          <Field label={`Объём работ, ${norm?.unit ?? ''}`}
            help={room && norm?.base && fromRoom !== undefined
              ? `По замерам помещения «${room.name}»: ${SURFACE[norm.base]}, ${qty(fromRoom, norm.unit)}; ${geo ? `геометрия: ${geoVersionLabel(geo)}` : 'геометрия этажа ещё не подтверждена'}.`
              : undefined}>
            <Stepper value={volume} onChange={setTyped} step={1} label={`Объём работ, ${norm?.unit ?? ''}`} />
          </Field>
          {norm && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Система предлагает, вы проверяете · версия карты {norm.version}</div>
              <dl className="kv">
                {norm.lines.map((l) => {
                  const m = material(d, l.materialId);
                  return [<dt key={m.id + 'a'}>{m.name}</dt>, <dd key={m.id + 'b'}>{qty(Math.ceil(volume * l.perUnit), m.unit)}</dd>];
                })}
              </dl>
            </div>
          )}
        </div>
      </Sheet>
    </Page>
  );
}

/** One part of a position with the record behind it: a delivery opens from here, an order or a purchase is named. */
function PartRow({ p, unit }: { p: NeedPart; unit: string }) {
  const d = useData();
  const dl = deliveryOfPart(d, p.id);
  const pu = d.purchases.find((x) => x.partId === p.id);
  const order = d.tradeOrders.find((x) => x.partId === p.id);
  const record = dl ? `поставка № ${dl.num}, ${dl.source}`
    : pu ? `закупка № ${pu.num}: ${PURCHASE_LABEL[pu.status].toLowerCase()}${pu.supplier ? `, ${pu.supplier}` : ''}`
      : order ? `заказ № ${order.num}, ${order.supplier}` : undefined;
  const eta = p.eta && p.status !== 'received' && p.status !== 'clarify' ? `, к ${dShort(p.eta)}` : '';
  const short = p.status === 'received' && p.received !== undefined && p.received !== p.qty;
  return (
    <Row wrap to={dl ? `/foreman/deliveries/${dl.id}` : undefined}
      title={`${PART_LABEL[p.status]}${eta}`}
      sub={`${ROUTE_SHORT[p.route]}${record ? ` · ${record}` : ''}`}
      value={short ? `${qty(p.received ?? 0, unit)} из ${qty(p.qty, unit)}` : qty(p.qty, unit)}
      meta={dl ? <Pill tone={DELIVERY_STATE[dl.status].tone}>{DELIVERY_STATE[dl.status].label}</Pill> : undefined} />
  );
}

export function NeedDetail() {
  const d = useData();
  const { id } = useParams();
  const need = byId(d.needs, id);
  const [answer, setAnswer] = useState('');
  if (!need) {
    return (
      <Page title="Потребность не найдена" path={[{ label: 'Потребности', to: '/foreman/needs' }, { label: 'Не найдена' }]}>
        <Card><Empty>Возможно, демо-данные были сброшены.</Empty></Card>
      </Page>
    );
  }
  const st = needState(need);
  const label = `Потребность № ${need.num}`;
  const where = placeText(d, need.floor, need.roomId);
  const work = byId(d.works, need.basis?.workId);
  return (
    <Page title={label} path={[{ label: 'Потребности', to: '/foreman/needs' }, { label: `№ ${need.num}` }]}
      sub={`${NEED_LABEL[st]}: получено ${pct(needProgress(need))} · создана ${dRel(need.date, d.today).toLowerCase()}${need.urgent ? ' · срочная' : ''}`}
      actions={(
        <>
          <ShareButton path={`/foreman/needs/${need.id}`} title={label} />
          <IssueButton ctx={{ objectId: need.objectId, place: where ?? '', kind: 'delay', source: { kind: 'need', id: need.id, label } }} />
        </>
      )}>
      {need.question && (
        <Card title={`Вопрос от менеджера: ${need.question.by}`}>
          <div className="stack">
            <p>{need.question.text}</p>
            {need.question.answer ? (
              <p><span className="muted">Ваш ответ:</span> {need.question.answer}</p>
            ) : (
              <>
                <VoiceArea label="Ответ менеджеру" placeholder="Ваш ответ" value={answer} onChange={setAnswer} />
                <Btn kind="primary" disabled={!answer.trim()} onClick={() => { act.answerQuestion(need.id, answer.trim()); setAnswer(''); toast('Ответ отправлен менеджеру'); }}>Ответить</Btn>
              </>
            )}
          </div>
        </Card>
      )}
      <Card>
        <dl className="kv left">
          <dt>Объект</dt><dd>{objectName(d, need.objectId)}</dd>
          <dt>Место</dt><dd>{where ?? 'Весь объект'}</dd>
          {need.basis && <><dt>Основание</dt><dd>{basisText(d, need.basis)}</dd></>}
          {work && <><dt>Работа</dt><dd><More to="/foreman/works">{work.name}</More></dd></>}
          <dt>Комментарий</dt><dd>{need.comment ?? dash}</dd>
        </dl>
      </Card>
      {need.lines.map((l) => {
        const m = material(d, l.materialId);
        const ls = lineState(l);
        const use = inUse(m, l.qty);
        return (
          <Card key={l.id} title={m.name} action={<Pill tone={LINE_TONE[ls]}>{LINE_LABEL[ls]}</Pill>} flush>
            <div className="card-body stack" style={{ gap: 10 }}>
              <div className="muted">Нужно {qty(l.qty, m.unit)}{use ? ` (${use})` : ''} к {dShort(l.wantDate)}{l.comment ? ` · ${l.comment}` : ''}</div>
              <RouteBar line={l} legend />
            </div>
            {l.parts.length > 0 && (
              <>
                <hr className="divider" />
                <List>{l.parts.map((p) => <PartRow key={p.id} p={p} unit={m.unit} />)}</List>
              </>
            )}
          </Card>
        );
      })}
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
        const diff = l.received !== undefined && l.received !== l.qty;
        return [
          <dt key={i + 'a'}>{m.name}</dt>,
          <dd key={i + 'b'} className={diff ? 'neg' : ''}>{l.received !== undefined && diff ? `${qty(l.received, m.unit)} из ${qty(l.qty, m.unit)}` : qty(l.qty, m.unit)}</dd>,
        ];
      })}
    </dl>
  );
}

export function DeliveriesBody({ objectId }: { objectId: string }) {
  const d = useData();
  const [tab, setTab] = useSticky<'wait' | 'done'>('foreman.deliveries.tab', 'wait');
  const all = d.deliveries.filter((x) => x.objectId === objectId);
  const wait = all.filter((x) => x.status === 'expected').sort((a, b) => a.eta.localeCompare(b.eta));
  const done = all.filter((x) => x.status !== 'expected').sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''));
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'wait', label: 'Ожидаются', count: wait.length }, { value: 'done', label: 'Получены', count: done.length }]} />
      {tab === 'wait' && (wait.length ? wait.map((dl, i) => (
        <Card key={dl.id} title={dl.source} note={`№ ${dl.num} · ${dl.eta < d.today ? 'ждали ' + dShort(dl.eta) : dRel(dl.eta, d.today).toLowerCase()}`}>
          <div className="stack">
            <DeliveryLines dl={dl} />
            <LinkBtn kind={i === 0 ? 'primary' : 'secondary'} block to={`/foreman/deliveries/${dl.id}`}>Подтвердить получение</LinkBtn>
          </div>
        </Card>
      )) : <Card><Empty>Поставок на этот объект сейчас не ожидается.</Empty></Card>)}
      {tab === 'done' && (done.length ? done.map((dl) => (
        <Card key={dl.id} title={dl.source} note={`№ ${dl.num} · ${dShort(dl.receivedAt ?? dl.eta)}`}
          action={dl.status === 'problem' ? <Pill tone="negative">Расхождение</Pill> : <Pill tone="positive">Получено</Pill>}>
          <div className="stack" style={{ gap: 8 }}>
            <DeliveryLines dl={dl} />
            {dl.extras?.length ? <p className="muted">Вне заказа: {dl.extras.map((x) => `${x.sourceName}, ${qty(x.qty, x.unit)}`).join('; ')}</p> : null}
            {dl.comment && <p className="muted">{dl.comment}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="muted" style={small}>{dl.place ? `Место хранения: ${dl.place}` : 'Место хранения не указано'}</span>
              <More to={`/foreman/deliveries/${dl.id}`}>Карточка поставки</More>
            </div>
          </div>
        </Card>
      )) : <Card><Empty>Полученных поставок пока нет.</Empty></Card>)}
    </>
  );
}

export function Deliveries() {
  const d = useData();
  const o = useObject();
  const wait = d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected');
  const due = wait.filter((x) => x.eta <= d.today).length;
  return (
    <Page title="Получение материалов"
      sub={`${o.name}: ${due ? `${count(due, 'поставка ждёт', 'поставки ждут', 'поставок ждут')} подтверждения получения`
        : wait.length ? `в пути ${count(wait.length, 'поставка', 'поставки', 'поставок')}` : 'поставок не ожидается'}.`}>
      <DeliveriesBody objectId={o.id} />
    </Page>
  );
}

const DELIVERY_PATH = { label: 'Получение', to: '/foreman/deliveries' };

/** The needs a delivery was sent for: the way back from the goods to the request. */
function NeedLinks({ dl }: { dl: Delivery }) {
  const d = useData();
  const needs = [...new Set(dl.lines.map((l) => l.needId))].map((id) => byId(d.needs, id)).filter((n): n is Need => !!n);
  if (!needs.length) return null;
  return (
    <p className="muted" style={small}>
      По {needs.length === 1 ? 'потребности' : 'потребностям'}{' '}
      {needs.map((n, i) => <span key={n.id}>{i > 0 && ', '}<Link className="link" style={{ minHeight: 24 }} to={`/foreman/needs/${n.id}`}>№ {n.num}</Link></span>)}
    </p>
  );
}

/** What the shipping document calls the position, next to what the catalogue calls it. */
function SourceLine({ l, m }: { l: DeliveryLine; m: Material }) {
  return (
    <div style={small}>
      {l.sourceName && <div><span className="muted">В документе отгрузки:</span> {l.sourceName}{l.sourceCode ? `, код ${l.sourceCode}` : ''}</div>}
      {(m.code || m.pack) && <div className="muted">В каталоге: {[m.code, m.pack].filter(Boolean).join(' · ')}</div>}
    </div>
  );
}

function DeliveryActions({ dl }: { dl: Delivery }) {
  const label = `Поставка № ${dl.num}`;
  return (
    <>
      <ShareButton path={`/foreman/deliveries/${dl.id}`} title={label} />
      <IssueButton ctx={{ objectId: dl.objectId, place: dl.place ?? '', kind: 'damage', source: { kind: 'delivery', id: dl.id, label } }} />
    </>
  );
}

type IssueKey = 'ok' | 'short' | 'wrong' | 'damaged';
interface Extra { key: number; sourceName: string; sourceCode: string; qty: number; unit: string }

/** Receiving: the foreman counts what is physically in front of him and says where it was put. */
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
  const problem = got.some((g, i) => g.issue !== 'ok' || g.received !== dl.lines[i].qty) || outside.length > 0;
  const when = dl.eta < d.today ? `ждали ${dShort(dl.eta)}` : `ждём ${dRel(dl.eta, d.today).toLowerCase()}`;

  const confirm = () => {
    act.confirmDelivery(
      dl.id,
      got.map((g, i) => ({ received: g.received, issue: g.issue === 'ok' ? (g.received < dl.lines[i].qty ? 'short' : undefined) : g.issue })),
      comment.trim(), photos,
      { place, extras: outside.map((x) => ({ sourceName: x.sourceName.trim(), sourceCode: x.sourceCode.trim() || undefined, qty: x.qty, unit: x.unit.trim() })) },
    );
    toast(problem ? 'Получение подтверждено, расхождение передано менеджеру' : 'Получение подтверждено');
    window.scrollTo(0, 0);
  };

  return (
    <Page title={`Поставка № ${dl.num}`} path={[DELIVERY_PATH, { label: `№ ${dl.num}` }]}
      sub={`${dl.source} · отправлено ${count(dl.lines.length, 'позиция', 'позиции', 'позиций')} · ${when} · получение не подтверждено`}
      actions={<DeliveryActions dl={dl} />}>
      <NeedLinks dl={dl} />
      {dl.lines.map((l, i) => {
        const m = material(d, l.materialId);
        return (
          <Card key={i} title={m.name} note={`отправлено ${qty(l.qty, m.unit)}`}>
            <div className="stack">
              <SourceLine l={l} m={m} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Stepper value={got[i].received} max={l.qty * 2} onChange={(v) => set(i, { received: v, issue: v < l.qty && got[i].issue === 'ok' ? 'short' : v >= l.qty && got[i].issue === 'short' ? 'ok' : got[i].issue })} label={`Получено, ${m.unit}`} />
                <span className="muted">{m.unit} получено</span>
              </div>
              <Chips value={got[i].issue} onChange={(issue) => set(i, { issue })}
                options={[{ value: 'ok', label: 'В порядке' }, { value: 'short', label: 'Недостача' }, { value: 'wrong', label: 'Пересорт' }, { value: 'damaged', label: 'Повреждение' }]} />
            </div>
          </Card>
        );
      })}

      <Card title="Пришло то, чего нет в заказе" note={outside.length ? count(outside.length, 'позиция', 'позиции', 'позиций') : undefined}>
        <div className="stack">
          <p className="muted" style={small}>
            Такая позиция регистрируется как временная запись под названием из документа. Она не засчитывается в обеспечение потребности и уходит в очередь нормализации каталога. Код для неё не придумывается.
          </p>
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
          <div className="btn-row">
            <Btn onClick={() => setExtras((xs) => [...xs, { key: (xs[xs.length - 1]?.key ?? 0) + 1, sourceName: '', sourceCode: '', qty: 1, unit: 'шт' }])}>
              <Plus size={18} /> Добавить позицию
            </Btn>
          </div>
          {unfinished && <p className="neg" style={small}>У позиции вне заказа нужны название, количество и единица. Лишнюю строку можно убрать.</p>}
        </div>
      </Card>

      <Card title="Место хранения">
        <Field label="Куда положили на объекте" help="Место попадёт в карточку поставки и в материалы на объекте.">
          <select className="select" aria-label="Место хранения" value={place} onChange={(e) => setPlace(e.target.value)}>
            {places.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </Card>
      <Card title="Фото и комментарий">
        <div className="form">
          <Photos count={photos} onChange={setPhotos} />
          <VoiceArea label="Комментарий к получению" placeholder={problem ? 'Опишите расхождение' : 'Комментарий, если нужен'} value={comment} onChange={setComment} />
        </div>
      </Card>
      <p className="muted" style={small}>Отправка ещё не получение: вы подтверждаете то, что фактически пришло на объект, а не то, что было отправлено.</p>
      <div className="sticky-cta"><Btn kind="primary" block disabled={unfinished} onClick={confirm}>{problem ? 'Подтвердить с расхождением' : 'Подтвердить получение'}</Btn></div>
    </Page>
  );
}

const SOURCE_STATE: Record<SourcePosition['status'], { label: string; tone: Tone }> = {
  temp: { label: 'Временная запись', tone: 'neutral' }, queue: { label: 'Ждёт нормализации', tone: 'warning' }, matched: { label: 'Сопоставлено', tone: 'positive' },
};

/** A delivery after receipt: what arrived, where it was put, what differed from the order. */
function DeliveryReceived({ dl }: { dl: Delivery }) {
  const d = useData();
  const bad = dl.lines.filter((l) => l.issue || (l.received !== undefined && l.received !== l.qty));
  const extras = dl.extras ?? [];
  const differs = bad.length > 0 || extras.length > 0;
  return (
    <Page title={`Поставка № ${dl.num}`} path={[DELIVERY_PATH, { label: `№ ${dl.num}` }]}
      sub={`${dl.source} · получена ${dShort(dl.receivedAt ?? dl.eta)} ${differs ? 'с расхождением' : 'полностью'}`}
      actions={<DeliveryActions dl={dl} />}>
      <Card>
        <dl className="kv left">
          <dt>Состояние</dt><dd><Pill tone={differs ? 'negative' : 'positive'}>{differs ? 'Получена с расхождением' : 'Получена'}</Pill></dd>
          <dt>Источник</dt><dd>{dl.source}</dd>
          <dt>Место хранения</dt><dd>{dl.place ?? dash}</dd>
          <dt>Фото</dt><dd>{dl.photos ?? 0}</dd>
          <dt>Комментарий</dt><dd>{dl.comment ?? dash}</dd>
        </dl>
      </Card>
      <NeedLinks dl={dl} />
      <Card title="Позиции" note={count(dl.lines.length, 'позиция', 'позиции', 'позиций')} flush>
        <List>
          {dl.lines.map((l, i) => {
            const m = material(d, l.materialId);
            const got = l.received ?? 0;
            return (
              <Row key={i} wrap
                title={<><div>{m.name}</div><div style={{ fontWeight: 400, marginTop: 2 }}><SourceLine l={l} m={m} /></div></>}
                value={<span className={got !== l.qty ? 'neg' : ''}>{qty(got, m.unit)}</span>} meta={`из ${qty(l.qty, m.unit)}`} />
            );
          })}
        </List>
      </Card>
      <Card title="Расхождения" flush>
        {bad.length ? (
          <List>
            {bad.map((l, i) => {
              const m = material(d, l.materialId);
              const got = l.received ?? 0;
              const gap = round1(Math.abs(l.qty - got));
              return (
                <Row key={i} wrap title={m.name}
                  sub={`${l.issue ? ISSUE_TEXT[l.issue] : got > l.qty ? 'привезли больше' : 'недостача'} · получено ${qty(got, m.unit)} из ${qty(l.qty, m.unit)}`}
                  value={<span className="neg">{got > l.qty ? '+' : gap ? '−' : ''}{qty(gap, m.unit)}</span>} />
              );
            })}
          </List>
        ) : <Empty>{extras.length ? 'По позициям заказа расхождений нет.' : 'Расхождений нет: получено то, что было отправлено.'}</Empty>}
      </Card>
      {extras.length > 0 && (
        <Card title="Пришло вне заказа" note="в обеспечение потребности не засчитано" flush>
          <List>
            {extras.map((x) => {
              const src = d.sources.find((s) => s.deliveryId === dl.id && s.name === x.sourceName);
              const st = SOURCE_STATE[src?.status ?? 'temp'];
              const linked = src?.materialId ? material(d, src.materialId) : undefined;
              return (
                <Row key={x.id} wrap title={x.sourceName}
                  sub={`${x.sourceCode ? `код ${x.sourceCode}` : 'код в документе не указан'}${linked ? ` · в каталоге: ${linked.name}` : ''}`}
                  value={qty(x.qty, x.unit)} meta={<Pill tone={st.tone}>{st.label}</Pill>} />
            );
            })}
          </List>
        </Card>
      )}
    </Page>
  );
}

export function DeliveryConfirm() {
  const d = useData();
  const { id } = useParams();
  const dl = byId(d.deliveries, id);
  if (!dl) return <Page title="Поставка не найдена" path={[DELIVERY_PATH, { label: 'Не найдена' }]}><Card><Empty>Возможно, демо-данные были сброшены.</Empty></Card></Page>;
  return dl.status === 'expected' ? <DeliveryForm key={dl.id} dl={dl} /> : <DeliveryReceived key={dl.id} dl={dl} />;
}

/* ------------------------------------------------------------- site stock */
const MOVES: { value: SiteMove['kind']; label: string }[] = [
  { value: 'use', label: 'Использовано' }, { value: 'issue', label: 'Выдано бригаде' }, { value: 'move', label: 'Перемещено' },
  { value: 'return', label: 'Возврат' }, { value: 'loss', label: 'Потеря' },
];
interface StockRow extends SiteRow { places: string[]; inside: number }

/** Unmatched positions that came with the deliveries of one object. */
const looseSources = (d: Data, objectId: string): SourcePosition[] => {
  const ids = new Set(d.deliveries.filter((x) => x.objectId === objectId).map((x) => x.id));
  return d.sources.filter((s) => (s.status === 'temp' || s.status === 'queue') && !!s.deliveryId && ids.has(s.deliveryId));
};

export function StockBody({ objectId }: { objectId: string }) {
  const d = useData();
  const places = sitePlaces(d, objectId);
  const all = d.siteMoves.filter((m) => m.objectId === objectId);
  // a move to a place of the same site keeps the material on the object, so it is counted back into what is left
  const rows: StockRow[] = siteStock(d, objectId).map((r) => {
    const mine = all.filter((m) => m.materialId === r.material.id);
    const inside = mine.filter((m) => m.kind === 'move' && m.place).reduce((s, m) => s + m.qty, 0);
    const kept = mine.flatMap((m) => (m.kind === 'receive' ? [m.place ?? places[0]] : m.kind === 'move' && m.place ? [m.place] : []));
    return { ...r, inside, places: [...new Set(kept)] };
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
    { head: 'Место хранения', phone: 'sub', cell: where },
    { head: 'Получено', num: true, phone: 'sub', cell: (r) => `получено ${qty(r.received, r.material.unit)}` },
    { head: 'Использовано', num: true, phone: 'sub', cell: (r) => `использовано ${qty(r.used, r.material.unit)}` },
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
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(r) => r.material.id} onRow={open} empty="На объект ещё ничего не поступало." />
      </Card>
      {loose.length > 0 && (
        <Card title="Не сопоставлено с каталогом" note={count(loose.length, 'позиция', 'позиции', 'позиций')} flush>
          <List>
            {loose.map((s) => {
              const dl = byId(d.deliveries, s.deliveryId);
              return (
                <Row key={s.id} wrap to={dl ? `/foreman/deliveries/${dl.id}` : undefined} title={s.name}
                  sub={`${dl ? `поставка № ${dl.num} · ${dl.place ?? places[0]}` : s.supplier} · ${s.code ? `код ${s.code}` : 'код в документе не указан'}`}
                  value={s.qty !== undefined ? qty(s.qty, s.unit) : dash} />
              );
            })}
          </List>
          <p className="muted" style={{ ...small, padding: '0 16px 14px' }}>
            Позиции записаны под названием из документа и не участвуют в расчётах, пока их не проверят в каталоге.
          </p>
        </Card>
      )}
      <Card title="Последние движения" flush>
        {moves.length ? (
          <List>
            {moves.map((m) => (
              <Row key={m.id} title={`${MOVE_LABEL[m.kind]}: ${material(d, m.materialId).name}`}
                sub={[dRel(m.date, d.today), m.kind === 'move' && m.place ? `куда: ${m.place}` : '', m.note ?? ''].filter(Boolean).join(' · ')}
                value={qty(m.qty, material(d, m.materialId).unit)} />
            ))}
          </List>
        ) : <Empty>Движений по материалам пока нет.</Empty>}
      </Card>
      <Sheet open={!!row} title={row?.material.name ?? ''} onClose={() => setOpenId(null)} dirty={!!note.trim()}
        foot={<><Btn onClick={() => setOpenId(null)}>Отмена</Btn><Btn kind="primary" disabled={amount <= 0 || amount > max || (kind === 'move' && (oneOnly || !to))} onClick={save}>Записать</Btn></>}>
        {row && (
          <div className="form">
            <p className="muted">
              На объекте осталось {qty(row.left, row.material.unit)}{row.issued ? `, из них у бригады ${qty(row.issued, row.material.unit)}` : ''}.
              {row.places.length ? ` Место хранения: ${row.places.join(', ')}.` : ''}
              {row.inside ? ` Между местами перемещено ${qty(row.inside, row.material.unit)}.` : ''}
            </p>
            <Chips value={kind} onChange={setKind} options={MOVES} />
            <Field label={`Количество, ${row.material.unit}`}><Stepper value={amount} max={max} onChange={setAmount} /></Field>
            {kind === 'move' && (
              <Field label="Куда переместили" help={oneOnly ? 'На объекте пока одно место хранения. Этажи появятся после замеров.' : 'Материал остаётся на объекте, меняется только место хранения.'}>
                <select className="select" aria-label="Куда переместили" value={to} disabled={oneOnly} onChange={(e) => setTo(e.target.value)}>
                  {places.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            )}
            <Field label="Комментарий"><input className="input" aria-label="Комментарий" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'use' ? 'На какие работы' : 'Пояснение'} /></Field>
          </div>
        )}
      </Sheet>
    </>
  );
}
export function Stock() {
  const d = useData();
  const o = useObject();
  const kinds = siteStock(d, o.id).length;
  const loose = looseSources(d, o.id).length;
  return (
    <Page title="Материалы на объекте"
      sub={`${o.name}: ${kinds ? `поступало ${count(kinds, 'наименование', 'наименования', 'наименований')}` : 'материалы ещё не поступали'}${
        loose ? `, ${count(loose, 'позиция не сопоставлена', 'позиции не сопоставлены', 'позиций не сопоставлено')} с каталогом` : ''}.`}>
      <StockBody objectId={o.id} />
    </Page>
  );
}
