// Foreman, materials: the need for materials, receiving deliveries, what is on the site.
// Built for a phone held in one hand: big steppers, short flows, one main button at the bottom.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calculator, Plus, Search, Trash2 } from 'lucide-react';
import { act, useData, useUser } from '../../data/store';
import {
  LINE_LABEL, LINE_TONE, MOVE_LABEL, NEED_LABEL, NEED_TONE, PART_LABEL, ROUTE_SHORT, byId, lineState, material, needProgress, needState,
  siteStock, type SiteRow,
} from '../../data/select';
import { Btn, Card, Chips, DataTable, Empty, Field, LinkBtn, List, Page, Photos, Pill, RouteBar, Row, Seg, Sheet, Stepper, Tabs, toast, type Col } from '../../ui/kit';
import { addDays, count, dRel, dShort, pct, qty } from '../../lib/format';
import type { BuildObject, Delivery, SiteMove } from '../../data/types';

export function useObject(): BuildObject {
  const d = useData();
  const u = useUser();
  const list = d.objects.filter((o) => u.objectIds?.includes(o.id));
  return list.find((o) => o.id === d.session.objectId) ?? list[0] ?? d.objects[0];
}

/* ------------------------------------------------------------------ needs */
export function NeedsBody({ objectId }: { objectId: string }) {
  const d = useData();
  const needs = d.needs.filter((n) => n.objectId === objectId).sort((a, b) => b.num - a.num);
  if (!needs.length) return <Card><Empty>По этому объекту потребностей ещё не было.</Empty></Card>;
  return (
    <Card flush>
      <List>
        {needs.map((n) => {
          const st = needState(n);
          return (
            <Row key={n.id} to={`/foreman/needs/${n.id}`}
              title={<>Потребность № {n.num} <Pill tone={NEED_TONE[st]}>{NEED_LABEL[st]}</Pill></>}
              sub={`${dRel(n.date, d.today)} · ${n.lines.map((l) => material(d, l.materialId).name).slice(0, 2).join(', ')}${n.lines.length > 2 ? ` и ещё ${n.lines.length - 2}` : ''}`}
              value={pct(needProgress(n))} meta="получено" />
          );
        })}
      </List>
    </Card>
  );
}

export function Needs() {
  const o = useObject();
  return (
    <Page title="Потребность в материалах" sub={o.name} actions={<LinkBtn kind="primary" to="/foreman/needs/new"><Plus size={18} /> Создать потребность</LinkBtn>}>
      <NeedsBody objectId={o.id} />
    </Page>
  );
}

interface Draft { materialId: string; qty: number; wantDate: string; comment: string }

