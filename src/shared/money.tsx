// Money pieces shared by the owner's and the economist's workspaces:
// an operation as a row and as a sheet, the form for a new operation, a request card, calendar statuses.
import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { act, useData, useUser, type OperationInput } from '../data/store';
import { byId, objectName, registerBalance, userName, REQUEST_LABEL, REQUEST_TONE, forecast, transitAge, type Tone } from '../data/select';
import { AmountInput, Avatar, Btn, Details, Field, Money, Pill, Row, Seg, Sheet, toast } from '../ui/kit';
import { dFull, dRel, dShort, daysBetween, money } from '../lib/format';
import type { Data, MoneyRequest, Operation, PlanItem } from '../data/types';

export function opTitle(d: Data, op: Operation): string {
  if (op.kind === 'transfer') return `${byId(d.registers, op.registerId)?.name} → ${byId(d.registers, op.toRegisterId)?.name}`;
  return op.counterparty ?? byId(d.articles, op.articleId)?.name ?? 'Операция';
}
/** Income is green with a plus, an expense is ink with a minus, an internal transfer is grey and unsigned. */
export function OpAmount({ op }: { op: Operation }) {
  if (op.kind === 'in') return <span className="num pos nowrap">+{money(op.amount)}</span>;
  if (op.kind === 'out') return <span className="num nowrap">−{money(op.amount)}</span>;
  return <span className="num muted nowrap">{money(op.amount)}</span>;
}
export function opSub(d: Data, op: Operation): string {
  const reg = byId(d.registers, op.registerId)?.name;
  if (op.kind === 'transfer') return `Перевод · ${op.comment ?? ''}`;
  return [byId(d.articles, op.articleId)?.name, reg, op.objectId ? objectName(d, op.objectId) : null].filter(Boolean).join(' · ');
}
export function OpRow({ op, onClick }: { op: Operation; onClick?: () => void }) {
  const d = useData();
  return (
    <Row
      title={opTitle(d, op)} sub={opSub(d, op)} value={<OpAmount op={op} />} money
      meta={op.transit === 'sent' ? <Pill tone="warning">в пути</Pill> : dRel(op.date, d.today)}
      media={op.kind === 'transfer' ? <ArrowLeftRight size={18} color="var(--muted)" /> : undefined}
      onClick={onClick}
    />
  );
}

