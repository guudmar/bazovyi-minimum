// Domain model of the demo. Everything the screens show is computed from these rows.

export type RoleId = 'foreman' | 'owner' | 'manager' | 'supplier' | 'admin';

export interface User {
  id: string;
  name: string;
  role: RoleId;
  title: string;
  objectIds?: string[];
  /** hue (0-360) for the person's pale avatar tint; identity only, never data */
  hue: number;
}

export interface Direction { id: string; name: string }
export interface Entity { id: string; name: string; short: string; directionId: string }
export interface Register {
  id: string;
  name: string;
  kind: 'bank' | 'cash';
  entityId: string;
  opening: number;
}
export interface Article { id: string; name: string; flow: 'in' | 'out' }

export interface Change { at: string; by: string; text: string }

export interface Operation {
  id: string;
  date: string;
  kind: 'in' | 'out' | 'transfer';
  amount: number;
  registerId: string;
  /** transfers only: where the money goes */
  toRegisterId?: string;
  articleId?: string;
  objectId?: string;
  counterparty?: string;
  comment?: string;
  authorId: string;
  /** transfers only: sent and waiting, or confirmed by the receiving side */
  transit?: 'sent' | 'received';
  receivedDate?: string;
  /** bank registers only: matched to the bank statement or not yet */
  bank?: 'matched' | 'unmatched';
  requestId?: string;
  history: Change[];
}

export interface BuildObject {
  id: string;
  name: string;
  address: string;
  customer: string;
  contract: string;
  status: 'active' | 'paused' | 'done';
  stage: string;
  foremanId: string;
  entityId: string;
  contractSum: number;
  planCost: number;
  start: string;
  finish: string;
}

export interface Opening { kind: 'door' | 'window'; w: number; h: number }
export interface Room {
  id: string;
  objectId: string;
  floor: string;
  name: string;
  length: number;
  width: number;
  height: number;
  openings: Opening[];
  /** deviation of walls/floor in mm, as measured */
  deviation?: number;
  note?: string;
  photos: number;
  measuredAt: string;
  measuredBy: string;
  history: Change[];
}
export interface GeometryAct { id: string; num: number; objectId: string; date: string; by: string; rooms: number; floorArea: number }

export interface WorkFact { date: string; qty: number; by: string; note?: string; photos: number }
export interface Work {
  id: string;
  objectId: string;
  roomId?: string;
  name: string;
  unit: string;
  plan: number;
  /** accepted by the project manager, never more than the sum of facts */
  accepted: number;
  deadline: string;
  facts: WorkFact[];
}
export interface AvrLine { workId: string; qty: number; accepted?: number }
export interface Avr {
  id: string;
  num: number;
  objectId: string;
  date: string;
  by: string;
  status: 'review' | 'accepted' | 'returned';
  lines: AvrLine[];
  note?: string;
}

export interface Material { id: string; name: string; unit: string; group: string; price: number }
/** Trade warehouse. "Expected" is derived from the open trade orders, not stored. */
export interface StockItem { materialId: string; total: number; reserved: number; place: string }

export type Route = 'stock' | 'order' | 'supplier' | 'clarify';
/**
 * reserved: held on the trade warehouse · ordered: ordered by the trade direction ·
 * handed: passed to the supplier (purchase in work) · shipped: on its way to the site ·
 * received: confirmed by the foreman · clarify: waiting for the foreman's answer
 */
export type PartStatus = 'reserved' | 'ordered' | 'handed' | 'shipped' | 'received' | 'clarify';
export interface NeedPart {
  id: string;
  route: Route;
  qty: number;
  status: PartStatus;
  eta?: string;
  received?: number;
}
export interface NeedLine {
  id: string;
  materialId: string;
  qty: number;
  wantDate: string;
  comment?: string;
  parts: NeedPart[];
}
export interface Need {
  id: string;
  num: number;
  objectId: string;
  date: string;
  authorId: string;
  comment?: string;
  urgent?: boolean;
  lines: NeedLine[];
  /** a question from the manager and the foreman's answer */
  question?: { text: string; by: string; answer?: string };
}

