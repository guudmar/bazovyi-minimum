// «Центр заявок»: the money requests the economist pays, and the needs in materials she watches without routing them.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { act, useData, useUser } from '../../data/store';
import { NEED_LABEL, NEED_TONE, byId, needProgress, needState, objectName, registerBalance, userName } from '../../data/select';
import { AmountInput, Btn, Card, Chips, DataTable, Empty, Field, LinkBtn, Money, Page, Pill, Sheet, Tabs, Two, toast, useWide, type Col } from '../../ui/kit';
import { NoteSheet, RequestCard, dueLabel } from '../../shared/money';
import { addDays, count, dFull, dShort, money, pct } from '../../lib/format';
import type { MoneyRequest, Need, RequestStatus } from '../../data/types';
import { NeedLineBlock } from './rest-bits';

type Filter = 'all' | 'topay' | 'pending' | 'clarify' | 'paid' | 'rejected';
/** «Согласована» and «Согласована с замечаниями» are one queue for the economist: both wait for payment. */
const FILTERS: { value: Filter; label: string; has: (s: RequestStatus) => boolean }[] = [
  { value: 'all', label: 'Все', has: () => true },
  { value: 'topay', label: 'К оплате', has: (s) => s === 'approved' || s === 'noted' },
  { value: 'pending', label: 'На согласовании', has: (s) => s === 'pending' },
  { value: 'clarify', label: 'Нужно уточнение', has: (s) => s === 'clarify' },
  { value: 'paid', label: 'Оплачены', has: (s) => s === 'paid' },
  { value: 'rejected', label: 'Отклонены', has: (s) => s === 'rejected' },
];
const canPay = (r: MoneyRequest): boolean => r.status === 'approved' || r.status === 'noted';
/** What needs the economist comes first: to pay, then open questions, then the rest. */
const rank = (r: MoneyRequest): number => (canPay(r) ? 0 : r.status === 'clarify' ? 1 : r.status === 'pending' ? 2 : r.status === 'paid' ? 3 : 4);

