// One purchase as three steps: supplier and price → ordered → shipped. One main button for the step the purchase is on;
// terms, the invoice, a replacement material, the original request and the history are one tap deeper.
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { act, useData } from '../../data/store';
import { byId, material, objectName, PURCHASE_LABEL, PURCHASE_TONE, REQUEST_LABEL, REQUEST_TONE } from '../../data/select';
import { AmountInput, Btn, Card, Details, Empty, Field, List, Page, Pill, RouteBar, Row, Sheet, Status, toast } from '../../ui/kit';
import { ShareButton } from '../../shared/extras';
import { addDays, dFull, dShort, money, qty } from '../../lib/format';
import type { Purchase } from '../../data/types';
import { DELIVERY, dash, deliveryOf, rub, wantLate } from './lib';

interface Form { supplier: string; price: string; terms: string; eta: string; invoice: boolean; alt: string }
type Patch = Partial<Pick<Purchase, 'supplier' | 'price' | 'terms' | 'eta' | 'invoice' | 'alt'>>;

function parsePrice(s: string): number {
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}

/** A money request for this purchase. It goes to the owners for approval; the payment itself is a separate step. */
export function PaySheet({ p, supplier, price, onClose }: { p: Purchase; supplier: string; price: number; onClose: () => void }) {
  const d = useData();
  const m = material(d, p.materialId);
  // what the sheet opened with: only a real edit makes it ask before closing
  const [start] = useState(() => ({
    amount: Math.round(price * p.qty), basis: `${supplier || 'Поставщик не выбран'}: ${m.name}, ${qty(p.qty, m.unit)}, закупка № ${p.num}`,
    due: addDays(d.today, 2), entityId: byId(d.objects, p.objectId)?.entityId ?? d.entities[0]?.id ?? '',
  }));
  const [amount, setAmount] = useState(start.amount);
  const [basis, setBasis] = useState(start.basis);
  const [due, setDue] = useState(start.due);
  const [entityId, setEntityId] = useState(start.entityId);
  const ok = amount > 0 && !!basis.trim() && !!due && !!entityId;
  const dirty = amount !== start.amount || basis !== start.basis || due !== start.due || entityId !== start.entityId;
  const submit = () => {
    act.createRequest({ amount, basis: basis.trim(), articleId: 'a-out1', entityId, objectId: p.objectId, due, purchaseId: p.id });
    toast(`Заявка на ${money(amount)} отправлена на согласование`);
    onClose();
  };
  return (
    <Sheet open title="Запрос оплаты" onClose={onClose} dirty={dirty}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={submit}>Отправить на согласование</Btn></>}>
      <div className="form">
        <Field label="Сумма" help={price ? `${rub(price)} × ${qty(p.qty, m.unit)} = ${money(price * p.qty)}` : 'Цена не указана, введите сумму.'}>
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="За что"><textarea className="textarea" value={basis} onChange={(e) => setBasis(e.target.value)} /></Field>
        <div className="form-2">
          <Field label="Оплатить до"><input className="input" type="date" min={d.today} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Кто платит">
            <select className="select" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {d.entities.map((e) => <option key={e.id} value={e.id}>{e.short}</option>)}
            </select>
          </Field>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Объект: {objectName(d, p.objectId)}. Статья: материалы.</p>
      </div>
    </Sheet>
  );
}