export interface TradeOrder {
  id: string;
  num: number;
  materialId: string;
  qty: number;
  supplier: string;
  date: string;
  eta: string;
  status: 'ordered' | 'delayed' | 'arrived';
  needId?: string;
  lineId?: string;
  partId?: string;
  objectId?: string;
}

export interface Purchase {
  id: string;
  num: number;
  needId: string;
  lineId: string;
  partId: string;
  objectId: string;
  materialId: string;
  qty: number;
  wantDate: string;
  reason: string;
  priority: 'normal' | 'high';
  status: 'new' | 'sourcing' | 'ordered' | 'shipped' | 'received';
  supplier?: string;
  price?: number;
  terms?: string;
  eta?: string;
  invoice?: boolean;
  alt?: string;
  orderDate?: string;
  history: Change[];
}

export interface DeliveryLine {
  materialId: string;
  qty: number;
  received?: number;
  issue?: 'short' | 'wrong' | 'damaged';
  needId?: string;
  lineId?: string;
  partId?: string;
}
export interface Delivery {
  id: string;
  num: number;
  objectId: string;
  source: string;
  eta: string;
  status: 'expected' | 'received' | 'problem';
  lines: DeliveryLine[];
  receivedAt?: string;
  comment?: string;
  photos?: number;
}

export interface SiteMove {
  id: string;
  objectId: string;
  materialId: string;
  date: string;
  kind: 'receive' | 'move' | 'issue' | 'use' | 'return' | 'loss';
  qty: number;
  note?: string;
  by: string;
}

export type IssueKind = 'defect' | 'rework' | 'loss' | 'damage' | 'geometry' | 'delay' | 'blocker';
export interface Issue {
  id: string;
  objectId: string;
  place: string;
  kind: IssueKind;
  text: string;
  date: string;
  status: 'open' | 'work' | 'done';
  photos: number;
  by: string;
}

export type RequestStatus = 'pending' | 'approved' | 'noted' | 'clarify' | 'rejected' | 'paid';
export interface Decision { at: string; by: string; action: string; note?: string }
export interface MoneyRequest {
  id: string;
  num: number;
  date: string;
  authorId: string;
  amount: number;
  basis: string;
  articleId: string;
  entityId: string;
  objectId?: string;
  due: string;
  status: RequestStatus;
  decisions: Decision[];
  purchaseId?: string;
}

export interface PlanItem {
  id: string;
  date: string;
  flow: 'in' | 'out';
  amount: number;
  title: string;
  entityId: string;
  /** plan: expected · approved: agreed and waiting for payment · paid: done */
  status: 'plan' | 'approved' | 'paid';
  requestId?: string;
  regular?: boolean;
  objectId?: string;
}

export interface NormLine { materialId: string; perUnit: number }
export interface Norm {
  id: string;
  work: string;
  unit: string;
  lines: NormLine[];
  version: number;
  updated: string;
  by: string;
  previous: { version: number; updated: string; text: string }[];
}

export type AuditArea = 'Деньги' | 'Заявки' | 'ТМЦ' | 'Нормативы' | 'АВР' | 'Геометрия' | 'Доступ' | 'Справочники';
export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  area: AuditArea;
  text: string;
  before?: string;
  after?: string;
}

export interface Data {
  /** the day the demo data was generated for; "today" everywhere in the app */
  today: string;
  seq: number;
  users: User[];
  directions: Direction[];
  entities: Entity[];
  registers: Register[];
  articles: Article[];
  operations: Operation[];
  objects: BuildObject[];
  rooms: Room[];
  acts: GeometryAct[];
  works: Work[];
  avrs: Avr[];
  materials: Material[];
  stock: StockItem[];
  needs: Need[];
  tradeOrders: TradeOrder[];
  purchases: Purchase[];
  deliveries: Delivery[];
  siteMoves: SiteMove[];
  issues: Issue[];
  requests: MoneyRequest[];
  plan: PlanItem[];
  norms: Norm[];
  audit: AuditEntry[];
}

export interface Session {
  userId: string | null;
  /** the object a foreman is working on */
  objectId: string | null;
}