export function Requests() {
  const d = useData();
  const me = useUser();
  const wide = useWide();
  const [sp, setSp] = useSearchParams();
  const tab: 'money' | 'tmc' = sp.get('tab') === 'tmc' ? 'tmc' : 'money';
  const [filter, setFilter] = useState<Filter>('all');
  const [payId, setPayId] = useState<string | null>(null);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [needId, setNeedId] = useState<string | null>(null);

  const toPay = d.requests.filter(canPay);
  const has = FILTERS.find((f) => f.value === filter)?.has ?? (() => true);
  const shown = d.requests
    .filter((r) => has(r.status))
    .sort((a, b) => rank(a) - rank(b) || (rank(a) < 3 ? a.due.localeCompare(b.due) : b.date.localeCompare(a.date)));
  const paying = byId(d.requests, payId);
  const answering = byId(d.requests, answerId);
  const needs = [...d.needs].sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num);
  const need = byId(d.needs, needId);
  const fresh = d.needs.filter((n) => needState(n) === 'new').length;

  const needCols: Col<Need>[] = [
    { head: '№ и объект', phone: 'title', cell: (n) => (wide ? <Two a={`№ ${n.num}${n.urgent ? ' · срочная' : ''}`} b={objectName(d, n.objectId)} /> : `№ ${n.num} · ${objectName(d, n.objectId)}`) },
    { head: 'Инициатор', phone: 'sub', cell: (n) => userName(d, n.authorId) },
    { head: 'Дата', phone: 'sub', cell: (n) => dShort(n.date) },
    { head: 'Позиции', num: true, phone: 'sub', cell: (n) => (wide ? n.lines.length : `${count(n.lines.length, 'позиция', 'позиции', 'позиций')}${n.urgent ? ' · срочная' : ''}`) },
    { head: 'Состояние', phone: 'meta', cell: (n) => { const s = needState(n); return <Pill tone={NEED_TONE[s]}>{NEED_LABEL[s]}</Pill>; } },
    { head: 'Обеспечено', num: true, phone: 'value', cell: (n) => pct(needProgress(n)) },
  ];

  return (
    <Page title="Центр заявок"
      sub={toPay.length
        ? `${count(toPay.length, 'согласованная заявка ждёт', 'согласованные заявки ждут', 'согласованных заявок ждут')} оплаты на ${money(toPay.reduce((s, r) => s + r.amount, 0))}.`
        : 'Согласованных заявок, которые ждут оплаты, нет.'}
      actions={<Btn onClick={() => setForm(true)}>Новая заявка</Btn>}>
      <Tabs value={tab} onChange={(t) => setSp(t === 'tmc' ? { tab: 'tmc' } : {}, { replace: true })}
        tabs={[{ value: 'money', label: 'Деньги', count: d.requests.length }, { value: 'tmc', label: 'ТМЦ', count: d.needs.length }]} />

      {tab === 'money' && (
        <>
          <Chips value={filter} onChange={setFilter}
            options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: d.requests.filter((r) => f.has(r.status)).length }))} />
          {shown.length === 0 && (
            <Card title="Заявки на деньги">
              <Empty>{filter === 'topay' ? 'Согласованных заявок, которые ждут оплаты, нет.' : filter === 'all' ? 'Заявок на деньги пока нет.' : 'Заявок в этом состоянии нет.'}</Empty>
            </Card>
          )}
          <div className="grid cols-2">
            {shown.map((r) => (
              <RequestCard key={r.id} r={r}>
                {canPay(r) && <Btn kind="primary" block style={{ marginTop: 4 }} onClick={() => setPayId(r.id)}>Оплатить {money(r.amount)}</Btn>}
                {r.status === 'clarify' && (r.authorId === me.id
                  ? <Btn block style={{ marginTop: 4 }} onClick={() => setAnswerId(r.id)}>Ответить</Btn>
                  : <p className="muted" style={{ fontSize: 13 }}>Ответить на уточнение должен автор заявки: {userName(d, r.authorId)}.</p>)}
              </RequestCard>
            ))}
          </div>
        </>
      )}

      {tab === 'tmc' && (
        <Card title="Потребности в материалах" note={fresh ? `${count(fresh, 'новая', 'новые', 'новых')} без маршрута` : 'все взяты в работу'} flush>
          <DataTable cols={needCols} rows={needs} keyOf={(n) => n.id} onRow={(n) => setNeedId(n.id)} empty="Потребностей в материалах пока нет." />
        </Card>
      )}

      {paying && canPay(paying) && <PaySheet key={paying.id} r={paying} onClose={() => setPayId(null)} />}
      <NoteSheet open={!!answering} title={answering ? `Ответ по заявке № ${answering.num}` : ''} label="Ваш ответ на вопрос" action="Отправить" required
        onClose={() => setAnswerId(null)}
        onSubmit={(text) => {
          if (answering) { act.answerRequest(answering.id, text); toast(`Ответ отправлен. Заявка № ${answering.num} снова на согласовании`); }
          setAnswerId(null);
        }} />
      <NewRequestSheet open={form} onClose={() => setForm(false)} />
      <Sheet open={!!need} wide title={need ? `Потребность № ${need.num}` : ''} onClose={() => setNeedId(null)}
        foot={need && <LinkBtn to={`/admin/objects/${need.objectId}?tab=materials`}>Материалы объекта</LinkBtn>}>
        {need && <NeedDetails need={need} />}
      </Sheet>
    </Page>
  );
}

