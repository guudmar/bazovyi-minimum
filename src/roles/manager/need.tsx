// One material request: the manager decides where each position comes from. One button per position, «Обеспечить»,
// opens the system's proposal (warehouse first, the rest ordered); the parts and their records are one tap deeper.
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { act, useData } from '../../data/store';
import {
  byId, lineState, lineStats, material, needProgress, needState, objectName, stockView, userName,
  LINE_LABEL, LINE_TONE, NEED_LABEL, NEED_TONE, PART_LABEL, PURCHASE_LABEL, PURCHASE_TONE, ROUTE_LABEL,
} from '../../data/select';
import { Btn, Card, Details, Empty, Field, Page, Pill, RouteBar, Sheet, Status, Stepper, toast } from '../../ui/kit';
import { ShareButton } from '../../shared/extras';
import { addDays, dFull, dShort, pct, qty } from '../../lib/format';
import type { Data, Need, NeedLine, NeedPart, PartStatus } from '../../data/types';
import { DELIVERY_STATE, basisText, dash, deliveryOfPart, n1, orderState, placeText, r1, to } from './lib';

const PATH = { label: 'Заявки', to: '/manager' };

/** What is known about a part beyond its status: the date it is expected or how much really arrived. */
function partNote(p: NeedPart, unit: string, today: string): ReactNode {
  if (p.status === 'received') {
    const got = p.received ?? p.qty;
    return got < p.qty ? <span className="neg">не довезли {qty(r1(p.qty - got), unit)}</span> : null;
  }
  if (p.status === 'shipped') return p.eta ? `на объекте ждут ${dShort(p.eta)}` : null;
  if (p.status === 'ordered') return p.eta ? <span className={p.eta < today ? 'neg' : ''}>срок {dShort(p.eta)}</span> : null;
  if (p.status === 'handed') return p.eta ? `срок поставки ${dShort(p.eta)}` : 'срок ещё не назван';
  return null;
}

/**
 * A part can be taken back while it has not moved: a reserve made from stock or an open question.
 * A reserve that came from an arrived trade order is left alone, because taking it back would not release the warehouse reserve.
 */
const canReturn = (p: NeedPart): boolean => (p.status === 'reserved' && p.route === 'stock') || p.status === 'clarify';

/** What is happening with one position, in plain words. */
function lineSentence(d: Data, need: Need, line: NeedLine, unit: string): string {
  const st = lineStats(line);
  if (lineState(line) === 'done') return `Получено на объекте: ${qty(r1(st.received), unit)}.`;
  const q = (v: number) => qty(r1(v), unit);
  const of = (s: PartStatus) => line.parts.filter((p) => p.status === s);
  const sum = (ps: NeedPart[]) => ps.reduce((s, p) => s + p.qty, 0);
  const eta = (ps: NeedPart[]) => ps.map((p) => p.eta).filter(Boolean).sort()[0];
  const out: string[] = [];
  if (st.received > 0) out.push(`Получено ${q(st.received)} из ${q(line.qty)}.`);
  const shipped = of('shipped');
  if (shipped.length) out.push(`Едет на объект ${q(sum(shipped))}${eta(shipped) ? `, ждут ${dShort(eta(shipped)!)}` : ''}.`);
  const reserved = of('reserved');
  if (reserved.length) out.push(`Отложено на складе ${q(sum(reserved))}, можно отправлять.`);
  const ordered = of('ordered');
  if (ordered.length) {
    const o = d.tradeOrders.find((x) => x.partId === ordered[0].id);
    out.push(`Заказано ${q(sum(ordered))}${o ? ` у «${o.supplier}»` : ''}${eta(ordered) ? `, ждём на складе ${dShort(eta(ordered)!)}` : ''}.`);
  }
  const handed = of('handed');
  if (handed.length) out.push(`У снабженца ${q(sum(handed))}.`);
  const clarify = of('clarify');
  if (clarify.length) out.push(need.question?.answer ? `Прораб ответил, ${q(sum(clarify))} можно обеспечить заново.` : `Ждём ответа прораба по ${q(sum(clarify))}.`);
  if (st.open > 0) out.push(line.parts.length ? `Ещё ${q(st.open)} не обеспечено.` : 'Пока не решено, откуда взять.');
  return out.join(' ');
}

const linkStyle = { minHeight: 28 } as const;

