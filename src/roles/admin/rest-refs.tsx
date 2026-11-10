// «Справочники» and «Технологические карты»: the lists every other screen leans on.
// The catalogue lives here: normalised positions grouped by family, supplier positions kept as they are written,
// and the queue where a person links one to the other.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, Landmark, Search as SearchIcon } from 'lucide-react';
import { act, useData } from '../../data/store';
import { byId, material, onHand, registerBalance, registersIn, transitTotal, type Tone } from '../../data/select';
import {
  AmountInput, Btn, Card, DataTable, Empty, Field, Finding, List, More, Page, Pill, Row, Seg, Sheet, Stepper, Tabs, Two, toast, useSticky, useWide, type Col,
} from '../../ui/kit';
import { OpRow } from '../../shared/money';
import { count, dFull, dShort, money, qty } from '../../lib/format';
import type { Article, Data, Material, Norm, Operation, SourcePosition } from '../../data/types';
import { Wrap, dash, dec } from './rest-bits';

const ru = (a: string, b: string): number => a.localeCompare(b, 'ru');
const small = { fontSize: 13, lineHeight: '18px' } as const;

/* ------------------------------------------------------------- references */
type RefTab = 'materials' | 'sources' | 'queue' | 'articles' | 'entities' | 'parties' | 'works';
const REF_TABS: RefTab[] = ['materials', 'sources', 'queue', 'articles', 'entities', 'parties', 'works'];

export function Refs() {
  const d = useData();
  const [sp, setSp] = useSearchParams();
  const [kept, setKept] = useSticky<RefTab>('admin.refs.tab', 'materials');
  // a link from a task or from the launcher names the tab; without it the screen opens the way it was left
  const asked = REF_TABS.find((t) => t === sp.get('tab'));
  const tab = asked ?? kept;
  const setTab = (t: RefTab) => { setKept(t); if (sp.has('tab')) setSp({}, { replace: true }); };
  const parties = new Set(d.operations.map((o) => o.counterparty).filter(Boolean)).size;
  const waiting = d.sources.filter((s) => s.status === 'queue').length;
  const temp = d.sources.filter((s) => s.status === 'temp').length;
  const matched = d.sources.length - waiting - temp;
  return (
    <Page title="Справочники"
      sub={waiting + temp
        ? `В очереди нормализации ${count(waiting + temp, 'позиция', 'позиции', 'позиций')} поставщиков: ${count(waiting, 'ждёт', 'ждут', 'ждут')} сопоставления, ${count(temp, 'временная запись', 'временные записи', 'временных записей')} с приёмки.`
        : `Очередь нормализации пуста: все позиции поставщиков сопоставлены с номенклатурой из ${count(d.materials.length, 'позиции', 'позиций', 'позиций')}.`}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'materials', label: 'Номенклатура', count: d.materials.length },
        { value: 'sources', label: 'Исходные позиции', count: matched },
        { value: 'queue', label: 'Очередь нормализации', count: waiting + temp },
        { value: 'articles', label: 'Статьи', count: d.articles.length },
        { value: 'entities', label: 'Юрлица и счета', count: d.entities.length },
        { value: 'parties', label: 'Контрагенты', count: parties },
        { value: 'works', label: 'Виды работ', count: d.norms.length },
      ]} />
      {tab === 'materials' && <CatalogRef />}
      {tab === 'sources' && <SourcesRef />}
      {tab === 'queue' && <QueueRef />}
      {tab === 'articles' && <ArticlesRef />}
      {tab === 'entities' && <EntitiesRef />}
      {tab === 'parties' && <PartiesRef />}
      {tab === 'works' && <WorkKindsRef />}
    </Page>
  );
}

/* -------------------------------------------------------------- catalogue */
/** The parent group of a position. A position without a family is its own family. */
const familyOf = (m: Material): string => m.family || m.name;
/** «1 меш = 30 кг»: how the storage unit converts to the unit the material is applied in. */
const conv = (m: Pick<Material, 'unit' | 'useUnit' | 'k'>): string | undefined => (m.k && m.useUnit ? `1 ${m.unit} = ${qty(m.k, m.useUnit)}` : undefined);
const parseK = (s: string): number => {
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : 0;
};
const sourceLine = (s: SourcePosition): string => `${s.supplier} · ${s.code ? `код ${s.code}` : 'кода нет'} · ${s.unit}`;

const PACKING_RULE = 'Разная фасовка никогда не объединяется в одну позицию автоматически: мешок 25 кг и мешок 30 кг остаются двумя позициями одного семейства.';

