// «+» for the foreman: start from the task, the right form opens with the object already known.
// Documents: every act, request and delivery in one list, each leading to its record.
import { useState } from 'react';
import { ClipboardList, Hammer, Ruler, TriangleAlert, Truck } from 'lucide-react';
import { useData, useUser } from '../data/store';
import { byId, documents } from '../data/select';
import { Card, Chips, Choice, Empty, List, Page, Pill, Row, Sheet, useSticky } from '../ui/kit';
import { dRel } from '../lib/format';
import { IssueSheet } from './extras';

export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const u = useUser();
  const [issue, setIssue] = useState(false);
  const o = byId(d.objects, d.session.objectId) ?? d.objects.find((x) => u.objectIds?.includes(x.id));
  const room = byId(d.rooms, d.session.roomId);
  const due = o ? d.deliveries.filter((x) => x.objectId === o.id && x.status === 'expected' && x.eta <= d.today) : [];
  return (
    <>
      <Sheet open={open} title="Создать" onClose={onClose}>
        <Choice items={[
          { key: 'need', icon: <ClipboardList size={22} />, title: 'Заказать материал', sub: d.session.needDraft?.objectId === o?.id ? 'Продолжить начатую заявку' : undefined, to: '/foreman/needs/new' },
          { key: 'get', icon: <Truck size={22} />, title: 'Принять поставку', sub: due.length ? `Ждёт: ${due.map((x) => `№ ${x.num}`).join(', ')}` : 'Сейчас поставок нет', to: due.length === 1 ? `/foreman/deliveries/${due[0].id}` : '/foreman/materials?tab=deliveries' },
          { key: 'work', icon: <Hammer size={22} />, title: 'Отметить сделанную работу', to: '/foreman/works' },
          { key: 'measure', icon: <Ruler size={22} />, title: 'Сделать замер', to: '/foreman/geometry' },
          { key: 'issue', icon: <TriangleAlert size={22} />, title: 'Сообщить о проблеме', onClick: () => { onClose(); setIssue(true); } },
        ]} />
      </Sheet>
      {o && (
        <IssueSheet open={issue} onClose={() => setIssue(false)}
          ctx={{ objectId: o.id, place: [d.session.floor ?? room?.floor, room?.name].filter(Boolean).join(', '), source: room ? { kind: 'room', id: room.id, label: `${room.name}, ${room.floor}` } : { kind: 'object', id: o.id, label: o.name } }} />
      )}
    </>
  );
}

export function Documents() {
  const d = useData();
  const u = useUser();
  const all = documents(d, u);
  const kinds = [...new Set(all.map((x) => x.kind))];
  const [kind, setKind] = useSticky('docs.kind', 'all');
  const [objectId, setObjectId] = useSticky('docs.object', 'all');
  const objects = d.objects.filter((o) => all.some((x) => x.objectId === o.id));
  const list = all.filter((x) => (kind === 'all' || x.kind === kind) && (objectId === 'all' || x.objectId === objectId));
  return (
    <Page title="Документы" path={u.role === 'foreman' ? [{ label: 'Объект', to: '/foreman/object' }, { label: 'Документы' }] : undefined}>
      <Chips value={kind} onChange={setKind} options={[{ value: 'all', label: 'Все' }, ...kinds.map((k) => ({ value: k, label: k }))]} />
      {objects.length > 1 && (
        <Chips value={objectId} onChange={setObjectId} options={[{ value: 'all', label: 'Все объекты' }, ...objects.map((o) => ({ value: o.id, label: o.name }))]} />
      )}
      <Card flush>
        {list.length ? (
          <List>
            {list.map((x) => (
              <Row key={x.kind + x.id} to={x.to} wrap title={x.title} sub={`${x.kind} · ${x.sub}`} meta={dRel(x.date, d.today)} value={<Pill tone={x.tone}>{x.status}</Pill>} />
            ))}
          </List>
        ) : <div className="card-body"><Empty>Документов нет.</Empty></div>}
      </Card>
    </Page>
  );
}