/** Paying an agreed request: the economist only chooses where the money leaves from. */
function PaySheet({ r, onClose }: { r: MoneyRequest; onClose: () => void }) {
  const d = useData();
  const regs = d.registers.filter((x) => x.entityId === r.entityId);
  const [regId, setRegId] = useState(() => (regs.find((x) => registerBalance(d, x.id) >= r.amount) ?? regs[0])?.id ?? '');
  const reg = regs.find((x) => x.id === regId);
  const due = dueLabel(d, r.due);
  const pay = () => {
    if (!reg) return;
    act.payRequest(r.id, reg.id);
    toast(`Заявка № ${r.num} оплачена: ${money(r.amount)}, ${reg.name}`);
    onClose();
  };
  return (
    <Sheet open title={`Оплата заявки № ${r.num}`} onClose={onClose}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!reg} onClick={pay}>Оплатить {money(r.amount)}</Btn></>}>
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div style={{ fontSize: 28, lineHeight: '34px', fontWeight: 700 }}><Money v={r.amount} /></div>
          <div style={{ marginTop: 2 }}>{r.basis}</div>
        </div>
        <dl className="kv left">
          <dt>Платит</dt><dd>{byId(d.entities, r.entityId)?.name ?? '—'}</dd>
          <dt>Статья</dt><dd>{byId(d.articles, r.articleId)?.name ?? '—'}</dd>
          {r.objectId && <><dt>Объект</dt><dd>{objectName(d, r.objectId)}</dd></>}
          <dt>Срок</dt><dd className={due.tone === 'negative' ? 'neg' : ''}>{due.text}</dd>
        </dl>
        <div>
          <div className="section-title" style={{ margin: '0 0 2px' }}>Откуда оплатить</div>
          {regs.length ? (
            <div className="list" style={{ margin: '0 -16px' }} role="radiogroup" aria-label="Касса или счёт">
              {regs.map((x) => {
                const balance = registerBalance(d, x.id);
                const after = balance - r.amount;
                return (
                  <label key={x.id} className="row" style={{ cursor: 'pointer' }}>
                    <input type="radio" name="pay-register" checked={x.id === regId} onChange={() => setRegId(x.id)}
                      style={{ width: 18, height: 18, margin: 0, flex: 'none', accentColor: 'var(--primary)' }} />
                    <div className="row-main">
                      <div className="row-title">{x.name}</div>
                      <div className="row-sub">{x.kind === 'bank' ? 'Банковский счёт' : 'Наличная касса'}</div>
                    </div>
                    <div className="row-side">
                      <div className="row-value">{money(balance)}</div>
                      <div className="row-meta">{after < 0 ? <span className="neg">не хватит {money(-after)}</span> : `останется ${money(after)}`}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : <p className="muted">У этого юрлица нет касс и счетов, оплатить заявку неоткуда.</p>}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Оплата запишется расходом на сегодня и останется в истории заявки.</p>
      </div>
    </Sheet>
  );
}

function NewRequestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const arts = d.articles.filter((a) => a.flow === 'out');
  const blank = { amount: 0, basis: '', articleId: arts[0]?.id ?? '', entityId: d.entities[0]?.id ?? '', objectId: '', due: addDays(d.today, 3) };
  const [f, setF] = useState(blank);
  const set = (p: Partial<typeof blank>) => setF({ ...f, ...p });
  const ok = f.amount > 0 && f.basis.trim().length > 0 && !!f.articleId && !!f.entityId && !!f.due;
  const save = () => {
    act.createRequest({ amount: f.amount, basis: f.basis.trim(), articleId: f.articleId, entityId: f.entityId, objectId: f.objectId || undefined, due: f.due });
    toast(`Заявка на ${money(f.amount)} отправлена на согласование`);
    setF(blank);
    onClose();
  };
  return (
    <Sheet open={open} title="Новая заявка на деньги" onClose={onClose}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={save}>Отправить на согласование</Btn></>}>
      <div className="form">
        <Field label="Сумма"><AmountInput autoFocus value={f.amount} onChange={(amount) => set({ amount })} /></Field>
        <Field label="Основание"><input className="input" value={f.basis} onChange={(e) => set({ basis: e.target.value })} placeholder="За что платим" /></Field>
        <div className="form-2">
          <Field label="Статья">
            <select className="select" value={f.articleId} onChange={(e) => set({ articleId: e.target.value })}>
              {arts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Срок оплаты">
            <input className="input" type="date" min={d.today} value={f.due} onChange={(e) => set({ due: e.target.value })} />
          </Field>
        </div>
        <Field label="Объект" help="Не обязательно. Юрлицо подставится из объекта.">
          <select className="select" value={f.objectId}
            onChange={(e) => set({ objectId: e.target.value, entityId: byId(d.objects, e.target.value)?.entityId ?? f.entityId })}>
            <option value="">Без объекта</option>
            {d.objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Юрлицо, которое платит">
          <select className="select" value={f.entityId} onChange={(e) => set({ entityId: e.target.value })}>
            {d.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
      </div>
    </Sheet>
  );
}

/** A need as the economist sees it: whole, with every part of every position, and nothing to edit. */
function NeedDetails({ need }: { need: Need }) {
  const d = useData();
  const st = needState(need);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <dl className="kv left">
        <dt>Объект</dt><dd>{objectName(d, need.objectId)}</dd>
        <dt>Инициатор</dt><dd>{userName(d, need.authorId)}</dd>
        <dt>Дата</dt><dd>{dFull(need.date)}{need.urgent ? ', срочная' : ''}</dd>
        <dt>Состояние</dt><dd><Pill tone={NEED_TONE[st]}>{NEED_LABEL[st]}</Pill> <span className="muted">· обеспечено {pct(needProgress(need))}</span></dd>
        {need.comment && <><dt>Комментарий</dt><dd>{need.comment}</dd></>}
      </dl>
      {need.question && (
        <div className="notice plain">
          <p><span>Вопрос менеджера, {need.question.by}:</span> <span style={{ color: 'var(--text)' }}>{need.question.text}</span></p>
          <p style={{ marginTop: 4 }}>
            {need.question.answer ? <><span>Ответ прораба:</span> <span style={{ color: 'var(--text)' }}>{need.question.answer}</span></> : 'Прораб ещё не ответил.'}
          </p>
        </div>
      )}
      {need.lines.map((l) => (
        <div key={l.id} style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
          <NeedLineBlock line={l} legend parts caption={`Нужно к ${dShort(l.wantDate)}${l.comment ? ` · ${l.comment}` : ''}`} />
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>
        Маршруты назначает менеджер торгового направления. Каждая часть позиции остаётся привязанной к этой потребности.
      </p>
    </div>
  );
}