/** Details of one operation. The economist can correct it; every correction is kept in the history. */
export function OpSheet({ op, onClose, editable }: { op: Operation | null; onClose: () => void; editable?: boolean }) {
  const d = useData();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Partial<Operation>>({});
  if (!op) return null;
  const cur = { ...op, ...draft };
  const close = () => { setEdit(false); setDraft({}); onClose(); };
  const reg = byId(d.registers, op.registerId);
  const ent = byId(d.entities, reg?.entityId);
  return (
    <Sheet open title={op.kind === 'in' ? 'Поступление' : op.kind === 'out' ? 'Расход' : 'Внутренний перевод'} onClose={close}
      foot={editable && (edit ? (
        <>
          <Btn onClick={() => { setEdit(false); setDraft({}); }}>Отмена</Btn>
          <Btn kind="primary" onClick={() => { act.editOperation(op.id, draft); toast('Исправление сохранено в истории'); setEdit(false); setDraft({}); }}>Сохранить</Btn>
        </>
      ) : (
        <>
          {op.transit === 'sent' && <Btn kind="primary" onClick={() => { act.confirmTransit(op.id); toast('Получение подтверждено'); close(); }}>Подтвердить получение</Btn>}
          {op.bank === 'unmatched' && <Btn onClick={() => { act.matchBank(op.id); toast('Сопоставлено с выпиской'); }}>Сопоставить с банком</Btn>}
          <Btn onClick={() => setEdit(true)}>Исправить</Btn>
        </>
      ))}>
      {!edit ? (
        <div className="stack">
          <div style={{ fontSize: 28, lineHeight: '34px', fontWeight: 700 }}><OpAmount op={op} /></div>
          <dl className="kv left">
            <dt>Дата</dt><dd>{dFull(op.date)}</dd>
            {op.kind === 'transfer' ? (
              <>
                <dt>Откуда</dt><dd>{reg?.name}, {ent?.short}</dd>
                <dt>Куда</dt><dd>{byId(d.registers, op.toRegisterId)?.name}, {byId(d.entities, byId(d.registers, op.toRegisterId)?.entityId)?.short}</dd>
                <dt>Состояние</dt>
                <dd>{op.transit === 'sent' ? `Получение не подтверждено, ${transitAge(d, op)}` : `Получен ${dFull(op.receivedDate ?? op.date)}`}</dd>
              </>
            ) : (
              <>
                <dt>Контрагент</dt><dd>{op.counterparty ?? '—'}</dd>
                <dt>Статья</dt><dd>{byId(d.articles, op.articleId)?.name ?? '—'}</dd>
                <dt>Касса или счёт</dt><dd>{reg?.name}, {ent?.short}</dd>
                <dt>Объект</dt><dd>{op.objectId ? objectName(d, op.objectId) : '—'}</dd>
              </>
            )}
            <dt>Комментарий</dt><dd>{op.comment ?? '—'}</dd>
            {byId(d.requests, op.requestId) && <><dt>Основание</dt><dd>Заявка № {byId(d.requests, op.requestId)?.num} от {dShort(byId(d.requests, op.requestId)!.date)}, {userName(d, byId(d.requests, op.requestId)?.authorId)}</dd></>}
            <dt>Внёс</dt><dd>{userName(d, op.authorId)}</dd>
            {op.bank && <><dt>Банк</dt><dd>{op.bank === 'matched' ? 'Сопоставлено с выпиской' : 'Не сопоставлено с выпиской'}</dd></>}
          </dl>
          {op.history.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>История изменений</div>
              {op.history.map((h, i) => <p key={i} style={{ marginBottom: 4 }}><span className="muted">{dShort(h.at)}, {h.by}:</span> {h.text}</p>)}
            </div>
          )}
        </div>
      ) : (
        <div className="form">
          <Field label="Сумма"><AmountInput value={cur.amount} onChange={(v) => setDraft({ ...draft, amount: v })} /></Field>
          {op.kind !== 'transfer' && (
            <>
              <Field label="Статья">
                <select className="select" value={cur.articleId ?? ''} onChange={(e) => setDraft({ ...draft, articleId: e.target.value })}>
                  {d.articles.filter((a) => a.flow === op.kind).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Объект">
                <select className="select" value={cur.objectId ?? ''} onChange={(e) => setDraft({ ...draft, objectId: e.target.value })}>
                  <option value="">Без объекта</option>
                  {d.objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Контрагент"><input className="input" value={cur.counterparty ?? ''} onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })} /></Field>
            </>
          )}
          <Field label="Комментарий"><input className="input" value={cur.comment ?? ''} onChange={(e) => setDraft({ ...draft, comment: e.target.value })} /></Field>
        </div>
      )}
    </Sheet>
  );
}

/** New operation: an expense, an income or a transfer between own registers. Short by design: amount first. */
export function OperationForm({ open, onClose, registers, defaultRegister }: { open: boolean; onClose: () => void; registers?: string[]; defaultRegister?: string }) {
  const d = useData();
  const regs = d.registers.filter((r) => !registers || registers.includes(r.id));
  const blank: OperationInput = { kind: 'out', amount: 0, registerId: defaultRegister ?? regs[0]?.id ?? '', articleId: '', counterparty: '', comment: '', objectId: '' };
  const [f, setF] = useState<OperationInput>(blank);
  const set = (p: Partial<OperationInput>) => setF({ ...f, ...p });
  const arts = d.articles.filter((a) => a.flow === f.kind);
  const articleId = arts.some((a) => a.id === f.articleId) ? f.articleId : arts[0]?.id;
  const others = d.registers.filter((r) => r.id !== f.registerId);
  const toId = f.toRegisterId && f.toRegisterId !== f.registerId ? f.toRegisterId : others[0]?.id;
  const balance = registerBalance(d, f.registerId);
  const over = f.kind !== 'in' && f.amount > balance;
  const ok = f.amount > 0 && !!f.registerId && (f.kind !== 'transfer' || !!toId);
  const save = () => {
    act.addOperation({ ...f, articleId, toRegisterId: f.kind === 'transfer' ? toId : undefined });
    toast(f.kind === 'transfer' ? 'Перевод отправлен' : 'Записано');
    setF(blank);
    onClose();
  };
  return (
    <Sheet open={open} title="Записать деньги" onClose={onClose} dirty={f.amount > 0}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={save}>Записать</Btn></>}>
      <div className="form">
        <Seg wide value={f.kind} onChange={(kind) => set({ kind })} options={[{ value: 'out', label: 'Расход' }, { value: 'in', label: 'Поступление' }, { value: 'transfer', label: 'Перевод' }]} />
        <Field label="Сумма"><AmountInput autoFocus value={f.amount} onChange={(amount) => set({ amount })} /></Field>
        <Field label={f.kind === 'in' ? 'Куда' : 'Откуда'} help={over ? <span className="neg">На остатке {money(balance)}, после операции станет меньше нуля.</span> : undefined}>
          <select className="select" value={f.registerId} onChange={(e) => set({ registerId: e.target.value })}>
            {regs.map((r) => <option key={r.id} value={r.id}>{r.name} · {byId(d.entities, r.entityId)?.short}</option>)}
          </select>
        </Field>
        {f.kind === 'transfer' ? (
          <Field label="Куда">
            <select className="select" value={toId} onChange={(e) => set({ toRegisterId: e.target.value })}>
              {others.map((r) => <option key={r.id} value={r.id}>{r.name} · {byId(d.entities, r.entityId)?.short}</option>)}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Статья">
              <select className="select" value={articleId} onChange={(e) => set({ articleId: e.target.value })}>
                {arts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="За что"><input className="input" value={f.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="Коротко" /></Field>
        {f.kind !== 'transfer' && (
          <Details label="Контрагент и объект">
            <Field label="Контрагент"><input className="input" value={f.counterparty} onChange={(e) => set({ counterparty: e.target.value })} placeholder="Кому или от кого" /></Field>
            <Field label="Объект">
              <select className="select" value={f.objectId} onChange={(e) => set({ objectId: e.target.value })}>
                <option value="">Без объекта</option>
                {d.objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
          </Details>
        )}
      </div>
    </Sheet>
  );
}

export function dueLabel(d: Data, due: string): { text: string; tone: Tone } {
  const n = daysBetween(d.today, due);
  if (n < 0) return { text: `срок прошёл ${dShort(due)}`, tone: 'negative' };
  if (n === 0) return { text: 'оплатить сегодня', tone: 'warning' };
  if (n === 1) return { text: 'оплатить завтра', tone: 'neutral' };
  return { text: `оплатить до ${dShort(due)}`, tone: 'neutral' };
}

/** One money request: who asks, for what, by when, and what the money on hand will be after it. */
export function RequestCard({ r, children }: { r: MoneyRequest; children?: React.ReactNode }) {
  const d = useData();
  const author = byId(d.users, r.authorId);
  const due = dueLabel(d, r.due);
  const fc = forecast(d, Math.max(0, Math.min(30, daysBetween(d.today, r.due))));
  const after = fc[fc.length - 1]?.balance;
  const open = r.status === 'pending' || r.status === 'clarify';
  const last = r.decisions[r.decisions.length - 1];
  return (
    <section className="card">
      <div className="card-body stack" style={{ gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700 }}><Money v={r.amount} /></div>
            <div style={{ marginTop: 2 }}>{r.basis}</div>
          </div>
          <Pill tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Pill>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} className="muted">
          <Avatar user={author} small />
          <span>{author?.name}</span>
          <span className={due.tone === 'negative' ? 'neg' : ''}>· {due.text}</span>
        </div>
        {open && after !== undefined && after < 0 && <p className="neg">После оплаты денег не хватит: прогноз остатка {money(after)}.</p>}
        {last && <p><span className="muted">{last.by}:</span> {last.action}{last.note ? `. ${last.note}` : ''}</p>}
        {children}
        <Details>
          <dl className="kv left">
            <dt>Заявка</dt><dd>№ {r.num} от {dShort(r.date)}</dd>
            <dt>Платит</dt><dd>{byId(d.entities, r.entityId)?.name}</dd>
            <dt>Статья</dt><dd>{byId(d.articles, r.articleId)?.name}</dd>
            {r.objectId && <><dt>Объект</dt><dd>{objectName(d, r.objectId)}</dd></>}
            {open && after !== undefined && <><dt>Остаток после</dt><dd>{money(after)} на {dShort(r.due < d.today ? d.today : r.due)}</dd></>}
          </dl>
          {r.decisions.length > 1 && r.decisions.map((x, i) => (
            <p key={i}><span className="muted">{dShort(x.at)}, {x.by}:</span> {x.action}{x.note ? `. ${x.note}` : ''}</p>
          ))}
        </Details>
      </div>
    </section>
  );
}

export function planStatus(d: Data, p: PlanItem): { text: string; tone: Tone } {
  const req = byId(d.requests, p.requestId);
  if (p.status === 'paid') return { text: 'Оплачено', tone: 'positive' };
  if (p.status === 'approved') return { text: 'Согласовано', tone: 'hue' };
  if (req?.status === 'pending') return { text: 'На согласовании', tone: 'warning' };
  if (req?.status === 'clarify') return { text: 'Уточняется', tone: 'warning' };
  if (p.regular) return { text: 'Регулярный', tone: 'neutral' };
  return { text: p.flow === 'in' ? 'Ожидается' : 'План', tone: 'neutral' };
}

/** A sheet with a note field for a decision or an answer. */
export function NoteSheet(p: { open: boolean; title: string; label: string; action: string; required?: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Sheet open={p.open} title={p.title} onClose={p.onClose}
      foot={<><Btn onClick={p.onClose}>Отмена</Btn><Btn kind="primary" disabled={p.required && !note.trim()} onClick={() => { p.onSubmit(note.trim()); setNote(''); }}>{p.action}</Btn></>}>
      <Field label={p.label}><textarea className="textarea" autoFocus value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Sheet>
  );
}

export function useIsOwner(): boolean {
  return useUser().role === 'owner';
}