/** The records behind one part, each with its number, its state and a link. */
function PartRecords({ part: p, materialId }: { part: NeedPart; materialId: string }) {
  const d = useData();
  const order = d.tradeOrders.find((o) => o.partId === p.id);
  const pu = d.purchases.find((x) => x.partId === p.id);
  const dl = deliveryOfPart(d, p.id);
  const rows: { key: string; node: ReactNode }[] = [];
  if (p.status === 'reserved') {
    rows.push({ key: 'stock', node: <><Link className="link" style={linkStyle} to={to.stock(materialId)}>Склад</Link> <span className="muted">· {stockView(d, materialId).place}</span></> });
  }
  if (order) {
    const st = orderState(order);
    rows.push({ key: 'order', node: <><Link className="link" style={linkStyle} to={to.order(order.id)}>Заказ № {order.num}</Link> <span className="muted">· {order.supplier}</span> <Pill tone={st.tone}>{st.label}</Pill></> });
  }
  if (pu) {
    rows.push({ key: 'purchase', node: (
      <><Link className="link" style={linkStyle} to={to.purchase(pu.id)}>Закупка № {pu.num}</Link> <span className="muted">· {pu.supplier ?? 'поставщик не выбран'}</span> <Pill tone={PURCHASE_TONE[pu.status]}>{PURCHASE_LABEL[pu.status]}</Pill></>
    ) });
  }
  if (dl) {
    rows.push({ key: 'delivery', node: (
      <><Link className="link" style={linkStyle} to={to.delivery(dl.id)}>Поставка № {dl.num}</Link> <span className="muted">· {dl.source}</span> <Pill tone={DELIVERY_STATE[dl.status].tone}>{DELIVERY_STATE[dl.status].label}</Pill></>
    ) });
  }
  if (!rows.length) return null;
  return <div style={{ fontSize: 13, lineHeight: '18px', display: 'grid', gap: 2, marginTop: 2 }}>{rows.map((r) => <div key={r.key}>{r.node}</div>)}</div>;
}

function LineCard({ need, line, shipFirst, onProvide, onAsk }: { need: Need; line: NeedLine; shipFirst: boolean; onProvide: () => void; onAsk: () => void }) {
  const d = useData();
  const m = material(d, line.materialId);
  const st = lineStats(line);
  const sv = stockView(d, line.materialId);
  const state = lineState(line);
  const late = state !== 'done' && line.wantDate < d.today;
  const back = (p: NeedPart) => {
    act.removePart(need.id, line.id, p.id);
    toast(`${p.status === 'clarify' ? 'Вопрос снят' : 'Резерв снят'}: ${qty(p.qty, m.unit)} снова не обеспечено`);
  };
  return (
    <Card title={m.name} action={<Pill tone={LINE_TONE[state]}>{LINE_LABEL[state]}</Pill>} flush>
      <div className="card-body stack" style={{ gap: 10 }}>
        <div>
          Нужно <b className="num" style={{ fontWeight: 600 }}>{qty(line.qty, m.unit)}</b> к <span className={late ? 'neg' : ''}>{dShort(line.wantDate)}</span>
          {line.comment && <span className="muted"> · {line.comment}</span>}
        </div>
        <p>{lineSentence(d, need, line, m.unit)}</p>
        {st.open > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Btn kind={shipFirst ? 'secondary' : 'primary'} onClick={onProvide}>Обеспечить</Btn>
            <button type="button" className="link" onClick={onAsk}>Спросить прораба</button>
          </div>
        )}
      </div>
      <Details>
        <RouteBar line={line} legend />
        <p className="muted num" style={{ fontSize: 13 }}>
          {m.code ? `${m.code} · ` : ''}На складе доступно {qty(sv.available, m.unit)} · отложено {n1(sv.reserved)} · ожидается {n1(sv.expected)}
        </p>
        <dl className="kv">
          <dt>Обеспечено</dt><dd>{qty(st.allocated, m.unit)}</dd>
          <dt>Получено на объекте</dt><dd>{qty(st.received, m.unit)}</dd>
          <dt>Не обеспечено</dt><dd className={st.open > 0 ? '' : 'muted'}>{qty(st.open, m.unit)}</dd>
        </dl>
        {line.parts.map((p) => {
          const note = partNote(p, m.unit, d.today);
          return (
            <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div><span style={{ fontWeight: 500 }}>{ROUTE_LABEL[p.route]}</span> · <span className="num">{qty(p.qty, m.unit)}</span></div>
                <div className="muted" style={{ fontSize: 13 }}>{PART_LABEL[p.status]}{note && <> · {note}</>}</div>
                <PartRecords part={p} materialId={line.materialId} />
              </div>
              {canReturn(p) && <Btn small onClick={() => back(p)}>Вернуть</Btn>}
            </div>
          );
        })}
      </Details>
    </Card>
  );
}