/** The three steps of a purchase, top to bottom: done ones are ticked, the current one is dark. */
function Steps({ current, notes }: { current: number; notes: (ReactNode | undefined)[] }) {
  const items = ['Поставщик и цена', 'Заказано', 'Отгружено'];
  return (
    <ol aria-label="Ход закупки" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      {items.map((t, i) => {
        const n = i + 1;
        const done = n < current;
        const now = n === current;
        return (
          <li key={t} aria-current={now ? 'step' : undefined} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span aria-hidden style={{
              width: 24, height: 24, borderRadius: 12, flex: 'none', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600,
              background: done ? 'var(--pill-positive-bg)' : now ? 'var(--primary)' : 'transparent',
              color: done ? 'var(--pill-positive-ink)' : now ? '#fff' : 'var(--muted)',
              border: done || now ? 0 : '1px solid var(--control)',
            }}>{done ? <Check size={14} /> : n}</span>
            <span style={{ minWidth: 0, paddingTop: 2 }}>
              <span style={{ fontWeight: now ? 600 : 500, color: done || now ? 'var(--text)' : 'var(--muted)' }}>{t}</span>
              {notes[i] && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{notes[i]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const PATH = { label: 'Закупки', to: '/supplier' };

function PurchaseView({ p }: { p: Purchase }) {
  const d = useData();
  const m = material(d, p.materialId);
  const need = byId(d.needs, p.needId);
  const line = need?.lines.find((l) => l.id === p.lineId);
  const [f, setF] = useState<Form>({
    supplier: p.supplier ?? '', price: p.price ? String(p.price).replace('.', ',') : '', terms: p.terms ?? '', eta: p.eta ?? '', invoice: !!p.invoice, alt: p.alt ?? '',
  });
  const [pay, setPay] = useState(false);
  const set = (patch: Partial<Form>) => setF((cur) => ({ ...cur, ...patch }));
  const editable = p.status === 'new' || p.status === 'sourcing' || p.status === 'ordered';
  const supplier = f.supplier.trim();
  const terms = f.terms.trim();
  const alt = f.alt.trim();
  const price = parsePrice(f.price);
  const known = [...new Set([...d.purchases.map((x) => x.supplier), ...d.tradeOrders.map((x) => x.supplier)].filter((x): x is string => !!x))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const reqs = d.requests.filter((r) => r.purchaseId === p.id);
  // the delivery appears when the supplier ships; from then on its state is the foreman's to change
  const dl = deliveryOf(d, p);
  const dlLine = dl?.lines.find((l) => l.partId === p.partId);
  const label = `Закупка № ${p.num}`;

  // what differs from the saved purchase: the patch for the store and a plain sentence for the history
  const patch: Patch = {};
  const changes: string[] = [];
  if (supplier !== (p.supplier ?? '')) { patch.supplier = supplier || undefined; changes.push(supplier ? `поставщик ${supplier}` : 'поставщик снят'); }
  if (price !== (p.price ?? 0)) { patch.price = price || undefined; changes.push(price ? `цена ${rub(price)} за ${m.unit}` : 'цена снята'); }
  if (terms !== (p.terms ?? '')) { patch.terms = terms || undefined; changes.push(terms ? `условия: ${terms}` : 'условия сняты'); }
  if (f.eta !== (p.eta ?? '')) { patch.eta = f.eta || undefined; changes.push(f.eta ? `срок поставки ${dShort(f.eta)}` : 'срок поставки снят'); }
  if (f.invoice !== !!p.invoice) { patch.invoice = f.invoice; changes.push(f.invoice ? 'счёт приложен' : 'отметка о счёте снята'); }
  if (alt !== (p.alt ?? '')) { patch.alt = alt || undefined; changes.push(alt ? `предложена замена: ${alt}` : 'замена снята'); }
  const dirty = editable && changes.length > 0;
  const saveIfDirty = () => { if (dirty) act.updatePurchase(p.id, patch, `Обновлено: ${changes.join(', ')}`); };
  const canOrder = !!supplier && price > 0;

  const save = () => { saveIfDirty(); toast('Сохранено'); };
  const take = () => { act.setPurchaseStatus(p.id, 'sourcing'); toast(`Закупка № ${p.num} взята в работу`); };
  const order = () => { saveIfDirty(); act.setPurchaseStatus(p.id, 'ordered'); toast(`Заказано у «${supplier}»`); };
  const shipped = () => { saveIfDirty(); act.setPurchaseStatus(p.id, 'shipped'); toast('Отгрузка отмечена. Получение подтвердит прораб.'); };

  const current = p.status === 'new' || p.status === 'sourcing' ? 1 : p.status === 'ordered' ? 2 : p.status === 'shipped' ? 3 : 4;
  const notes: (ReactNode | undefined)[] = [
    current > 1 && p.supplier ? `${p.supplier}${p.price !== undefined ? `, ${rub(p.price)} за ${m.unit}` : ''}` : undefined,
    current >= 2 ? <>заказано{p.orderDate ? ` ${dShort(p.orderDate)}` : ''}{p.eta && current === 2 ? <>, обещают <span className={p.eta > p.wantDate ? 'neg' : ''}>{dShort(p.eta)}</span></> : ''}</> : undefined,
    current === 3 ? 'ждём, когда прораб примет' : current === 4 ? `прораб принял${dl?.receivedAt ? ` ${dShort(dl.receivedAt)}` : ''}` : undefined,
  ];

  const main: ReactNode =
    current === 1 ? <Btn kind="primary" disabled={!canOrder} onClick={order}>Сохранить и заказать</Btn>
      : current === 2 ? <Btn kind="primary" onClick={shipped}>Поставщик отгрузил</Btn>
        : current === 3 ? <Status kind="wait">Ждём, когда прораб примет</Status>
          : <Status kind="done">Получено на объекте</Status>;

  return (
    <Page title={label} path={[PATH, { label: `№ ${p.num}` }]}>
      <Card title={m.name} action={<Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b className="num" style={{ fontWeight: 600 }}>{qty(p.qty, m.unit)}</b>
          <span>· {objectName(d, p.objectId)} · нужно к <span className={wantLate(d, p) ? 'neg' : ''}>{dShort(p.wantDate)}</span></span>
          {p.priority === 'high' && p.status !== 'received' && <Status kind="problem">Срочно</Status>}
        </div>
      </Card>

      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <Steps current={current} notes={notes} />
          {editable ? (
            <div className="form">
              <Field label="Поставщик">
                <input className="input" list="supplier-known-suppliers" value={f.supplier} onChange={(e) => set({ supplier: e.target.value })} placeholder="Название поставщика" />
                <datalist id="supplier-known-suppliers">{known.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <div className="form-2">
                <Field label={`Цена за ${m.unit}, ₽`} help={`По справочнику ${rub(m.price)}`}>
                  <input className="input num" inputMode="decimal" value={f.price} placeholder="0"
                    onChange={(e) => set({ price: e.target.value.replace(/[^\d.,\s]/g, '') })} />
                </Field>
                <Field label="Срок поставки" help={f.eta && f.eta > p.wantDate ? `Позже нужного срока, ${dShort(p.wantDate)}` : undefined}>
                  <input className="input" type="date" value={f.eta} onChange={(e) => set({ eta: e.target.value })} />
                </Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span className="muted num">Сумма{price ? `: ${rub(price)} × ${qty(p.qty, m.unit)}` : ''}</span>
                <span className="num" style={{ fontSize: 18, fontWeight: 700 }}>{price ? money(price * p.qty) : dash}</span>
              </div>
            </div>
          ) : (
            <dl className="kv left">
              <dt>Поставщик</dt><dd>{p.supplier ?? dash}</dd>
              <dt>Сумма</dt><dd>{p.price !== undefined ? `${money(p.price * p.qty)} (${rub(p.price)} за ${m.unit})` : dash}</dd>
              {dl && dlLine && (
                <>
                  <dt>Поставка</dt><dd>№ {dl.num} <Pill tone={DELIVERY[dl.status].tone}>{DELIVERY[dl.status].label}</Pill></dd>
                  <dt>{dl.status === 'expected' ? 'Ждут на объекте' : 'Получено'}</dt>
                  <dd>
                    {dl.status === 'expected'
                      ? <span className={dl.eta < d.today ? 'neg' : ''}>{dFull(dl.eta)}</span>
                      : <span className={(dlLine.received ?? 0) < dlLine.qty ? 'neg' : ''}>{qty(dlLine.received ?? 0, m.unit)} из {qty(dlLine.qty, m.unit)}</span>}
                  </dd>
                </>
              )}
            </dl>
          )}
          <div className="btn-row" style={{ alignItems: 'center' }}>
            {main}
            {dirty && <Btn onClick={save}>Сохранить</Btn>}
            {p.status === 'new' && !dirty && <Btn onClick={take}>Взять в работу</Btn>}
            <Btn onClick={() => setPay(true)}>Запросить оплату</Btn>
          </div>
          {current === 1 && !canOrder && <p className="muted" style={{ fontSize: 13 }}>Чтобы заказать, укажите поставщика и цену.</p>}
        </div>
      </Card>

      {reqs.length > 0 && (
        <Card title="Оплата" flush>
          <List>
            {reqs.map((r) => (
              <Row key={r.id} to="/supplier?view=pay" title={money(r.amount)} sub={`№ ${r.num} · оплатить до ${dShort(r.due)}`}
                meta={<Pill tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Pill>} />
            ))}
          </List>
        </Card>
      )}

      <Details>
        <div><ShareButton path={`/supplier/purchase/${p.id}`} title={label} /></div>
        {editable ? (
          <div className="form">
            <Field label="Условия">
              <input className="input" value={f.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="Например: оплата по счёту, самовывоз" />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <input type="checkbox" checked={f.invoice} onChange={(e) => set({ invoice: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
              Счёт приложен
            </label>
            <Field label="Замена материала" help="Замену согласуют с прорабом.">
              <input className="input" value={f.alt} onChange={(e) => set({ alt: e.target.value })} placeholder="Если точной позиции нет" />
            </Field>
            {dirty && <div><Btn onClick={save}>Сохранить</Btn></div>}
          </div>
        ) : (
          <dl className="kv left">
            <dt>Условия</dt><dd>{p.terms ?? dash}</dd>
            <dt>Счёт</dt><dd>{p.invoice ? 'Приложен' : 'Не приложен'}</dd>
            <dt>Замена</dt><dd>{p.alt ?? dash}</dd>
            <dt>Заказано</dt><dd>{p.orderDate ? dFull(p.orderDate) : dash}</dd>
            <dt>Срок поставки</dt><dd>{p.eta ? dFull(p.eta) : dash}</dd>
          </dl>
        )}
        <dl className="kv left">
          <dt>Причина</dt><dd>{p.reason}</dd>
          <dt>Нужно к</dt><dd className={wantLate(d, p) ? 'neg' : ''}>{dFull(p.wantDate)}</dd>
          {dl && dlLine && (
            <>
              <dt>В документе отгрузки</dt><dd>{dlLine.sourceName ? `${dlLine.sourceName}${dlLine.sourceCode ? `, код ${dlLine.sourceCode}` : ''}` : dash}</dd>
              <dt>Место хранения</dt><dd>{dl.place ?? dash}</dd>
              <dt>Комментарий прораба</dt><dd>{dl.comment ?? dash}</dd>
            </>
          )}
        </dl>
        {need && line ? (
          <div>
            <div style={{ marginBottom: 8 }}>Заявка № {need.num}: всего {qty(line.qty, m.unit)}, эта часть {qty(p.qty, m.unit)}</div>
            <RouteBar line={line} legend />
          </div>
        ) : <p className="muted">Исходная заявка не найдена.</p>}
        <div className="section-title">История</div>
        {p.history.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {p.history.map((h, i) => <p key={i}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)}
          </div>
        ) : <p className="muted">Событий пока нет.</p>}
      </Details>

      {pay && <PaySheet p={p} supplier={supplier} price={price} onClose={() => setPay(false)} />}
    </Page>
  );
}

export function PurchasePage() {
  const { id } = useParams();
  const d = useData();
  const p = byId(d.purchases, id);
  if (!p) {
    return (
      <Page title="Закупка" path={[PATH, { label: 'Не найдена' }]}>
        <Card><Empty>Такой закупки нет.</Empty></Card>
      </Page>
    );
  }
  return <PurchaseView key={p.id} p={p} />;
}
