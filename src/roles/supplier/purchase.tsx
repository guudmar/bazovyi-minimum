// One purchase: what to buy and which need it came from, the supplier and terms, payment requests, history.
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { act, useData } from '../../data/store';
import { byId, material, objectName, PURCHASE_LABEL, PURCHASE_TONE, REQUEST_LABEL, REQUEST_TONE } from '../../data/select';
import { AmountInput, Btn, Card, Empty, Field, List, Page, Pill, RouteBar, Row, Sheet, toast } from '../../ui/kit';
import { addDays, dFull, dRel, dShort, daysBetween, money, qty } from '../../lib/format';
import type { Purchase } from '../../data/types';
import { dash, rub, wantLate } from './lib';

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
  const [amount, setAmount] = useState(Math.round(price * p.qty));
  const [basis, setBasis] = useState(`${supplier || 'Поставщик не выбран'}: ${m.name}, ${qty(p.qty, m.unit)}, закупка № ${p.num}`);
  const [due, setDue] = useState(addDays(d.today, 2));
  const [entityId, setEntityId] = useState(byId(d.objects, p.objectId)?.entityId ?? d.entities[0]?.id ?? '');
  const ok = amount > 0 && !!basis.trim() && !!due && !!entityId;
  const submit = () => {
    act.createRequest({ amount, basis: basis.trim(), articleId: 'a-out1', entityId, objectId: p.objectId, due, purchaseId: p.id });
    toast(`Заявка на ${money(amount)} отправлена на согласование`);
    onClose();
  };
  return (
    <Sheet open title="Запрос оплаты" onClose={onClose}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={submit}>Отправить на согласование</Btn></>}>
      <div className="form">
        <Field label="Сумма" help={price ? `${rub(price)} × ${qty(p.qty, m.unit)} = ${money(price * p.qty)}` : 'Цена в закупке не указана, введите сумму вручную.'}>
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Основание"><textarea className="textarea" value={basis} onChange={(e) => setBasis(e.target.value)} /></Field>
        <div className="form-2">
          <Field label="Оплатить до"><input className="input" type="date" min={d.today} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Кто платит">
            <select className="select" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {d.entities.map((e) => <option key={e.id} value={e.id}>{e.short}</option>)}
            </select>
          </Field>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Объект: {objectName(d, p.objectId)}. Статья: материалы. Заявка привязана к закупке, но сама по себе не означает оплату.</p>
      </div>
    </Sheet>
  );
}

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

  const save = () => { saveIfDirty(); toast('Условия закупки сохранены'); };
  const take = () => { saveIfDirty(); act.setPurchaseStatus(p.id, 'sourcing'); toast(`Закупка № ${p.num} взята в работу`); };
  const order = () => { saveIfDirty(); act.setPurchaseStatus(p.id, 'ordered'); toast(`Заказ размещён: ${supplier}`); };
  const shipped = () => { saveIfDirty(); act.setPurchaseStatus(p.id, 'shipped'); toast('Отгрузка отмечена. Получение на объекте подтвердит прораб.'); };

  const days = daysBetween(d.today, p.wantDate);
  const when = days < 0 ? `был нужен ${dShort(p.wantDate)}` : days === 0 ? 'нужен сегодня' : days === 1 ? 'нужен завтра' : `нужен к ${dShort(p.wantDate)}`;
  const sub: Record<Purchase['status'], string> = {
    new: `Закупка ещё не взята в работу, материал ${when}.`,
    sourcing: p.supplier && p.price ? `Поставщик выбран, заказ ещё не размещён; материал ${when}.` : `Идёт подбор поставщика, материал ${when}.`,
    ordered: `Заказ размещён${p.orderDate ? ` ${dShort(p.orderDate)}` : ''}, ${
      p.eta ? `поставщик обещает ${dShort(p.eta)}${p.eta > p.wantDate ? ', это позже нужного срока' : ''}` : 'срок поставки не назван'}.`,
    shipped: `Поставщик отгрузил, на объекте ждут ${p.eta ? dRel(p.eta, d.today).toLowerCase() : 'в ближайшие дни'}.`,
    received: 'Материал получен на объекте, закупка закрыта.',
  };
  // one primary step per status; while a supplier is being chosen it sits under the form, where the answer is typed
  const step: ReactNode =
    p.status === 'new' ? <Btn kind="primary" onClick={take}>Взять в работу</Btn>
      : p.status === 'ordered' ? <Btn kind="primary" onClick={shipped}>Поставщик отгрузил</Btn>
        : p.status === 'shipped' ? <span className="muted">Ждём подтверждения получения от прораба</span>
          : p.status === 'received' ? <span className="muted">Получено на объекте</span>
            : undefined;

  return (
    <Page back title={`Закупка № ${p.num}`} sub={sub[p.status]} actions={step}>
      <Card title={m.name} action={<Pill tone={PURCHASE_TONE[p.status]}>{PURCHASE_LABEL[p.status]}</Pill>}>
        <div className="stack" style={{ gap: 14 }}>
          <dl className="kv left">
            <dt>Количество</dt><dd>{qty(p.qty, m.unit)}</dd>
            <dt>Объект</dt><dd>{objectName(d, p.objectId)}</dd>
            <dt>Нужно к</dt><dd className={wantLate(d, p) ? 'neg' : ''}>{dFull(p.wantDate)}</dd>
            <dt>Причина</dt><dd>{p.reason}</dd>
            <dt>Приоритет</dt><dd>{p.priority === 'high' ? <Pill tone="negative">Высокий</Pill> : 'Обычный'}</dd>
          </dl>
          <hr className="divider" />
          {need && line ? (
            <div>
              <div style={{ marginBottom: 8 }}>
                Исходная потребность № {need.num}: всего {qty(line.qty, m.unit)}, эта часть {qty(p.qty, m.unit)}
              </div>
              <RouteBar line={line} legend />
            </div>
          ) : <p className="muted">Исходная потребность не найдена.</p>}
        </div>
      </Card>

      <Card title="Поставщик и условия">
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
            <Field label="Условия">
              <input className="input" value={f.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="Например: оплата по счёту, самовывоз" />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <input type="checkbox" checked={f.invoice} onChange={(e) => set({ invoice: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
              Счёт приложен
            </label>
            <Field label="Альтернативный материал" help="Замена требует согласования с прорабом.">
              <input className="input" value={f.alt} onChange={(e) => set({ alt: e.target.value })} placeholder="Если точной позиции нет" />
            </Field>
            <hr className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span className="muted num">Сумма{price ? `: ${rub(price)} × ${qty(p.qty, m.unit)}` : ''}</span>
              <span className="num" style={{ fontSize: 18, fontWeight: 700 }}>{price ? money(price * p.qty) : dash}</span>
            </div>
            <div className="btn-row">
              <Btn disabled={!dirty} onClick={save}>Сохранить</Btn>
              {p.status === 'sourcing' && <Btn kind="primary" disabled={!canOrder} onClick={order}>Разместить заказ</Btn>}
            </div>
            {p.status === 'sourcing' && !canOrder && <p className="muted" style={{ fontSize: 13 }}>Чтобы разместить заказ, укажите поставщика и цену.</p>}
          </div>
        ) : (
          <dl className="kv left">
            <dt>Поставщик</dt><dd>{p.supplier ?? dash}</dd>
            <dt>Цена за {m.unit}</dt><dd>{p.price !== undefined ? rub(p.price) : dash}</dd>
            <dt>Сумма</dt><dd>{p.price !== undefined ? money(p.price * p.qty) : dash}</dd>
            <dt>Условия</dt><dd>{p.terms ?? dash}</dd>
            <dt>Заказан</dt><dd>{p.orderDate ? dFull(p.orderDate) : dash}</dd>
            <dt>Срок поставки</dt><dd>{p.eta ? dFull(p.eta) : dash}</dd>
            <dt>Счёт</dt><dd>{p.invoice ? 'Приложен' : 'Не приложен'}</dd>
            <dt>Замена</dt><dd>{p.alt ?? dash}</dd>
          </dl>
        )}
      </Card>

      <Card title="Оплата" action={<Btn onClick={() => setPay(true)}>Запросить оплату</Btn>} flush>
        {reqs.length ? (
          <List>
            {reqs.map((r) => (
              <Row key={r.id} to="/supplier/money" title={r.basis} sub={`№ ${r.num} от ${dShort(r.date)} · оплатить до ${dShort(r.due)}`}
                value={money(r.amount)} money meta={<Pill tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Pill>} />
            ))}
          </List>
        ) : <Empty>По этой закупке оплату ещё не запрашивали.</Empty>}
      </Card>

      <Card title="История">
        {p.history.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {p.history.map((h, i) => <p key={i}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)}
          </div>
        ) : <Empty>Событий по закупке пока нет.</Empty>}
      </Card>

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
      <Page title="Закупка" back="/supplier/queue">
        <Card><Empty>Такой закупки нет. Вернитесь в очередь и выберите другую.</Empty></Card>
      </Page>
    );
  }
  return <PurchaseView key={p.id} p={p} />;
}
