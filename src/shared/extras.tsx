// Pieces used from any screen: a remark created in context, dictation into a text field,
// a permanent link with a QR code, and the line that shows the place a form will use.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import { Copy, Mic, QrCode, TriangleAlert } from 'lucide-react';
import { act, useData } from '../data/store';
import { ISSUE_LABEL, byId } from '../data/select';
import { Btn, Details, Field, Photos, Sheet, toast } from '../ui/kit';
import { addDays } from '../lib/format';
import type { Issue, IssueKind } from '../data/types';

/* ---------------------------------------------------------------- dictation */
interface Recognition { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
function recognitionCtor(): (new () => Recognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
/**
 * A text field the person can dictate into. The speech becomes text in the field and nothing else:
 * the person reads it and saves the record with the usual button. Where the browser cannot recognise speech, the microphone is not shown.
 */
export function VoiceArea({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const Ctor = recognitionCtor();
  useEffect(() => () => rec.current?.stop(), []);
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'ru-RU';
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim();
      if (text) onChange((latest.current ? latest.current.trimEnd() + ' ' : '') + text);
    };
    r.onend = () => setOn(false);
    r.onerror = () => { setOn(false); toast('Не получилось распознать речь. Введите текст вручную.'); };
    rec.current = r;
    try { r.start(); setOn(true); } catch { setOn(false); }
  };
  return (
    <div className="mic">
      <textarea className="textarea" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {Ctor && (
        <button type="button" className={`icon-btn ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on} aria-label={on ? 'Остановить диктовку' : 'Надиктовать'}>
          <Mic size={20} />
        </button>
      )}
    </div>
  );
}
export const canDictate = (): boolean => !!recognitionCtor();

/* ------------------------------------------------------------------ remarks */
export interface IssueContext { objectId: string; place?: string; source?: Issue['source']; kind?: IssueKind }
/** The form of a remark. It opens with the object, the place and the source record already known. */
export function IssueSheet({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: IssueContext }) {
  const d = useData();
  const blank = { kind: (ctx.kind ?? 'defect') as IssueKind, place: ctx.place ?? '', text: '', photos: 0, due: '', responsible: '' };
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF(blank); }, [open, ctx.place, ctx.source?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = d.users.filter((u) => u.role !== 'owner');
  const dirty = !!f.text.trim() || f.photos > 0;
  return (
    <Sheet open={open} title="Сообщить о проблеме" onClose={onClose} dirty={dirty}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!f.text.trim() || !f.place.trim()}
        onClick={() => { act.addIssue({ objectId: ctx.objectId, kind: f.kind, place: f.place.trim(), text: f.text.trim(), photos: f.photos, source: ctx.source, due: f.due, responsible: f.responsible }); toast('Замечание записано'); onClose(); }}>Записать</Btn></>}>
      <div className="form">
        <Field label="Что не так">
          <VoiceArea label="Что не так" value={f.text} onChange={(text) => setF({ ...f, text })} placeholder="Коротко, можно надиктовать" />
        </Field>
        <Field label="Где"><input className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="Помещение, стена, зона" /></Field>
        <Photos count={f.photos} onChange={(n) => setF({ ...f, photos: n })} />
        <Details label="Вид, срок, ответственный">
          <Field label="Вид">
            <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as IssueKind })}>
              {(Object.keys(ISSUE_LABEL) as IssueKind[]).map((k) => <option key={k} value={k}>{ISSUE_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Срок"><input className="input" type="date" min={d.today} max={addDays(d.today, 365)} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          <Field label="Ответственный">
            <select className="select" value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })}>
              <option value="">Не назначен</option>
              {people.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
          </Field>
          {ctx.source && <p className="muted">Связано с записью: {ctx.source.label}</p>}
        </Details>
      </div>
    </Sheet>
  );
}
/** «Замечание» as a button for any card: the remark is linked to the place and to the record it was created from. */
export function IssueButton({ ctx, children = 'Замечание', small = true }: { ctx: IssueContext; children?: ReactNode; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn small={small} onClick={() => setOpen(true)}><TriangleAlert size={16} /> {children}</Btn>
      <IssueSheet open={open} onClose={() => setOpen(false)} ctx={ctx} />
    </>
  );
}

/* --------------------------------------------------------- link and QR code */
/** The permanent address of a card. The same address opens it from a notification, a message or a printed code. */
export function permalink(path: string): string {
  return `${window.location.origin}${window.location.pathname}#${path}`;
}
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [open, setOpen] = useState(false);
  const url = permalink(path);
  let svg = '';
  if (open) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast('Не получилось скопировать. Выделите ссылку вручную.'); }
  };
  return (
    <>
      <Btn small onClick={() => setOpen(true)} aria-label="Ссылка и QR-код"><QrCode size={16} /> Ссылка</Btn>
      <Sheet open={open} title={title} onClose={() => setOpen(false)} foot={<Btn kind="primary" onClick={copy}><Copy size={16} /> Скопировать ссылку</Btn>}>
        <div className="stack">
          
          <div className="qr" role="img" aria-label="QR-код со ссылкой на карточку" dangerouslySetInnerHTML={{ __html: svg }} />
          <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Ссылка на карточку" />
          
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------- place */
/** The place a form will be filled for. Shown openly, with a way to change it, so the context never switches unnoticed. */
export function PlaceLine({ changeTo }: { changeTo?: string }) {
  const d = useData();
  const o = byId(d.objects, d.session.objectId);
  const room = byId(d.rooms, d.session.roomId);
  if (!o) return null;
  const parts = [o.name, d.session.floor ?? room?.floor, room?.name].filter(Boolean);
  return (
    <div className="context">
      <span className="muted">Место:</span>
      <b>{parts.join(' · ')}</b>
      {(d.session.floor || room) && <button className="link" style={{ minHeight: 24 }} onClick={() => act.setPlace(undefined, undefined)}>весь объект</button>}
      {changeTo && <Link className="link" style={{ minHeight: 24 }} to={changeTo}>сменить</Link>}
    </div>
  );
}
