// One need: the manager's central decision screen. Each position is routed here, whole or in parts.
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { act, useData } from '../../data/store';
import {
  byId, lineState, lineStats, material, needProgress, needState, objectName, stockView, userName,
  LINE_LABEL, LINE_TONE, NEED_LABEL, NEED_TONE, PART_LABEL, ROUTE_LABEL,
} from '../../data/select';
import { Btn, Card, Empty, Field, List, Page, Pill, RouteBar, Row, Sheet, Stepper, toast, useWide } from '../../ui/kit';
import { addDays, count, dFull, dShort, pct, qty } from '../../lib/format';
import type { Need, NeedLine, NeedPart, Route } from '../../data/types';
import { dash, n1 } from './lib';

/** What is known about a part beyond its status: the date it is expected or how much really arrived. */
function partNote(p: NeedPart, unit: string, today: string): ReactNode {
  if (p.status === 'received') {
    const got = p.received ?? p.qty;
    return got < p.qty ? <span className="neg">не довезли {qty(Math.round((p.qty - got) * 10) / 10, unit)}</span> : null;
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

const ROUTE_BTN: { route: Route; label: string }[] = [
  { route: 'stock', label: 'Со склада' },
  { route: 'order', label: 'Заказать' },
  { route: 'supplier', label: 'Снабженцу' },
  { route: 'clarify', label: 'Уточнить' },
];

function LineCard({ need, line, onRoute }: { need: Need; line: NeedLine; onRoute: (route: Route) => void }) {
  const d = useData();
  const wide = useWide();
  const m = material(d, line.materialId);
  const st = lineStats(line);
  const sv = stockView(d, line.materialId);
  const state = lineState(line);
  const late = state !== 'done' && line.wantDate < d.today;
  const back = (p: NeedPart) => {
    act.removePart(need.id, line.id, p.id);
    toast(`${p.status === 'clarify' ? 'Уточнение снято' : 'Резерв снят'}: ${qty(p.qty, m.unit)} снова без маршрута`);
  };
  return (
    <Card title={m.name} action={<Pill tone={LINE_TONE[state]}>{LINE_LABEL[state]}</Pill>} flush>
      <div className="card-body stack" style={{ gap: 10 }}>
        <div>
          Нужно <b className="num" style={{ fontWeight: 600 }}>{qty(line.qty, m.unit)}</b> к <span className={late ? 'neg' : ''}>{dShort(line.wantDate)}</span>
          {line.comment && <span className="muted"> · {line.comment}</span>}
        </div>
        <RouteBar line={line} legend />
        <p className="muted num" style={{ fontSize: 13 }}>
          На складе доступно {qty(sv.available, m.unit)} · в резерве {n1(sv.reserved)} · ожидается {n1(sv.expected)}
        </p>
      </div>
      {line.parts.length > 0 && (
        <>
          <hr className="divider" />
          <List>
            {line.parts.map((p) => {
              const note = partNote(p, m.unit, d.today);
              return (
                <Row key={p.id} wrap title={ROUTE_LABEL[p.route]}
                  sub={<>{PART_LABEL[p.status]}{note && <> · {note}</>}</>}
                  value={qty(p.qty, m.unit)}
                  side={canReturn(p) ? <Btn small onClick={() => back(p)}>Вернуть</Btn> : undefined} />
              );
            })}
          </List>
        </>
      )}
      <hr className="divider" />
      <div className="card-body stack" style={{ gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span className={st.open > 0 ? '' : 'muted'}>Не распределено</span>
          <span className={`num ${st.open > 0 ? '' : 'muted'}`} style={{ fontWeight: st.open > 0 ? 600 : 400 }}>{qty(st.open, m.unit)}</span>
        </div>
        {st.open > 0 && (
          <div style={wide ? { display: 'flex', gap: 8, flexWrap: 'wrap' } : { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {ROUTE_BTN.map((b) => (
              <Btn key={b.route} disabled={b.route === 'stock' && sv.available <= 0} onClick={() => onRoute(b.route)}>{b.label}</Btn>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

const SHEET_TITLE: Record<Route, string> = {
  stock: 'Резерв со склада', order: 'Заказ через торговое направление', supplier: 'Передача снабженцу', clarify: 'Вопрос прорабу',
};
const SHEET_ACTION: Record<Route, string> = { stock: 'Зарезервировать', order: 'Заказать', supplier: 'Передать', clarify: 'Спросить' };

/** How much of the position goes down the chosen route, plus the one or two fields this route needs. */
export function RouteSheet({ need, line, route, onClose }: { need: Need; line: NeedLine; route: Route; onClose: () => void }) {
  const d = useData();
  const m = material(d, line.materialId);
  const open = lineStats(line).open;
  const available = stockView(d, line.materialId).available;
  const max = route === 'stock' ? Math.min(open, available) : open;
  const [amount, setAmount] = useState(max);
  const [supplier, setSupplier] = useState('');
  const [eta, setEta] = useState(addDays(d.today, 5));
  const [text, setText] = useState('');
  const known = [...new Set(d.tradeOrders.map((o) => o.supplier))].sort((a, b) => a.localeCompare(b, 'ru'));
  const ok = amount > 0 && amount <= max && (route !== 'clarify' || !!text.trim()) && (route !== 'order' || (!!eta && eta >= d.today));

  const submit = () => {
    act.routeLine(need.id, line.id, route, amount, {
      supplier: supplier.trim() || undefined, eta: route === 'order' ? eta : undefined, text: text.trim() || undefined,
    });
    const q = qty(amount, m.unit);
    toast({
      stock: `Зарезервировано на складе: ${q}`,
      order: `Заказано: ${q}, ждём на складе ${dShort(eta)}`,
      supplier: `Передано снабженцу: ${q}`,
      clarify: `Вопрос по ${q} отправлен прорабу`,
    }[route]);
    onClose();
  };

  return (
    <Sheet open title={SHEET_TITLE[route]} onClose={onClose}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={submit}>{SHEET_ACTION[route]}</Btn></>}>
      <div className="form">
        <p className="muted">
          {m.name}. Не распределено {qty(open, m.unit)}{route === 'stock' ? `, на складе доступно ${qty(available, m.unit)}` : ''}.
        </p>
        <div className="field">
          <span className="label">Количество, {m.unit}</span>
          <div><Stepper value={amount} onChange={setAmount} max={max} label={`Количество, ${m.unit}`} /></div>
          <span className="help">
            {amount < open
              ? `Остальные ${qty(Math.round((open - amount) * 10) / 10, m.unit)} останутся без маршрута, их можно направить другим путём.`
              : 'Позиция будет распределена полностью.'}
          </span>
        </div>
        {route === 'order' && (
          <>
            <Field label="Поставщик">
              <input className="input" list="manager-known-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Например: Гипс-Трейд" />
              <datalist id="manager-known-suppliers">{known.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Когда ждём на складе" help={eta > line.wantDate ? `Позже, чем нужно на объекте: прораб ждёт к ${dShort(line.wantDate)}.` : undefined}>
              <input className="input" type="date" min={d.today} value={eta} onChange={(e) => setEta(e.target.value)} />
            </Field>
          </>
        )}
        {route === 'supplier' && (
          <Field label="Почему передаём" help="Снабженец увидит причину в карточке закупки.">
            <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: нет в ассортименте склада" />
          </Field>
        )}
        {route === 'clarify' && (
          <Field label="Вопрос прорабу" help={need.question ? 'У потребности уже есть вопрос. Новый заменит его.' : undefined}>
            <textarea className="textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Что нужно уточнить" />
          </Field>
        )}
      </div>
    </Sheet>
  );
}

export function NeedPage() {
  const { id } = useParams();
  const d = useData();
  const [sheet, setSheet] = useState<{ lineId: string; route: Route } | null>(null);
  const need = byId(d.needs, id);
  if (!need) {
    return (
      <Page title="Потребность" back="/manager/needs">
        <Card><Empty>Такой потребности нет. Вернитесь в очередь и выберите другую.</Empty></Card>
      </Page>
    );
  }
  const state = needState(need);
  const author = byId(d.users, need.authorId);
  const foreman = userName(d, byId(d.objects, need.objectId)?.foremanId);
  const parts = need.lines.flatMap((l) => l.parts);
  const openLines = need.lines.filter((l) => lineStats(l).open > 0).length;
  const reserved = parts.filter((p) => p.status === 'reserved').length;
  const inClarify = parts.some((p) => p.status === 'clarify');
  const answered = !!need.question?.answer && inClarify;
  const sheetLine = need.lines.find((l) => l.id === sheet?.lineId);

  let sub: string;
  if (state === 'done') sub = 'Все позиции получены на объекте.';
  else if (answered) sub = 'Прораб ответил на вопрос: количество из уточнения можно вернуть и распределить.';
  else if (openLines) sub = `${count(openLines, 'позиция ждёт', 'позиции ждут', 'позиций ждут')} маршрута${reserved ? ', резерв со склада готов к отправке' : ''}.`;
  else if (reserved) sub = 'Всё распределено, резерв со склада готов к отправке на объект.';
  else if (inClarify) sub = 'Всё распределено, по одной из позиций ждём ответа прораба.';
  else sub = 'Всё распределено, ждём поставки и подтверждения прораба.';

  const ship = () => {
    act.shipFromStock(need.id);
    toast('Отправлено со склада на объект. Получение подтвердит прораб.');
  };

  return (
    <Page back title={`Потребность № ${need.num}`} sub={sub}
      actions={reserved > 0 ? <Btn kind="primary" onClick={ship}>Отправить со склада на объект</Btn> : undefined}>
      <Card>
        <dl className="kv left">
          <dt>Объект</dt><dd>{objectName(d, need.objectId)}</dd>
          <dt>Автор</dt><dd>{author ? `${author.name}, ${author.title.toLowerCase()}` : dash}</dd>
          <dt>Дата</dt><dd>{dFull(need.date)}</dd>
          <dt>Срочность</dt><dd>{need.urgent ? <Pill tone="negative">Срочно</Pill> : 'Обычная'}</dd>
          <dt>Комментарий</dt><dd>{need.comment ?? dash}</dd>
          <dt>Состояние</dt>
          <dd><Pill tone={NEED_TONE[state]}>{NEED_LABEL[state]}</Pill> <span className="muted">· получено {pct(needProgress(need))}</span></dd>
        </dl>
      </Card>

      {need.question && (
        <Card title="Вопрос прорабу" action={<Pill tone={need.question.answer ? 'hue' : 'warning'}>{need.question.answer ? 'Есть ответ' : 'Ответа пока нет'}</Pill>}>
          <div className="stack" style={{ gap: 8 }}>
            <p><span className="muted">{need.question.by}:</span> {need.question.text}</p>
            {need.question.answer
              ? <p><span className="muted">{foreman}:</span> {need.question.answer}</p>
              : <p className="muted">Прораб ещё не ответил.</p>}
            {answered && <p className="muted" style={{ fontSize: 13 }}>Чтобы распределить количество из уточнения, нажмите «Вернуть» у этой части и выберите маршрут.</p>}
          </div>
        </Card>
      )}

      <div className="grid cols-2">
        {need.lines.map((l) => <LineCard key={l.id} need={need} line={l} onRoute={(route) => setSheet({ lineId: l.id, route })} />)}
      </div>

      {sheet && sheetLine && (
        <RouteSheet key={`${sheet.lineId}-${sheet.route}`} need={need} line={sheetLine} route={sheet.route} onClose={() => setSheet(null)} />
      )}
    </Page>
  );
}