/**
 * «Обеспечить»: the system's proposal is filled in (as much as the warehouse can give, the rest ordered);
 * the manager can move quantity between the three sources. All of the not yet provided quantity is decided at once.
 */
function ProvideSheet({ need, line, onClose }: { need: Need; line: NeedLine; onClose: () => void }) {
  const d = useData();
  const m = material(d, line.materialId);
  const open = lineStats(line).open;
  const available = stockView(d, line.materialId).available;
  const maxStock = r1(Math.min(open, available));
  const [stock, setStock] = useState(maxStock);
  const [order, setOrder] = useState(r1(open - maxStock));
  const [handed, setHanded] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [eta, setEta] = useState(addDays(d.today, 5));
  const [text, setText] = useState('');
  const known = [...new Set(d.tradeOrders.map((o) => o.supplier))].sort((a, b) => a.localeCompare(b, 'ru'));
  const rest = r1(open - stock - order - handed);
  const ok = rest === 0 && stock + order + handed > 0 && (order === 0 || (!!eta && eta >= d.today));

  const submit = () => {
    if (stock > 0) act.routeLine(need.id, line.id, 'stock', stock);
    if (order > 0) act.routeLine(need.id, line.id, 'order', order, { supplier: supplier.trim() || undefined, eta });
    if (handed > 0) act.routeLine(need.id, line.id, 'supplier', handed, { text: text.trim() || undefined });
    const done = [stock > 0 && `со склада ${qty(stock, m.unit)}`, order > 0 && `заказ ${qty(order, m.unit)}`, handed > 0 && `снабженцу ${qty(handed, m.unit)}`].filter(Boolean);
    toast(`Обеспечено: ${done.join(', ')}`);
    onClose();
  };

  const part = (label: string, help: ReactNode, value: number, set: (v: number) => void, max: number) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {help && <div className="muted" style={{ fontSize: 13 }}>{help}</div>}
      </div>
      <Stepper value={value} onChange={set} max={max} label={`${label}, ${m.unit}`} />
    </div>
  );

  return (
    <Sheet open title={m.name} onClose={onClose} dirty={!!supplier.trim() || !!text.trim()}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={submit}>Обеспечить</Btn></>}>
      <div className="form">
        <p>Нужно обеспечить <b className="num" style={{ fontWeight: 600 }}>{qty(open, m.unit)}</b> к {dShort(line.wantDate)}.</p>
        {part('Со склада', `доступно ${qty(available, m.unit)}`, stock, setStock, maxStock)}
        {part('Заказать', undefined, order, setOrder, open)}
        {part('Через снабженца', undefined, handed, setHanded, open)}
        <p className={rest === 0 ? 'muted' : rest > 0 ? '' : 'neg'} style={{ fontSize: 13 }}>
          {rest === 0 ? 'Распределено всё.' : rest > 0 ? `Осталось распределить ${qty(rest, m.unit)}.` : `Больше, чем нужно, на ${qty(-rest, m.unit)}.`}
        </p>
        {order > 0 && (
          <>
            <Field label="Поставщик">
              <input className="input" list="manager-known-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Например: Гипс-Трейд" />
              <datalist id="manager-known-suppliers">{known.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Ждём на складе" help={eta > line.wantDate ? `Позже, чем нужно на объекте (${dShort(line.wantDate)}).` : undefined}>
              <input className="input" type="date" min={d.today} value={eta} onChange={(e) => setEta(e.target.value)} />
            </Field>
          </>
        )}
        {handed > 0 && (
          <Details label="Комментарий снабженцу">
            <textarea className="textarea" aria-label="Комментарий снабженцу" value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: нет в ассортименте склада" />
          </Details>
        )}
      </div>
    </Sheet>
  );
}

/** A question to the foreman about a part of the position; that part waits for the answer. */
function AskSheet({ need, line, onClose }: { need: Need; line: NeedLine; onClose: () => void }) {
  const d = useData();
  const m = material(d, line.materialId);
  const open = lineStats(line).open;
  const [amount, setAmount] = useState(open);
  const [text, setText] = useState('');
  const ok = amount > 0 && amount <= open && !!text.trim();
  const submit = () => {
    act.routeLine(need.id, line.id, 'clarify', amount, { text: text.trim() });
    toast('Вопрос отправлен прорабу');
    onClose();
  };
  return (
    <Sheet open title="Спросить прораба" onClose={onClose} dirty={!!text.trim()}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={submit}>Спросить</Btn></>}>
      <div className="form">
        <Field label="Вопрос" help={need.question ? 'Новый вопрос заменит прежний.' : undefined}>
          <textarea className="textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Что нужно уточнить" />
        </Field>
        <Field label={`Сколько ждёт ответа, ${m.unit}`}>
          <div><Stepper value={amount} onChange={setAmount} max={open} label={`Сколько ждёт ответа, ${m.unit}`} /></div>
        </Field>
      </div>
    </Sheet>
  );
}

