// «Справочники» and «Технологические карты»: the lists every other screen leans on.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, Landmark } from 'lucide-react';
import { act, useData } from '../../data/store';
import { byId, material, onHand, registerBalance, registersIn, transitTotal } from '../../data/select';
import { AmountInput, Btn, Card, DataTable, Empty, Field, List, More, Page, Row, Seg, Sheet, Stepper, Tabs, Two, toast, useWide, type Col } from '../../ui/kit';
import { OpRow } from '../../shared/money';
import { count, dFull, dShort, money, qty } from '../../lib/format';
import type { Article, Material, Norm, Operation } from '../../data/types';
import { Wrap, dash, dec } from './rest-bits';

const ru = (a: string, b: string): number => a.localeCompare(b, 'ru');

/* ------------------------------------------------------------- references */
type RefTab = 'materials' | 'articles' | 'entities' | 'parties' | 'works';

export function Refs() {
  const d = useData();
  const [tab, setTab] = useState<RefTab>('materials');
  const parties = new Set(d.operations.map((o) => o.counterparty).filter(Boolean)).size;
  return (
    <Page title="Справочники"
      sub={`В справочниках ${count(d.materials.length, 'материал', 'материала', 'материалов')}, ${count(d.articles.length, 'статья', 'статьи', 'статей')}, ${count(d.registers.length, 'касса или счёт', 'кассы и счета', 'касс и счетов')} и ${count(d.norms.length, 'вид работ', 'вида работ', 'видов работ')}.`}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'materials', label: 'Материалы', count: d.materials.length },
        { value: 'articles', label: 'Статьи', count: d.articles.length },
        { value: 'entities', label: 'Юрлица и счета', count: d.entities.length },
        { value: 'parties', label: 'Контрагенты', count: parties },
        { value: 'works', label: 'Виды работ', count: d.norms.length },
      ]} />
      {tab === 'materials' && <MaterialsRef />}
      {tab === 'articles' && <ArticlesRef />}
      {tab === 'entities' && <EntitiesRef />}
      {tab === 'parties' && <PartiesRef />}
      {tab === 'works' && <WorkKindsRef />}
    </Page>
  );
}

function MaterialsRef() {
  const d = useData();
  const wide = useWide();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const s = q.trim().toLowerCase();
  const rows = d.materials
    .filter((m) => !s || m.name.toLowerCase().includes(s) || m.group.toLowerCase().includes(s))
    .sort((a, b) => ru(a.group, b.group) || ru(a.name, b.name));
  const cols: Col<Material>[] = [
    { head: 'Название', phone: 'title', cell: (m) => (wide ? m.name : <Wrap>{m.name}</Wrap>) },
    { head: 'Группа', phone: 'sub', cell: (m) => m.group },
    { head: 'Ед.', phone: 'meta', cell: (m) => (wide ? m.unit : `за ${m.unit}`) },
    { head: 'Цена', num: true, phone: 'value', cell: (m) => money(m.price) },
  ];
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <input className="input" type="search" placeholder="Найти материал или группу" aria-label="Поиск по материалам" value={q} onChange={(e) => setQ(e.target.value)} />
        <Btn onClick={() => setForm(true)}>Добавить материал</Btn>
      </div>
      <Card title="Материалы" note={s ? `найдено ${rows.length} из ${d.materials.length}` : count(new Set(d.materials.map((m) => m.group)).size, 'группа', 'группы', 'групп')} flush>
        <DataTable cols={cols} rows={rows} keyOf={(m) => m.id} empty={s ? `По запросу «${q.trim()}» материалов нет.` : 'В справочнике ещё нет материалов.'} />
      </Card>
      <MaterialForm open={form} onClose={() => setForm(false)} />
    </>
  );
}

function MaterialForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const blank = { name: '', group: '', unit: '', price: 0 };
  const [f, setF] = useState(blank);
  const set = (p: Partial<typeof blank>) => setF({ ...f, ...p });
  const groups = [...new Set(d.materials.map((m) => m.group))].sort(ru);
  const units = [...new Set(d.materials.map((m) => m.unit))].sort(ru);
  const name = f.name.trim();
  const dup = !!name && d.materials.some((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  const ok = !!name && !!f.group.trim() && !!f.unit.trim() && f.price > 0 && !dup;
  const save = () => {
    act.addMaterial({ name, group: f.group.trim(), unit: f.unit.trim(), price: f.price });
    toast(`Материал добавлен: ${name}`);
    setF(blank);
    onClose();
  };
  return (
    <Sheet open={open} title="Новый материал" onClose={onClose}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!ok} onClick={save}>Добавить</Btn></>}>
      <div className="form">
        <Field label="Название" help={dup ? <span className="neg">Такой материал уже есть в справочнике.</span> : 'С фасовкой или размером, как в накладной.'}>
          <input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Например: Штукатурка гипсовая, 30 кг" />
        </Field>
        <div className="form-2">
          <Field label="Группа">
            <input className="input" list="ref-material-groups" value={f.group} onChange={(e) => set({ group: e.target.value })} placeholder="Сухие смеси" />
            <datalist id="ref-material-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </Field>
          <Field label="Единица">
            <input className="input" list="ref-material-units" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="меш" />
            <datalist id="ref-material-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
        </div>
        <Field label="Цена за единицу"><AmountInput value={f.price} onChange={(price) => set({ price })} /></Field>
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
  const save = () => {
    act.addArticle({ name: clean, flow });
    toast(`Статья добавлена: ${clean}`);
    setName('');
    onClose();
  };
  return (
    <Sheet open={open} title="Новая статья" onClose={onClose}
      foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" disabled={!clean || dup} onClick={save}>Добавить</Btn></>}>
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
    <Sheet open wide title={norm.work} onClose={onClose}
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