function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
      <SearchIcon size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
      <input className="input" style={{ paddingLeft: 38, width: '100%' }} type="search" placeholder={placeholder} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CatalogRef() {
  const d = useData();
  const [q, setQ] = useSticky('admin.refs.catalog.q', '');
  const [form, setForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const s = q.trim().toLowerCase();
  const shown = d.materials.filter((m) => !s || [m.name, m.group, m.family ?? '', m.code ?? '', m.pack ?? ''].some((x) => x.toLowerCase().includes(s)));
  const families = [...new Set(shown.map(familyOf))].sort(ru);
  const total = new Set(d.materials.map(familyOf)).size;
  const open = byId(d.materials, openId);
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Название, код, семейство или фасовка" label="Поиск по номенклатуре" />
        <Btn onClick={() => setForm(true)}>Добавить позицию</Btn>
      </div>
      <p className="muted" style={{ ...small, maxWidth: '76ch' }}>
        {s ? `Найдено ${count(shown.length, 'позиция', 'позиции', 'позиций')} из ${d.materials.length}. ` : `${count(d.materials.length, 'позиция', 'позиции', 'позиций')} в ${count(total, 'семействе', 'семействах', 'семействах')}. `}
        Семейство объединяет позиции одного назначения, позиция описывает конкретный товар и его фасовку. {PACKING_RULE}
      </p>
      {families.length ? (
        <div className="grid cols-2">
          {families.map((f) => {
            const list = shown.filter((m) => familyOf(m) === f).sort((a, b) => ru(a.name, b.name));
            return (
              <Card key={f} title={f} note={`${[...new Set(list.map((m) => m.group))].join(', ')} · ${count(list.length, 'позиция', 'позиции', 'позиций')}`} flush>
                <List>
                  {list.map((m) => (
                    <Row key={m.id} wrap onClick={() => setOpenId(m.id)} title={m.name}
                      sub={[m.code ?? 'кода нет', m.pack ?? 'фасовка не указана', conv(m) ?? `применяется в ${m.unit}`].join(' · ')}
                      value={money(m.price)} meta={`за ${m.unit}`} />
                  ))}
                </List>
              </Card>
            );
          })}
        </div>
      ) : <Card><Empty>{s ? `По запросу «${q.trim()}» позиций нет.` : 'В номенклатуре ещё нет позиций.'}</Empty></Card>}
      {form && <MaterialForm onClose={() => setForm(false)} />}
      {open && <PositionSheet key={open.id} m={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** One normalised position: its packaging and conversion can be corrected, and the supplier positions linked to it are listed. */
function PositionSheet({ m, onClose }: { m: Material; onClose: () => void }) {
  const d = useData();
  const [f, setF] = useState({ family: m.family ?? '', pack: m.pack ?? '', useUnit: m.useUnit ?? '', k: m.k ? String(m.k).replace('.', ',') : '' });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const family = f.family.trim();
  const pack = f.pack.trim();
  const useUnit = f.useUnit.trim();
  const k = parseK(f.k);
  const changed = family !== (m.family ?? '') || pack !== (m.pack ?? '') || useUnit !== (m.useUnit ?? '') || k !== (m.k ?? 0);
  const paired = !!useUnit === (k > 0);
  const ok = !!family && paired && changed;
  const families = [...new Set(d.materials.map(familyOf))].sort(ru);
  const useUnits = [...new Set(['кг', 'л', 'м', 'м²', 'шт', ...d.materials.flatMap((x) => (x.useUnit ? [x.useUnit] : []))])];
  const linked = d.sources.filter((s) => s.materialId === m.id && s.status === 'matched');
  const save = () => {
    act.updateMaterial(m.id, { family, pack: pack || undefined, useUnit: useUnit || undefined, k: k || undefined });
    toast(`Позиция сохранена: ${m.name}`);
    onClose();
  };
  return (
    <Sheet open wide title={m.name} onClose={onClose} dirty={changed}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={save}>Сохранить</Btn></>}>
      <div className="form">
        <dl className="kv left">
          <dt>Внутренний код</dt><dd>{m.code ?? dash}</dd>
          <dt>Группа</dt><dd>{m.group}</dd>
          <dt>Единица хранения</dt><dd>{m.unit}</dd>
          <dt>Цена справочника</dt><dd>{money(m.price)} за {m.unit}</dd>
        </dl>
        <Field label="Семейство" help="Родительская группа. Например, «Штукатурка гипсовая» для всех гипсовых штукатурок.">
          <input className="input" list="ref-families" aria-label="Семейство" value={f.family} onChange={(e) => set({ family: e.target.value })} />
          <datalist id="ref-families">{families.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Фасовка">
          <input className="input" aria-label="Фасовка" value={f.pack} onChange={(e) => set({ pack: e.target.value })} placeholder="Например: мешок 30 кг" />
        </Field>
        <div className="form-2">
          <Field label="Единица применения">
            <input className="input" list="ref-use-units" aria-label="Единица применения" value={f.useUnit} onChange={(e) => set({ useUnit: e.target.value })} placeholder="кг" />
            <datalist id="ref-use-units">{useUnits.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label={`Сколько в 1 ${m.unit}`}>
            <input className="input num" inputMode="decimal" aria-label={`Коэффициент: единиц применения в 1 ${m.unit}`} value={f.k} placeholder="0"
              onChange={(e) => set({ k: e.target.value.replace(/[^\d.,]/g, '') })} />
          </Field>
        </div>
        {paired
          ? <p className="muted num" style={small}>{conv({ unit: m.unit, useUnit, k }) ?? `Пересчёта нет: материал хранится и применяется в одной единице, ${m.unit}.`}</p>
          : <p className="neg" style={small}>Единица применения и коэффициент задаются вместе.</p>}
        <div className="notice plain">{PACKING_RULE}</div>
        <div>
          <div className="section-title" style={{ margin: '0 0 6px' }}>Позиции поставщиков</div>
          {linked.length ? (
            <div className="list" style={{ margin: '0 -16px' }}>
              {linked.map((s) => <Row key={s.id} wrap title={s.name} sub={sourceLine(s)} meta={`с ${dShort(s.seenAt)}`} />)}
            </div>
          ) : <p className="muted">С этой позицией не связана ни одна позиция поставщика.</p>}
        </div>
      </div>
    </Sheet>
  );
}

interface MatForm { name: string; family: string; group: string; unit: string; pack: string; useUnit: string; k: string; price: number }
const BLANK: MatForm = { name: '', family: '', group: '', unit: '', pack: '', useUnit: '', k: '', price: 0 };
const PACK_WORD: Record<string, string> = { меш: 'мешок', кан: 'канистра', уп: 'упаковка', рул: 'рулон' };

/** How close a normalised position is to a supplier's name: the number of its words found in the position and its family. */
function likeness(src: SourcePosition): (m: Material) => number {
  const stems = src.name.toLowerCase().split(/[^a-zа-яё0-9]+/).filter((w) => w.length >= 4 && !/^\d/.test(w)).map((w) => w.slice(0, 5));
  return (m) => { const text = `${m.family ?? ''} ${m.name}`.toLowerCase(); return stems.filter((w) => text.includes(w)).length; };
}
/** A first proposal for a new position made from a supplier's one. The person checks every field. */
function proposal(d: Data, src: SourcePosition): { form: MatForm; like?: Material } {
  const score = likeness(src);
  const like = d.materials.map((m) => ({ m, n: score(m) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0]?.m;
  const size = src.name.match(/(\d+(?:[.,]\d+)?)\s*(кг|л|м²|м|шт)(?![a-zа-яё\d])/i);
  const sizeUnit = size?.[2].toLowerCase();
  const sameUnit = like?.unit === src.unit;
  const form: MatForm = { ...BLANK, name: src.name, unit: src.unit, family: like?.family ?? '', group: like?.group ?? '', price: like?.price ?? 0 };
  if (size && sizeUnit && sizeUnit !== src.unit) {
    form.pack = `${PACK_WORD[src.unit] ?? src.unit} ${size[1]} ${sizeUnit}`;
    form.useUnit = sizeUnit;
    form.k = size[1];
  } else if (like && sameUnit) {
    form.pack = like.pack ?? '';
    form.useUnit = like.useUnit ?? '';
    form.k = like.k ? String(like.k).replace('.', ',') : '';
  }
  return { form, like };
}

/** A new normalised position. Opened from a supplier's position, it starts filled in and links the two when saved. */
function MaterialForm({ onClose, source }: { onClose: () => void; source?: SourcePosition }) {
  const d = useData();
  const [start] = useState(() => (source ? proposal(d, source) : { form: BLANK, like: undefined }));
  const [f, setF] = useState<MatForm>(start.form);
  const set = (p: Partial<MatForm>) => setF({ ...f, ...p });
  const groups = [...new Set(d.materials.map((m) => m.group))].sort(ru);
  const units = [...new Set(d.materials.map((m) => m.unit))].sort(ru);
  const families = [...new Set(d.materials.map(familyOf))].sort(ru);
  const name = f.name.trim();
  const unit = f.unit.trim();
  const useUnit = f.useUnit.trim();
  const k = parseK(f.k);
  const dup = !!name && d.materials.some((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  const paired = !!useUnit === (k > 0);
  const ok = !!name && !!f.group.trim() && !!unit && f.price > 0 && !dup && paired;
  const dirty = (Object.keys(f) as (keyof MatForm)[]).some((key) => f[key] !== start.form[key]);
  const save = () => {
    const id = act.addMaterial({
      name, group: f.group.trim(), unit, price: f.price, family: f.family.trim() || undefined, pack: f.pack.trim() || undefined, useUnit: useUnit || undefined, k: k || undefined,
    });
    if (source) {
      act.matchSource(source.id, id);
      toast(`Позиция создана и связана с исходной: ${name}`);
    } else toast(`Позиция добавлена: ${name}`);
    onClose();
  };
  return (
    <Sheet open wide={!!source} title={source ? 'Новая позиция из исходной' : 'Новая позиция'} onClose={onClose} dirty={dirty}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={save}>{source ? 'Создать и связать' : 'Добавить'}</Btn></>}>
      <div className="form">
        {source && (
          <div className="notice plain">
            Исходная позиция: «{source.name}», {sourceLine(source)}. Её название и код останутся как есть.
            {start.like ? ` Поля заполнены по ней и по похожей позиции «${start.like.name}», проверьте их.` : ' Похожей позиции в номенклатуре нет, заполните поля вручную.'}
          </div>
        )}
        <Field label="Название" help={dup ? <span className="neg">Такая позиция уже есть в номенклатуре.</span> : 'Название, принятое в каталоге. Внутренний код позиция получит при сохранении.'}>
          <input className="input" autoFocus={!source} aria-label="Название" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Например: Штукатурка гипсовая, 30 кг" />
        </Field>
        <Field label="Семейство" help="Родительская группа. Если оставить пустым, позиция станет своим семейством.">
          <input className="input" list="ref-new-families" aria-label="Семейство" value={f.family} onChange={(e) => set({ family: e.target.value })} placeholder="Штукатурка гипсовая" />
          <datalist id="ref-new-families">{families.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <div className="form-2">
          <Field label="Группа">
            <input className="input" list="ref-material-groups" aria-label="Группа" value={f.group} onChange={(e) => set({ group: e.target.value })} placeholder="Сухие смеси" />
            <datalist id="ref-material-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </Field>
          <Field label="Единица хранения">
            <input className="input" list="ref-material-units" aria-label="Единица хранения" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="меш" />
            <datalist id="ref-material-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
        </div>
        <Field label="Фасовка">
          <input className="input" aria-label="Фасовка" value={f.pack} onChange={(e) => set({ pack: e.target.value })} placeholder="мешок 30 кг" />
        </Field>
        <div className="form-2">
          <Field label="Единица применения">
            <input className="input" aria-label="Единица применения" value={f.useUnit} onChange={(e) => set({ useUnit: e.target.value })} placeholder="кг" />
          </Field>
          <Field label={`Сколько в 1 ${unit || 'единице'}`}>
            <input className="input num" inputMode="decimal" aria-label="Коэффициент: единиц применения в одной единице хранения" value={f.k} placeholder="0"
              onChange={(e) => set({ k: e.target.value.replace(/[^\d.,]/g, '') })} />
          </Field>
        </div>
        {paired
          ? (unit && conv({ unit, useUnit, k }) ? <p className="muted num" style={small}>{conv({ unit, useUnit, k })}</p> : null)
          : <p className="neg" style={small}>Единица применения и коэффициент задаются вместе.</p>}
        <Field label="Цена за единицу хранения"><AmountInput value={f.price} onChange={(price) => set({ price })} /></Field>
        <p className="muted" style={small}>{PACKING_RULE}</p>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------- supplier positions */
function SourcesRef() {
  const d = useData();
  const wide = useWide();
  const [q, setQ] = useSticky('admin.refs.sources.q', '');
  const [openId, setOpenId] = useState<string | null>(null);
  const s = q.trim().toLowerCase();
  const all = d.sources.filter((x) => x.status === 'matched');
  const linked = (x: SourcePosition): Material | undefined => byId(d.materials, x.materialId);
  const rows = all
    .filter((x) => !s || [x.supplier, x.code ?? '', x.name, linked(x)?.name ?? '', linked(x)?.code ?? ''].some((t) => t.toLowerCase().includes(s)))
    .sort((a, b) => ru(a.supplier, b.supplier) || ru(a.name, b.name));
  const open = byId(d.materials, openId);
  const cols: Col<SourcePosition>[] = wide ? [
    { head: 'Поставщик', cell: (x) => x.supplier },
    { head: 'Код поставщика', cell: (x) => x.code ?? dash },
    { head: 'Название у поставщика', cell: (x) => x.name },
    { head: 'Ед.', cell: (x) => x.unit },
    { head: 'Позиция номенклатуры', cell: (x) => { const m = linked(x); return m ? <Two a={m.name} b={m.code} /> : dash; } },
  ] : [
    { head: 'Название у поставщика', phone: 'title', cell: (x) => <Wrap>{x.name}</Wrap> },
    { head: 'Поставщик и код', phone: 'sub', cell: (x) => `${x.supplier}, ${x.code ? `код ${x.code}` : 'кода нет'}` },
    { head: 'Позиция номенклатуры', phone: 'sub', cell: (x) => { const m = linked(x); return m ? `в каталоге: ${m.code ?? ''} ${m.name}` : 'связь потеряна'; } },
    { head: 'Ед.', phone: 'meta', cell: (x) => x.unit },
  ];
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Поставщик, код или название" label="Поиск по исходным позициям" />
      </div>
      <Card title="Исходные позиции" note={s ? `найдено ${rows.length} из ${all.length}` : `${count(new Set(all.map((x) => x.supplier)).size, 'поставщик', 'поставщика', 'поставщиков')}`} flush>
        <DataTable cols={cols} rows={rows} keyOf={(x) => x.id} onRow={(x) => setOpenId(x.materialId ?? null)}
          empty={s ? `По запросу «${q.trim()}» исходных позиций нет.` : 'Сопоставленных позиций поставщиков пока нет.'} />
      </Card>
      <p className="muted" style={{ ...small, maxWidth: '76ch' }}>
        Код и название поставщика хранятся так, как они написаны в его документах, и не переписываются. Связь с позицией номенклатуры ставит человек после проверки технической эквивалентности.
      </p>
      {open && <PositionSheet key={open.id} m={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/* ---------------------------------------------------- normalisation queue */
const QUEUE_STATE: Record<Exclude<SourcePosition['status'], 'matched'>, { label: string; tone: Tone }> = {
  queue: { label: 'Ждёт сопоставления', tone: 'warning' }, temp: { label: 'Временная запись', tone: 'neutral' },
};

function QueueRef() {
  const d = useData();
  const rows = d.sources.filter((s) => s.status !== 'matched').sort((a, b) => b.seenAt.localeCompare(a.seenAt) || ru(a.name, b.name));
  const [sheet, setSheet] = useState<{ id: string; kind: 'match' | 'create' | 'keep' } | null>(null);
  const src = byId(d.sources, sheet?.id);
  const close = () => setSheet(null);
  return (
    <>
      <div className="notice plain" style={{ maxWidth: '86ch' }}>
        Коды и названия поставщика хранятся как есть. Для несопоставленной позиции код не придумывается.
        Несопоставленная позиция не останавливает регистрацию поставки: она принимается как временная запись и ждёт проверки здесь.
      </div>
      {rows.length ? (
        <div className="grid cols-2">
          {rows.map((s) => {
            const dl = byId(d.deliveries, s.deliveryId);
            const st = QUEUE_STATE[s.status === 'temp' ? 'temp' : 'queue'];
            return (
              <Card key={s.id} title={s.name} action={<Pill tone={st.tone}>{st.label}</Pill>}>
                <div className="stack">
                  <dl className="kv left">
                    <dt>Поставщик</dt><dd>{s.supplier}</dd>
                    <dt>Код поставщика</dt><dd>{s.code ?? dash}</dd>
                    <dt>Единица</dt><dd>{s.unit}</dd>
                    <dt>Количество</dt><dd>{s.qty !== undefined ? qty(s.qty, s.unit) : dash}</dd>
                    <dt>Замечена</dt>
                    <dd>
                      {dShort(s.seenAt)}
                      {dl ? <> · <More to={`/admin/objects/${dl.objectId}?tab=materials`}>поставка № {dl.num}</More></> : <span className="muted"> · в документах поставщика, без поставки</span>}
                    </dd>
                    <dt>Примечание</dt><dd>{s.note ?? dash}</dd>
                  </dl>
                  <div className="btn-row">
                    <Btn onClick={() => setSheet({ id: s.id, kind: 'match' })}>Сопоставить</Btn>
                    <Btn onClick={() => setSheet({ id: s.id, kind: 'create' })}>Создать позицию</Btn>
                    <Btn onClick={() => setSheet({ id: s.id, kind: 'keep' })}>{s.status === 'temp' ? 'Изменить примечание' : 'Оставить временной'}</Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <Card><Empty>Очередь нормализации пуста: все позиции поставщиков сопоставлены с номенклатурой.</Empty></Card>}
      {src && sheet?.kind === 'match' && <MatchSheet key={src.id} src={src} onClose={close} />}
      {src && sheet?.kind === 'create' && <MaterialForm key={src.id} source={src} onClose={close} />}
      {src && sheet?.kind === 'keep' && <KeepSheet key={src.id} src={src} onClose={close} />}
    </>
  );
}

/** Link a supplier's position to a normalised one. The person picks the position and states that the equivalence was checked. */
function MatchSheet({ src, onClose }: { src: SourcePosition; onClose: () => void }) {
  const d = useData();
  const [q, setQ] = useState('');
  const [pickId, setPickId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const picked = byId(d.materials, pickId);
  const s = q.trim().toLowerCase();
  const score = likeness(src);
  const list = d.materials
    .filter((m) => !s || [m.name, m.code ?? '', m.family ?? '', m.group].some((x) => x.toLowerCase().includes(s)))
    .sort((a, b) => score(b) - score(a) || ru(a.name, b.name));
  const save = () => {
    if (!picked) return;
    act.matchSource(src.id, picked.id);
    toast(`Сопоставлено: «${src.name}» → ${picked.name}`);
    onClose();
  };
  return (
    <Sheet open wide title="Сопоставление с номенклатурой" onClose={onClose} dirty={!!picked || checked}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!picked || !checked} onClick={save}>Сопоставить</Btn></>}>
      <div className="form">
        <div>
          <div style={{ fontWeight: 500 }}>{src.name}</div>
          <div className="muted" style={small}>{sourceLine(src)}{src.note ? ` · ${src.note}` : ''}</div>
        </div>
        {picked ? (
          <>
            <div>
              <div className="section-title" style={{ margin: '0 0 2px' }}>Позиция номенклатуры</div>
              <div className="list" style={{ margin: '0 -16px' }}>
                <Row wrap title={picked.name} sub={[picked.code, picked.pack ?? picked.unit, conv(picked)].filter(Boolean).join(' · ')}
                  side={<Btn small onClick={() => { setPickId(null); setChecked(false); }}>Выбрать другую</Btn>} />
              </div>
            </div>
            {picked.unit !== src.unit && (
              <Finding>
                Единицы различаются: у поставщика {src.unit}, в номенклатуре {picked.unit}. {PACKING_RULE}
              </Finding>
            )}
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ width: 20, height: 20, flex: 'none', accentColor: 'var(--primary)' }} />
              <span>Техническая эквивалентность проверена</span>
            </label>
            <p className="muted" style={small}>
              Состав, назначение и фасовка совпадают с позицией номенклатуры. Название и код поставщика останутся как есть, изменится только связь.
            </p>
          </>
        ) : (
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Название, код или семейство" label="Поиск позиции номенклатуры" />
            <div className="list" style={{ margin: '0 -16px' }}>
              {list.map((m) => (
                <Row key={m.id} wrap onClick={() => setPickId(m.id)} title={m.name}
                  sub={[m.code, familyOf(m), m.pack ?? m.unit].filter(Boolean).join(' · ')} meta={score(m) > 0 && !s ? 'похожа' : undefined} />
              ))}
              {!list.length && <Empty>Такой позиции в номенклатуре нет. Закройте окно и создайте позицию из исходной.</Empty>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Leave the position as a temporary record: the delivery stays registered under the supplier's name and no code is invented. */
function KeepSheet({ src, onClose }: { src: SourcePosition; onClose: () => void }) {
  const [note, setNote] = useState(src.note ?? '');
  const already = src.status === 'temp';
  const text = note.trim();
  const changed = text !== (src.note ?? '');
  const save = () => {
    act.keepSourceTemp(src.id, text || undefined);
    toast(already ? 'Примечание к временной записи сохранено' : 'Позиция оставлена временной записью');
    onClose();
  };
  return (
    <Sheet open title={already ? 'Временная запись' : 'Оставить временной записью'} onClose={onClose} dirty={changed}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={already && (!changed || !text)} onClick={save}>{already ? 'Сохранить примечание' : 'Оставить временной'}</Btn></>}>
      <div className="form">
        <div>
          <div style={{ fontWeight: 500 }}>{src.name}</div>
          <div className="muted" style={small}>{sourceLine(src)}</div>
        </div>
        <p className="muted">
          Позиция остаётся под названием из документа, без кода номенклатуры. В расчётах и в обеспечении потребностей она не участвует, пока её не сопоставят.
        </p>
        <Field label="Примечание" help="Почему позиция остаётся временной и что нужно для сопоставления.">
          <textarea className="textarea" aria-label="Примечание" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: ждём паспорт материала от поставщика" />
        </Field>
      </div>
    </Sheet>
  );
}

function ArticlesRef() {
  const d = useData();
  const [form, setForm] = useState(false);
  const list = (flow: Article['flow']) => d.articles.filter((a) => a.flow === flow).map((a) => {
    const ops = d.operations.filter((o) => o.articleId === a.id);
    return { a, n: ops.length, total: ops.reduce((s, o) => s + o.amount, 0) };
  });
  const block = (title: string, flow: Article['flow'], empty: string) => {
    const rows = list(flow);
    return (
      <Card title={title} note={count(rows.length, 'статья', 'статьи', 'статей')} flush>
        {rows.length ? (
          <List>
            {rows.map(({ a, n, total }) => (
              <Row key={a.id} title={a.name} sub={n ? count(n, 'операция', 'операции', 'операций') : 'Операций по статье ещё нет'}
                value={flow === 'in' && total ? `+${money(total)}` : money(total)} />
            ))}
          </List>
        ) : <Empty>{empty}</Empty>}
      </Card>
    );
  };
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <span className="grow muted" style={{ fontSize: 13 }}>Суммы посчитаны по всем операциям, которые отнесены на статью.</span>
        <Btn onClick={() => setForm(true)}>Добавить статью</Btn>
      </div>
      <div className="grid cols-2">
        {block('Статьи расходов', 'out', 'Статей расходов ещё нет.')}
        {block('Статьи поступлений', 'in', 'Статей поступлений ещё нет.')}
      </div>
      <ArticleForm open={form} onClose={() => setForm(false)} />
    </>
  );
}

function ArticleForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const [flow, setFlow] = useState<Article['flow']>('out');
  const [name, setName] = useState('');
  const clean = name.trim();
  const dup = !!clean && d.articles.some((a) => a.flow === flow && a.name.trim().toLowerCase() === clean.toLowerCase());
  const close = () => { setName(''); onClose(); };
  const save = () => {
    act.addArticle({ name: clean, flow });
    toast(`Статья добавлена: ${clean}`);
    close();
  };
  return (
    <Sheet open={open} title="Новая статья" onClose={close} dirty={!!clean}
      foot={<><Btn onClick={close}>Отмена</Btn><Btn kind="primary" disabled={!clean || dup} onClick={save}>Добавить</Btn></>}>
      <div className="form">
        <Seg wide value={flow} onChange={setFlow} options={[{ value: 'out', label: 'Расход' }, { value: 'in', label: 'Поступление' }]} />
        <Field label="Название" help={dup ? <span className="neg">Такая статья уже есть.</span> : 'Статья появится в формах операций и заявок.'}>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={flow === 'out' ? 'Например: Вывоз мусора' : 'Например: Возврат от поставщика'} />
        </Field>
      </div>
    </Sheet>
  );
}

function EntitiesRef() {
  const d = useData();
  const inTransit = transitTotal(d);
  return (
    <>
      <div className="grid cols-2">
        {d.directions.map((dir) => {
          const ents = d.entities.filter((e) => e.directionId === dir.id);
          return (
            <Card key={dir.id} title={dir.name} note={money(onHand(d, { directionId: dir.id }))} flush>
              {ents.length ? (
                <List>
                  {ents.flatMap((e) => {
                    const regs = registersIn(d, { entityId: e.id });
                    return [
                      <Row key={e.id} title={e.name} sub={count(regs.length, 'касса или счёт', 'кассы и счета', 'касс и счетов')} value={money(onHand(d, { entityId: e.id }))} money />,
                      ...regs.map((r) => (
                        <Row key={r.id} title={r.name} sub={r.kind === 'bank' ? 'Банковский счёт' : 'Наличная касса'} value={money(registerBalance(d, r.id))}
                          media={r.kind === 'bank' ? <Landmark size={18} color="var(--muted)" /> : <Banknote size={18} color="var(--muted)" />} />
                      )),
                    ];
                  })}
                </List>
              ) : <Empty>В этом направлении ещё нет юрлиц.</Empty>}
            </Card>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 13, maxWidth: '76ch' }}>
        Остатки считаются из операций. {inTransit > 0 ? `Ещё ${money(inTransit)} сейчас в пути между своими кассами и счетами и в остатки не входят. ` : ''}
        Состав юрлиц и счетов в демо не меняется.
      </p>
    </>
  );
}

interface Party { name: string; ops: Operation[]; inc: number; out: number; last: string }

function PartiesRef() {
  const d = useData();
  const wide = useWide();
  const [openName, setOpenName] = useState<string | null>(null);
  const map = new Map<string, Party>();
  for (const o of d.operations) {
    if (!o.counterparty || o.kind === 'transfer') continue;
    let p = map.get(o.counterparty);
    if (!p) { p = { name: o.counterparty, ops: [], inc: 0, out: 0, last: o.date }; map.set(o.counterparty, p); }
    p.ops.push(o);
    if (o.kind === 'in') p.inc += o.amount; else p.out += o.amount;
    if (o.date > p.last) p.last = o.date;
  }
  const rows = [...map.values()].sort((a, b) => b.inc + b.out - (a.inc + a.out) || ru(a.name, b.name));
  const open = openName ? map.get(openName) : undefined;
  const cols: Col<Party>[] = wide ? [
    { head: 'Контрагент', cell: (p) => p.name },
    { head: 'Операций', num: true, cell: (p) => p.ops.length },
    { head: 'Поступило', num: true, cell: (p) => (p.inc ? `+${money(p.inc)}` : dash) },
    { head: 'Оплачено', num: true, cell: (p) => (p.out ? `−${money(p.out)}` : dash) },
    { head: 'Последняя операция', cell: (p) => dShort(p.last) },
  ] : [
    { head: 'Контрагент', phone: 'title', cell: (p) => p.name },
    { head: 'Операций', phone: 'sub', cell: (p) => count(p.ops.length, 'операция', 'операции', 'операций') },
    { head: 'Последняя операция', phone: 'sub', cell: (p) => `последняя ${dShort(p.last)}` },
    { head: 'Оборот', phone: 'value', cell: (p) => (p.inc ? <span className="pos">+{money(p.inc)}</span> : `−${money(p.out)}`) },
    { head: 'Оплачено', phone: 'meta', cell: (p) => (p.inc && p.out ? `−${money(p.out)}` : null) },
  ];
  return (
    <>
      <Card title="Контрагенты" note="из денежных операций" flush>
        <DataTable cols={cols} rows={rows} keyOf={(p) => p.name} onRow={(p) => setOpenName(p.name)} empty="Операций с контрагентами ещё нет." />
      </Card>
      <Sheet open={!!open} wide title={open?.name ?? ''} onClose={() => setOpenName(null)}>
        {open && (
          <div className="stack">
            <p className="muted">
              {count(open.ops.length, 'операция', 'операции', 'операций')}: поступило {money(open.inc)}, оплачено {money(open.out)}.
            </p>
            <div className="list" style={{ margin: '0 -16px' }}>
              {[...open.ops].sort((a, b) => b.date.localeCompare(a.date)).map((o) => <OpRow key={o.id} op={o} />)}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

function WorkKindsRef() {
  const d = useData();
  return (
    <Card title="Виды работ" action={<More to="/admin/norms">Технологические карты</More>} flush>
      {d.norms.length ? (
        <List>
          {d.norms.map((n) => (
            <Row key={n.id} to={`/admin/norms?open=${n.id}`} title={n.work}
              sub={`Расчёт на 1 ${n.unit} · ${count(n.lines.length, 'материал', 'материала', 'материалов')}`}
              value={`версия ${n.version}`} meta={dShort(n.updated)} />
          ))}
        </List>
      ) : <Empty>Видов работ с нормами расхода ещё нет.</Empty>}
    </Card>
  );
}

/* ------------------------------------------------------------------ norms */
export function Norms() {
  const d = useData();
  const wide = useWide();
  const [sp, setSp] = useSearchParams();
  const open = byId(d.norms, sp.get('open'));
  const last = [...d.norms].sort((a, b) => b.updated.localeCompare(a.updated) || b.version - a.version)[0];
  const cols: Col<Norm>[] = [
    { head: 'Работа', phone: 'title', cell: (n) => (wide ? n.work : <Wrap>{n.work}</Wrap>) },
    { head: 'Единица', phone: 'sub', cell: (n) => (wide ? n.unit : `на 1 ${n.unit}`) },
    { head: 'Материалов', num: true, phone: 'sub', cell: (n) => (wide ? n.lines.length : count(n.lines.length, 'материал', 'материала', 'материалов')) },
    { head: 'Версия', num: true, phone: 'value', cell: (n) => (wide ? n.version : `версия ${n.version}`) },
    { head: 'Изменена', phone: 'meta', cell: (n) => (wide ? <Two a={dShort(n.updated)} b={n.by} /> : `${dShort(n.updated)}, ${n.by}`) },
  ];
  return (
    <Page title="Технологические карты"
      sub={last
        ? `${count(d.norms.length, 'карта', 'карты', 'карт')}, последней менялась «${last.work}»: версия ${last.version} от ${dShort(last.updated)}.`
        : 'Технологических карт ещё нет.'}>
      <Card title="Нормы расхода материалов" flush>
        <DataTable cols={cols} rows={d.norms} keyOf={(n) => n.id} onRow={(n) => setSp({ open: n.id }, { replace: true })} empty="Технологических карт ещё нет." />
      </Card>
      {open && <NormSheet key={open.id} norm={open} onClose={() => setSp({}, { replace: true })} />}
    </Page>
  );
}

/** One card: the norm per unit of work, a calculator for any volume, and the versions that came before. */
function NormSheet({ norm, onClose }: { norm: Norm; onClose: () => void }) {
  const d = useData();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(norm.lines.map((l) => [l.materialId, String(l.perUnit)])));
  const [volume, setVolume] = useState(10);
  const lines = norm.lines.map((l) => {
    const raw = parseFloat((draft[l.materialId] ?? '').replace(',', '.'));
    const perUnit = Number.isFinite(raw) ? Math.round(raw * 1000) / 1000 : NaN;
    const need = Number.isFinite(perUnit) ? Math.round(volume * perUnit * 100) / 100 : NaN;
    return { materialId: l.materialId, was: l.perUnit, perUnit, need, m: material(d, l.materialId) };
  });
  const valid = lines.every((l) => l.perUnit > 0);
  const changed = lines.some((l) => l.perUnit !== l.was);
  const cost = lines.reduce((s, l) => s + (Number.isFinite(l.need) ? l.need * l.m.price : 0), 0);
  const save = () => {
    act.saveNorm(norm.id, lines.map((l) => ({ materialId: l.materialId, perUnit: l.perUnit })));
    toast(`${norm.work}: сохранена версия ${norm.version + 1}`);
    onClose();
  };
  return (
    <Sheet open wide title={norm.work} onClose={onClose} dirty={changed}
      foot={<><Btn onClick={onClose}>Закрыть</Btn><Btn kind="primary" disabled={!valid || !changed} onClick={save}>Сохранить новую версию</Btn></>}>
      <div className="stack" style={{ gap: 16 }}>
        <p className="muted">Версия {norm.version} от {dFull(norm.updated)}, {norm.by}. Расход материалов на 1 {norm.unit} работ.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500 }}>Объём работ</span>
          <Stepper value={volume} onChange={setVolume} label={`Объём работ, ${norm.unit}`} />
          <span className="muted">{norm.unit}</span>
        </div>
        <div>
          <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <span>Норма на 1 {norm.unit}</span><span>Потребность на {qty(volume, norm.unit)}</span>
          </div>
          {lines.map((l, i) => (
            <div key={l.materialId} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--rule)' : undefined }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{l.m.name}</div>
                <div className="num nowrap" style={{ fontWeight: 600 }}>{Number.isFinite(l.need) ? `${dec(l.need)} ${l.m.unit}` : dash}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input className="input num" style={{ width: 104, flex: 'none' }} type="number" inputMode="decimal" min="0" step="0.01"
                  aria-label={`Норма: ${l.m.name}, ${l.m.unit} на 1 ${norm.unit}`} value={draft[l.materialId] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [l.materialId]: e.target.value })} />
                <span className="muted" style={{ flex: 1, minWidth: 0 }}>
                  {l.m.unit} на 1 {norm.unit}{Number.isFinite(l.perUnit) && l.perUnit !== l.was ? ` · было ${dec(l.was)}` : ''}
                </span>
              </div>
            </div>
          ))}
          {!valid && <p className="neg" style={{ fontSize: 13 }}>Норма по каждой позиции должна быть больше нуля.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTop: '1px solid var(--control)' }}>
            <span>Материалы на этот объём по ценам справочника</span>
            <span className="num nowrap" style={{ fontWeight: 600 }}>{money(cost)}</span>
          </div>
        </div>
        <div className="notice plain">
          Изменение нормы создаёт новую версию. Потребности, которые уже рассчитаны, не меняются.
        </div>
        <div>
          <div className="section-title" style={{ margin: '0 0 6px' }}>Прежние версии</div>
          {norm.previous.length ? norm.previous.map((p) => (
            <p key={p.version} style={{ marginBottom: 4 }}><span className="muted">Версия {p.version} от {dFull(p.updated)}:</span> {p.text}</p>
          )) : <p className="muted">Прежних версий нет: норма ещё не менялась.</p>}
        </div>
      </div>
    </Sheet>
  );
}
