// The UI kit. Every screen is composed from these pieces, so the rules of the style live here:
// ink chrome, pale status pills, tabular figures, 44px touch targets on a phone, sheets instead of pages for short forms.
import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { create } from 'zustand';
import { initials, money as fmtMoney, num } from '../lib/format';
import { lineStats, type Tone } from '../data/select';
import type { NeedLine, PartStatus, User } from '../data/types';

/* ---------------------------------------------------------------- hooks */
export function useMedia(query: string): boolean {
  const [m, set] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => set(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return m;
}
/** true from tablet width up: tables stay tables */
export const useWide = (): boolean => useMedia('(min-width: 700px)');
export const useDesktop = (): boolean => useMedia('(min-width: 1000px)');

/* ---------------------------------------------------------------- toast */
const useToast = create<{ text: string | null }>(() => ({ text: null }));
let toastTimer: number | undefined;
export function toast(text: string): void {
  useToast.setState({ text });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => useToast.setState({ text: null }), 2600);
}
export function Toaster() {
  const text = useToast((s) => s.text);
  return text ? <div className="toast" role="status">{text}</div> : null;
}

/* ----------------------------------------------------------------- page */
export function Page(p: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: boolean | string; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="page">
      {p.back && (
        <button className="back" onClick={() => (typeof p.back === 'string' ? nav(p.back) : nav(-1))}>
          <ChevronLeft size={16} /> Назад
        </button>
      )}
      <div className="head">
        <div className="titles">
          <h1>{p.title}</h1>
          {p.sub && <p className="sub">{p.sub}</p>}
        </div>
        {p.actions && <div className="actions">{p.actions}</div>}
      </div>
      <div className="stack">{p.children}</div>
    </div>
  );
}

export function Card(p: { title?: ReactNode; note?: ReactNode; action?: ReactNode; flush?: boolean; foot?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={`card ${p.className ?? ''}`}>
      {(p.title || p.action) && (
        <div className="card-head">
          <h2>{p.title}</h2>
          {p.note && <span className="note">{p.note}</span>}
          {p.action}
        </div>
      )}
      {p.flush ? p.children : <div className="card-body">{p.children}</div>}
      {p.foot && <div className="card-foot">{p.foot}</div>}
    </section>
  );
}