export function NeedPage() {
  const { id } = useParams();
  const d = useData();
  const [sheet, setSheet] = useState<{ lineId: string; kind: 'provide' | 'ask' } | null>(null);
  const need = byId(d.needs, id);
  if (!need) {
    return (
      <Page title="Заявка" path={[PATH, { label: 'Не найдена' }]}>
        <Card><Empty>Такой заявки нет.</Empty></Card>
      </Page>
    );
  }
  const state = needState(need);
  const author = byId(d.users, need.authorId);
  const foreman = userName(d, byId(d.objects, need.objectId)?.foremanId);
  const parts = need.lines.flatMap((l) => l.parts);
  const reserved = parts.some((p) => p.status === 'reserved');
  const clarifyParts = need.lines.flatMap((l) => l.parts.filter((p) => p.status === 'clarify').map((p) => ({ line: l, p })));
  const answered = !!need.question?.answer && clarifyParts.length > 0;
  const sheetLine = need.lines.find((l) => l.id === sheet?.lineId);
  const label = `Заявка № ${need.num}`;
  const place = placeText(d, need.floor, need.roomId);

  const ship = () => {
    act.shipFromStock(need.id);
    toast('Отправлено на объект. Получение подтвердит прораб.');
  };
  const reopen = () => {
    for (const { line, p } of clarifyParts) act.removePart(need.id, line.id, p.id);
    toast('Можно обеспечить заново');
  };

  return (
    <Page title={label} path={[PATH, { label: `№ ${need.num}` }]}
      actions={reserved ? <Btn kind="primary" onClick={ship}>Отправить на объект</Btn> : undefined}>
      <Card>
        <div className="stack" style={{ gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontWeight: 600 }}>{objectName(d, need.objectId)}</b>
            {place && <span className="muted">{place}</span>}
            {need.urgent && state !== 'done' && <Status kind="problem">Срочно</Status>}
            <Pill tone={NEED_TONE[state]}>{NEED_LABEL[state]}</Pill>
          </div>
          {need.comment && <p>{need.comment}</p>}
          <Details>
            <div><ShareButton path={`/manager/needs/${need.id}`} title={label} /></div>
            <dl className="kv left">
              <dt>Автор</dt><dd>{author ? `${author.name}, ${author.title.toLowerCase()}` : dash}</dd>
              <dt>Дата</dt><dd>{dFull(need.date)}</dd>
              <dt>Количество</dt><dd>{need.basis ? basisText(d, need.basis) : 'Указал прораб'}</dd>
              <dt>Получено</dt><dd>{pct(needProgress(need))}</dd>
            </dl>
          </Details>
        </div>
      </Card>

      {need.question && (
        <Card title="Вопрос прорабу" action={need.question.answer ? <Status kind="work">Есть ответ</Status> : <Status kind="wait">Ждём ответа</Status>}>
          <div className="stack" style={{ gap: 8 }}>
            <p><span className="muted">{need.question.by}:</span> {need.question.text}</p>
            {need.question.answer && <p><span className="muted">{foreman}:</span> {need.question.answer}</p>}
            {answered && <div><Btn onClick={reopen}>Обеспечить заново</Btn></div>}
          </div>
        </Card>
      )}

      <div className="grid cols-2">
        {need.lines.map((l) => (
          <LineCard key={l.id} need={need} line={l} shipFirst={reserved}
            onProvide={() => setSheet({ lineId: l.id, kind: 'provide' })} onAsk={() => setSheet({ lineId: l.id, kind: 'ask' })} />
        ))}
      </div>

      {sheet && sheetLine && sheet.kind === 'provide' && <ProvideSheet key={sheet.lineId} need={need} line={sheetLine} onClose={() => setSheet(null)} />}
      {sheet && sheetLine && sheet.kind === 'ask' && <AskSheet key={sheet.lineId} need={need} line={sheetLine} onClose={() => setSheet(null)} />}
    </Page>
  );
}