export function NeedNew() {
  const d = useData();
  const o = useObject();
  const nav = useNavigate();
  const [lines, setLines] = useState<Draft[]>([]);
  const [comment, setComment] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [pick, setPick] = useState(false);
  const [calc, setCalc] = useState(false);
  const [q, setQ] = useState('');
  const [normId, setNormId] = useState(d.norms[0]?.id ?? '');
  const [volume, setVolume] = useState(10);
  const norm = byId(d.norms, normId);
  const want = addDays(d.today, 2);
  const add = (materialId: string, amount: number) => setLines((ls) => {
    const i = ls.findIndex((l) => l.materialId === materialId);
    if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + amount } : l));
    return [...ls, { materialId, qty: amount, wantDate: want, comment: '' }];
  });
  const patch = (i: number, p: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const found = d.materials.filter((m) => !q.trim() || `${m.name} ${m.group}`.toLowerCase().includes(q.trim().toLowerCase()));
  const send = () => {
    const id = act.createNeed({ objectId: o.id, comment, urgent, lines: lines.filter((l) => l.qty > 0) });
    toast('Потребность отправлена менеджеру');
    nav(`/foreman/needs/${id}`, { replace: true });
  };
  return (
    <Page title="Новая потребность" sub={o.name} back="/foreman/needs">
      <Card title="Позиции" note={lines.length ? count(lines.length, 'позиция', 'позиции', 'позиций') : undefined}>
        <div className="stack">
          {lines.length === 0 && <Empty>Добавьте материалы вручную или рассчитайте их по нормам для вида работ.</Empty>}
          {lines.map((l, i) => {
            const m = material(d, l.materialId);
            return (
              <div key={l.materialId} className="stack" style={{ gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{m.name}</div>
                  <button className="icon-btn" style={{ margin: '-10px -8px 0 0' }} aria-label={`Убрать: ${m.name}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={18} color="var(--muted)" /></button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Stepper value={l.qty} onChange={(v) => patch(i, { qty: v })} label={`Количество, ${m.unit}`} />
                  <span className="muted">{m.unit}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px' }}>
                    <span className="muted nowrap">нужно к</span>
                    <input className="input" type="date" value={l.wantDate} min={d.today} onChange={(e) => patch(i, { wantDate: e.target.value || want })} />
                  </label>
                </div>
                <input className="input" placeholder="Комментарий к позиции, если нужен" value={l.comment} onChange={(e) => patch(i, { comment: e.target.value })} />
              </div>
            );
          })}
          <div className="btn-row">
            <Btn onClick={() => setPick(true)}><Plus size={18} /> Добавить материал</Btn>
            <Btn onClick={() => setCalc(true)}><Calculator size={18} /> Рассчитать по нормам</Btn>
          </div>
        </div>
      </Card>
      <Card title="Для менеджера">
        <div className="form">
          <Field label="Комментарий"><textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Для каких работ, когда начинаете" /></Field>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span>Срочно: без этих материалов работы стоят</span>
          </label>
        </div>
      </Card>
      <div className="sticky-cta">
        <Btn kind="primary" block disabled={!lines.some((l) => l.qty > 0)} onClick={send}>Отправить потребность</Btn>
      </div>

      <Sheet open={pick} title="Добавить материал" onClose={() => setPick(false)}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="input" style={{ paddingLeft: 38 }} type="search" placeholder="Название или группа" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск материала" />
        </div>
        <div className="list" style={{ margin: '0 -16px' }}>
          {found.map((m) => <Row key={m.id} title={m.name} sub={`${m.group} · ${m.unit}`} onClick={() => { add(m.id, 1); setPick(false); setQ(''); }} />)}
          {!found.length && <Empty>Такого материала в каталоге нет. Опишите его в комментарии к потребности.</Empty>}
        </div>
      </Sheet>

      <Sheet open={calc} title="Рассчитать по нормам" onClose={() => setCalc(false)}
        foot={<><Btn onClick={() => setCalc(false)}>Отмена</Btn><Btn kind="primary" disabled={!norm || volume <= 0}
          onClick={() => { norm?.lines.forEach((l) => add(l.materialId, Math.ceil(volume * l.perUnit))); setCalc(false); toast('Позиции добавлены. Проверьте количество.'); }}>Добавить в потребность</Btn></>}>
        <div className="form">
          <Field label="Вид работ">
            <select className="select" value={normId} onChange={(e) => setNormId(e.target.value)}>
              {d.norms.map((n) => <option key={n.id} value={n.id}>{n.work}</option>)}
            </select>
          </Field>
          <Field label={`Объём работ, ${norm?.unit ?? ''}`}><Stepper value={volume} onChange={setVolume} step={1} /></Field>
          {norm && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Система предлагает, вы проверяете</div>
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

export function NeedDetail() {
  const d = useData();
  const { id } = useParams();
  const need = byId(d.needs, id);
  const [answer, setAnswer] = useState('');
  if (!need) return <Page title="Потребность не найдена" back="/foreman/needs"><Card><Empty>Возможно, демо-данные были сброшены.</Empty></Card></Page>;
  const st = needState(need);
  return (
    <Page title={`Потребность № ${need.num}`} back="/foreman/needs"
      sub={`${NEED_LABEL[st]} · создана ${dRel(need.date, d.today).toLowerCase()} · ${byId(d.objects, need.objectId)?.name}${need.urgent ? ' · срочная' : ''}`}>
      {need.question && (
        <Card title={`Вопрос от менеджера: ${need.question.by}`}>
          <div className="stack">
            <p>{need.question.text}</p>
            {need.question.answer ? (
              <p><span className="muted">Ваш ответ:</span> {need.question.answer}</p>
            ) : (
              <>
                <textarea className="textarea" placeholder="Ваш ответ" value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Ответ менеджеру" />
                <Btn kind="primary" disabled={!answer.trim()} onClick={() => { act.answerQuestion(need.id, answer.trim()); setAnswer(''); toast('Ответ отправлен менеджеру'); }}>Ответить</Btn>
              </>
            )}
          </div>
        </Card>
      )}
      {need.comment && <p className="muted">{need.comment}</p>}
      {need.lines.map((l) => {
        const m = material(d, l.materialId);
        const ls = lineState(l);
        return (
          <Card key={l.id} title={m.name} action={<Pill tone={LINE_TONE[ls]}>{LINE_LABEL[ls]}</Pill>}>
            <div className="stack" style={{ gap: 10 }}>
              <div className="muted">Нужно {qty(l.qty, m.unit)} к {dShort(l.wantDate)}{l.comment ? ` · ${l.comment}` : ''}</div>
              <RouteBar line={l} legend />
              {l.parts.length > 0 && (
                <dl className="kv">
                  {l.parts.map((p) => [
                    <dt key={p.id + 'a'}>{PART_LABEL[p.status]}{p.eta && p.status !== 'received' && p.status !== 'clarify' ? `, к ${dShort(p.eta)}` : ''} <span className="muted">· {ROUTE_SHORT[p.route]}</span></dt>,
                    <dd key={p.id + 'b'}>{p.status === 'received' && p.received !== undefined && p.received !== p.qty ? `${qty(p.received, m.unit)} из ${qty(p.qty, m.unit)}` : qty(p.qty, m.unit)}</dd>,
                  ])}
                </dl>
              )}
            </div>
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
  const [tab, setTab] = useState<'wait' | 'done'>('wait');
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
            {dl.comment && <p className="muted">{dl.comment}</p>}
          </div>
        </Card>
      )) : <Card><Empty>Полученных поставок пока нет.</Empty></Card>)}
    </>
  );
}

export function Deliveries() {
  const o = useObject();
  return <Page title="Получение материалов" sub={o.name}><DeliveriesBody objectId={o.id} /></Page>;
}

type IssueKey = 'ok' | 'short' | 'wrong' | 'damaged';
export function DeliveryConfirm() {
  const d = useData();
  const { id } = useParams();
  const nav = useNavigate();
  const dl = byId(d.deliveries, id);
  const [got, setGot] = useState<{ received: number; issue: IssueKey }[]>(() => dl?.lines.map((l) => ({ received: l.qty, issue: 'ok' as IssueKey })) ?? []);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState(0);
  if (!dl) return <Page title="Поставка не найдена" back="/foreman/deliveries"><Card><Empty>Возможно, демо-данные были сброшены.</Empty></Card></Page>;
  if (dl.status !== 'expected') {
    return (
      <Page title={`Поставка № ${dl.num}`} sub={`${dl.source} · получена ${dShort(dl.receivedAt ?? dl.eta)}`} back="/foreman/deliveries">
        <Card><DeliveryLines dl={dl} /></Card>
      </Page>
    );
  }
  const set = (i: number, p: Partial<{ received: number; issue: IssueKey }>) => setGot((g) => g.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const problem = got.some((g, i) => g.issue !== 'ok' || g.received !== dl.lines[i].qty);
  const confirm = () => {
    act.confirmDelivery(dl.id, got.map((g, i) => ({ received: g.received, issue: g.issue === 'ok' ? (g.received < dl.lines[i].qty ? 'short' : undefined) : g.issue })), comment, photos);
    toast(problem ? 'Получение подтверждено, расхождение передано менеджеру' : 'Получение подтверждено');
    nav('/foreman/deliveries', { replace: true });
  };
  return (
    <Page title={`Поставка № ${dl.num}`} sub={`${dl.source} · ${dl.eta < d.today ? 'ждали ' + dShort(dl.eta) : dRel(dl.eta, d.today).toLowerCase()}`} back="/foreman/deliveries">
      {dl.lines.map((l, i) => {
        const m = material(d, l.materialId);
        return (
          <Card key={i} title={m.name} note={`отправлено ${qty(l.qty, m.unit)}`}>
            <div className="stack">
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
      <Card title="Фото и комментарий">
        <div className="form">
          <Photos count={photos} onChange={setPhotos} />
          <textarea className="textarea" placeholder={problem ? 'Опишите расхождение' : 'Комментарий, если нужен'} value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Комментарий к получению" />
        </div>
      </Card>
      <p className="muted" style={{ fontSize: 13 }}>Вы подтверждаете то, что фактически пришло на объект, а не то, что было отправлено.</p>
      <div className="sticky-cta"><Btn kind="primary" block onClick={confirm}>{problem ? 'Подтвердить с расхождением' : 'Подтвердить получение'}</Btn></div>
    </Page>
  );
}

/* ------------------------------------------------------------- site stock */
const MOVES: { value: SiteMove['kind']; label: string }[] = [
  { value: 'use', label: 'Использовано' }, { value: 'issue', label: 'Выдано бригаде' }, { value: 'move', label: 'Перемещено' },
  { value: 'return', label: 'Возврат' }, { value: 'loss', label: 'Потеря' },
];
export function StockBody({ objectId }: { objectId: string }) {
  const d = useData();
  const rows = siteStock(d, objectId);
  const [row, setRow] = useState<SiteRow | null>(null);
  const [kind, setKind] = useState<SiteMove['kind']>('use');
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState('');
  const moves = d.siteMoves.filter((m) => m.objectId === objectId && m.kind !== 'receive').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const cols: Col<SiteRow>[] = [
    { head: 'Материал', cell: (r) => r.material.name },
    { head: 'Получено', num: true, phone: 'sub', cell: (r) => `получено ${qty(r.received, r.material.unit)}` },
    { head: 'Использовано', num: true, phone: 'sub', cell: (r) => `использовано ${qty(r.used, r.material.unit)}` },
    { head: 'У бригады', num: true, phone: 'hide', cell: (r) => (r.issued ? qty(r.issued, r.material.unit) : <span className="muted">—</span>) },
    { head: 'Осталось', num: true, phone: 'value', cell: (r) => <b style={{ fontWeight: 600 }}>{qty(r.left, r.material.unit)}</b> },
  ];
  const max = row ? (kind === 'issue' ? row.left : row.left) : 0;
  return (
    <>
      <Card flush>
        <DataTable cols={cols} rows={rows} keyOf={(r) => r.material.id} onRow={(r) => { setRow(r); setAmount(Math.min(1, r.left)); setKind('use'); setNote(''); }} empty="На объект ещё ничего не поступало." />
      </Card>
      <Card title="Последние движения" flush>
        {moves.length ? (
          <List>
            {moves.map((m) => <Row key={m.id} title={`${MOVE_LABEL[m.kind]}: ${material(d, m.materialId).name}`} sub={`${dRel(m.date, d.today)}${m.note ? ' · ' + m.note : ''}`} value={qty(m.qty, material(d, m.materialId).unit)} />)}
          </List>
        ) : <Empty>Движений по материалам пока нет.</Empty>}
      </Card>
      <Sheet open={!!row} title={row?.material.name ?? ''} onClose={() => setRow(null)}
        foot={<><Btn onClick={() => setRow(null)}>Отмена</Btn><Btn kind="primary" disabled={amount <= 0 || amount > max}
          onClick={() => { if (row) { act.addSiteMove({ objectId, materialId: row.material.id, kind, qty: amount, note }); toast(`${MOVE_LABEL[kind]}: ${qty(amount, row.material.unit)}`); } setRow(null); }}>Записать</Btn></>}>
        {row && (
          <div className="form">
            <p className="muted">На объекте осталось {qty(row.left, row.material.unit)}{row.issued ? `, из них у бригады ${qty(row.issued, row.material.unit)}` : ''}.</p>
            <Chips value={kind} onChange={setKind} options={MOVES} />
            <Field label={`Количество, ${row.material.unit}`}><Stepper value={amount} max={max} onChange={setAmount} /></Field>
            <Field label="Комментарий"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'use' ? 'На какие работы' : kind === 'move' ? 'Куда' : 'Пояснение'} /></Field>
          </div>
        )}
      </Sheet>
    </>
  );
}
export function Stock() {
  const o = useObject();
  return <Page title="Материалы на объекте" sub={o.name}><StockBody objectId={o.id} /></Page>;
}