export interface StatItem { label: string; value: ReactNode; hint?: ReactNode; lead?: boolean; zero?: boolean }
/** Headline numbers: one container split by hairlines, never a row of tiles. */
export function Stats({ items }: { items: StatItem[] }) {
  // on a phone the cells go two in a row; an odd one out takes the full width instead of leaving a hole
  const odd = items.filter((s) => !s.lead).length % 2 === 1;
  return (
    <div className="card">
      <div className="stats">
        {items.map((s, i) => (
          <div key={s.label} className={`stat ${s.lead ? 'lead' : ''} ${odd && i === items.length - 1 && !s.lead ? 'span' : ''}`}>
            <div className="label">{s.label}</div>
            <div className={`value ${s.zero ? 'zero' : ''}`}>{s.value}</div>
            {s.hint && <div className="hint">{s.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; small?: boolean; block?: boolean };
export function Btn({ kind = 'secondary', small, block, className, type, ...rest }: BtnProps) {
  return <button type={type ?? 'button'} className={`btn ${kind === 'secondary' ? '' : kind} ${small ? 'sm' : ''} ${block ? 'block' : ''} ${className ?? ''}`} {...rest} />;
}
export function LinkBtn({ to, children, kind = 'secondary', small, block }: { to: string; children: ReactNode; kind?: 'primary' | 'secondary' | 'ghost'; small?: boolean; block?: boolean }) {
  return <Link to={to} className={`btn ${kind === 'secondary' ? '' : kind} ${small ? 'sm' : ''} ${block ? 'block' : ''}`}>{children}</Link>;
}
export function More({ to, children = 'Все' }: { to: string; children?: ReactNode }) {
  return <Link to={to} className="link">{children}</Link>;
}

export function Money({ v, signed }: { v: number; signed?: boolean }) {
  return <span className="num nowrap">{signed && v > 0 ? '+' : ''}{fmtMoney(v)}</span>;
}

export function Avatar({ user, small }: { user?: Pick<User, 'name' | 'hue'>; small?: boolean }) {
  const style: CSSProperties = { background: `hsl(${user?.hue ?? 210} 55% 92%)`, color: `hsl(${user?.hue ?? 210} 45% 26%)` };
  return <span className={`avatar ${small ? 'sm' : ''}`} style={style} aria-hidden>{initials(user?.name ?? '?')}</span>;
}

/* ----------------------------------------------------------------- rows */
export interface RowProps {
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  media?: ReactNode;
  to?: string;
  onClick?: () => void;
  money?: boolean;
  wrap?: boolean;
  side?: ReactNode;
}
/** A two-line row: the identity and its key number on line one, the rest in grey on line two. */
export function Row(p: RowProps) {
  const inner = (
    <>
      {p.media}
      <div className="row-main">
        <div className={`row-title ${p.wrap ? 'wrap' : ''}`}>{p.title}</div>
        {p.sub && <div className="row-sub">{p.sub}</div>}
      </div>
      {(p.value !== undefined || p.meta) && (
        <div className="row-side">
          {p.value !== undefined && <div className={`row-value ${p.money ? 'money' : ''}`}>{p.value}</div>}
          {p.meta && <div className="row-meta">{p.meta}</div>}
        </div>
      )}
      {p.side}
      {(p.to || p.onClick) && <ChevronRight size={16} className="chev" />}
    </>
  );
  if (p.to) return <Link to={p.to} className="row">{inner}</Link>;
  if (p.onClick) return <button type="button" className="row" onClick={p.onClick}>{inner}</button>;
  return <div className="row">{inner}</div>;
}
export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export interface Col<T> {
  head: string;
  cell: (row: T) => ReactNode;
  num?: boolean;
  /** where the column goes when the table folds into two-line rows on a phone */
  phone?: 'title' | 'sub' | 'value' | 'meta' | 'hide';
  width?: string;
}
/** A real table from tablet width up; a list of two-line rows on a phone. Fields move to line two, they are never dropped. */
export function DataTable<T>(p: { cols: Col<T>[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; empty?: string; foot?: ReactNode[] }) {
  const wide = useWide();
  if (!p.rows.length) return <Empty>{p.empty ?? 'Здесь пока ничего нет.'}</Empty>;
  if (!wide) {
    const title = p.cols.find((c) => c.phone === 'title') ?? p.cols[0];
    const value = p.cols.find((c) => c.phone === 'value') ?? [...p.cols].reverse().find((c) => c.num);
    const meta = p.cols.find((c) => c.phone === 'meta');
    const subs = p.cols.filter((c) => c !== title && c !== value && c !== meta && c.phone !== 'hide');
    return (
      <div className="list">
        {p.rows.map((r) => (
          <Row
            key={p.keyOf(r)}
            title={title.cell(r)}
            sub={subs.map((c, i) => <span key={c.head}>{i > 0 && ' · '}{c.cell(r)}</span>)}
            value={value?.cell(r)}
            meta={meta?.cell(r)}
            onClick={p.onRow ? () => p.onRow!(r) : undefined}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{p.cols.map((c) => <th key={c.head} className={c.num ? 'r' : ''} style={c.width ? { width: c.width } : undefined}>{c.head}</th>)}</tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={p.keyOf(r)} className={p.onRow ? 'click' : ''} onClick={p.onRow ? () => p.onRow!(r) : undefined}>
              {p.cols.map((c) => <td key={c.head} className={c.num ? 'r' : ''}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {p.foot && <tfoot><tr>{p.foot.map((f, i) => <td key={i} className={p.cols[i]?.num ? 'r' : ''}>{f}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
/** Two stacked lines inside one table cell. */
export function Two({ a, b }: { a: ReactNode; b?: ReactNode }) {
  return <><div className="t1">{a}</div>{b && <div className="t2">{b}</div>}</>;
}

/* ------------------------------------------------------------- controls */
/**
 * A caption over a control. It is a group, not a <label>: a label wrapped around a stepper or a segmented control
 * would press its first button when the caption is tapped.
 */
export function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options, wide }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; wide?: boolean }) {
  return (
    <div className={`seg ${wide ? 'wide' : ''}`} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined && <span className="cnt">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 1e9, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label?: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10));
  return (
    <div className="stepper">
      <button type="button" aria-label="Меньше" onClick={() => onChange(clamp(value - step))}><Minus size={16} /></button>
      <input type="number" inputMode="decimal" aria-label={label ?? 'Количество'} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value.replace(',', '.')) || 0))} onFocus={(e) => e.target.select()} />
      <button type="button" aria-label="Больше" onClick={() => onChange(clamp(value + step))}><Plus size={16} /></button>
    </div>
  );
}

/** Amount input that shows thousands separators while typing. */
export function AmountInput({ value, onChange, autoFocus }: { value: number; onChange: (v: number) => void; autoFocus?: boolean }) {
  return (
    <input className="input amount" inputMode="numeric" placeholder="0 ₽" autoFocus={autoFocus}
      value={value ? num(value) : ''} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)} />
  );
}

/** Photos are taken with the phone camera. In the demo only their number is kept. */
export function Photos({ count, onChange }: { count: number; onChange: (n: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  return (
    <div className="photos">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="photo" style={thumbs[i] ? { backgroundImage: `url(${thumbs[i]})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          {!thumbs[i] && <Camera size={18} />}
        </span>
      ))}
      <Btn small onClick={() => ref.current?.click()}><Camera size={16} /> {count ? 'Ещё фото' : 'Добавить фото'}</Btn>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setThumbs((t) => { const n = [...t]; n[count] = URL.createObjectURL(f); return n; });
          onChange(count + 1);
          e.target.value = '';
        }} />
    </div>
  );
}

/* --------------------------------------------------------------- sheets */
/** A bottom sheet on a phone, a dialog on a desktop. Short jobs open here instead of on a new page. */
export function Sheet(p: { open: boolean; title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!p.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [p.open, p.onClose]);
  if (!p.open) return null;
  return (
    <div className="sheet-back" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className={`sheet ${p.wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={p.title}>
        <div className="sheet-head">
          <h2>{p.title}</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={p.onClose}><X size={20} /></button>
        </div>
        <div className="sheet-body">{p.children}</div>
        {p.foot && <div className="sheet-foot">{p.foot}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------- the product's own marks */
const MARK: Record<PartStatus, string> = {
  received: 'mk-received', shipped: 'mk-shipped', reserved: 'mk-reserved', ordered: 'mk-ordered', handed: 'mk-handed', clarify: 'mk-clarify',
};
const MARK_LABEL: Record<PartStatus | 'open', string> = {
  received: 'получено', shipped: 'в пути', reserved: 'резерв на складе', ordered: 'в заказе', handed: 'у снабженца', clarify: 'уточняется', open: 'не распределено',
};
const ORDER: PartStatus[] = ['received', 'shipped', 'reserved', 'ordered', 'handed', 'clarify'];
/**
 * The route bar: what happened to one position, to scale. A position can be covered in parts and by several routes,
 * and every part stays tied to the original need.
 */
export function RouteBar({ line, legend }: { line: NeedLine; legend?: boolean }) {
  const st = lineStats(line);
  const segs: { key: string; cls: string; qty: number; label: string }[] = [];
  for (const status of ORDER) {
    // a part delivered short shows what really arrived as received and the rest as still open
    const q = line.parts.filter((p) => p.status === status).reduce((s, p) => s + (status === 'received' ? p.received ?? p.qty : p.qty), 0);
    if (q > 0) segs.push({ key: status, cls: MARK[status], qty: q, label: MARK_LABEL[status] });
  }
  const shown = segs.reduce((s, x) => s + x.qty, 0);
  const open = Math.max(0, line.qty - shown);
  if (open > 0) segs.push({ key: 'open', cls: 'mk-open', qty: open, label: st.open > 0 ? MARK_LABEL.open : 'недопоставлено' });
  return (
    <div>
      <div className="route" role="img" aria-label={segs.map((s) => `${s.label}: ${num(s.qty)}`).join(', ')}>
        {segs.map((s) => <i key={s.key} className={s.cls} style={{ flex: `${s.qty} 1 0` }} />)}
      </div>
      {legend && (
        <div className="legend" style={{ marginTop: 6 }}>
          {segs.map((s) => <span key={s.key}><i className={s.cls} />{s.label} <b className="num" style={{ fontWeight: 500, color: 'var(--text)' }}>{num(s.qty, Number.isInteger(s.qty) ? 0 : 1)}</b></span>)}
        </div>
      )}
    </div>
  );
}

/** Progress to a plan: the fill is the true ratio, both ends are labelled by the caller. */
export function Track({ value, max, second, hue }: { value: number; max: number; second?: number; hue?: boolean }) {
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / (max || 1)) * 100))}%`;
  return (
    <div className="track">
      {second !== undefined && second > 0 && <i className="done" style={{ width: w(second) }} />}
      {value > 0 && <i className={hue ? 'hue' : 'acc'} style={{ width: w(value) }} />}
    </div>
  );
}

export function Finding({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <div className="notice finding">{icon}<div>{children}</div></div>;
}
