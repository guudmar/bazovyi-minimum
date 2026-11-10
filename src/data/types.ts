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

/** A floor of an object. Rooms point to it by name; the act of geometry is formed for a whole floor. */
export interface Floor { id: string; objectId: string; name: string }
/** How a measurement was taken. Manual entry is always a full option; a device reading is checked by the person. */
export type MeasureMethod = 'manual' | 'laser' | 'phone';
/** Niches, ledges, door and window reveals and other surfaces measured apart from the four walls. */
export interface SurfaceElement { id: string; kind: 'niche' | 'ledge' | 'slope' | 'other'; name: string; length: number; height: number; count: number }
export interface Zone { id: string; name: string; purpose?: string; area: number }
/** An unevenness: where and how many millimetres. */
export interface Unevenness { id: string; place: string; mm: number }

/**
 * A version of a floor's geometry. draft: being filled · review: sent for checking ·
 * confirmed: may be used as the basis for calculations · replaced: superseded, kept in the history.
 */
export type GeoStatus = 'draft' | 'review' | 'confirmed' | 'replaced';
export interface GeoTotals { rooms: number; floor: number; walls: number; ceiling: number; perimeter: number }
export interface GeoVersion {
  id: string;
  objectId: string;
  floor: string;
  num: number;
  status: GeoStatus;
  createdAt: string;
  by: string;
  /** why a confirmed version is being changed */
  reason?: string;
  sentAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  /** the reviewer's note when the version is returned */
  note?: string;
  /** totals fixed when the version is sent for checking */
  totals?: GeoTotals;
  /** the rooms exactly as they were measured in this version: calculations use them, not later edits */
  snapshot?: Room[];
  changes: Change[];
}

export interface Room {
  id: string;
  objectId: string;
  floor: string;
  name: string;
  purpose?: string;
  method?: MeasureMethod;
  elements?: SurfaceElement[];
  zones?: Zone[];
  uneven?: Unevenness[];
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
export interface GeometryAct { id: string; num: number; objectId: string; date: string; by: string; rooms: number; floorArea: number; floor?: string; versionId?: string }

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
  /** the technological card the work is calculated by */
  normId?: string;
  /** the crew or the person responsible */
  crew?: string;
  /** the version of the floor geometry the planned volume is based on */
  geoVersionId?: string;
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

export interface Material {
  id: string;
  name: string;
  unit: string;
  group: string;
  price: number;
  /** internal code of the normalised position */
  code?: string;
  /** the parent family: «Штукатурка гипсовая» is a family, a concrete mix is a position */
  family?: string;
  pack?: string;
  /** unit the material is applied in, and how many of them are in one storage unit */
  useUnit?: string;
  k?: number;
}
/**
 * A position as it is written in a supplier's document. Its code and name are never rewritten.
 * matched: linked to a normalised position after its technical equivalence was checked ·
 * queue: waits for normalisation · temp: registered at receipt as a temporary record.
 */
export interface SourcePosition {
  id: string;
  supplier: string;
  code?: string;
  name: string;
  unit: string;
  materialId?: string;
  status: 'matched' | 'queue' | 'temp';
  seenAt: string;
  deliveryId?: string;
  qty?: number;
  note?: string;
}
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
  /** the place the need was created for */
  floor?: string;
  roomId?: string;
  /** what the quantities were calculated from */
  basis?: { workId?: string; normId?: string; normVersion?: number; geoVersionId?: string; volume?: number };
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
  /** the name and the code as written in the shipping document, for the physical check */
  sourceName?: string;
  sourceCode?: string;
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
  /** where on the site the materials were put */
  place?: string;
  /** positions that arrived and are not in the order: registered as temporary records, never given an invented code */
  extras?: { id: string; sourceName: string; sourceCode?: string; qty: number; unit: string }[];
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
  /** storage place on the site */
  place?: string;
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
  /** the record the remark was created from */
  source?: { kind: 'room' | 'work' | 'delivery' | 'need' | 'object'; id: string; label: string };
  due?: string;
  responsible?: string;
  history?: Change[];
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
  /** the accepted act of works the request is based on */
  avrId?: string;
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
  /** the surface of a room the volume of the work is taken from */
  base?: 'walls' | 'floor' | 'ceiling';
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
  floors: Floor[];
  geoVersions: GeoVersion[];
  rooms: Room[];
  acts: GeometryAct[];
  sources: SourcePosition[];
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
  /** the place inside the object: kept while the person moves between the modules */
  floor?: string;
  roomId?: string;
  /** an unsent need: the form is saved as it is typed, so nothing is lost when the person leaves it */
  needDraft?: NeedDraft;
}
export interface NeedDraft {
  objectId: string;
  lines: { materialId: string; qty: number; wantDate: string; comment: string }[];
  comment: string;
  urgent: boolean;
  floor?: string;
  roomId?: string;
  basis?: Need['basis'];
}
