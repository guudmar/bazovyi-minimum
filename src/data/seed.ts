// Demo data. Every name, company and amount here is invented.
// Dates are written as offsets from "today", so the demo always looks current.
import { addDays } from '../lib/format';
import { enrich } from './seed-extra';
import type {
  Data, Operation, Need, NeedPart, Delivery, SiteMove, Work, Room, MoneyRequest, PlanItem, Purchase, TradeOrder,
} from './types';

type OpTuple = [
  day: number, kind: Operation['kind'], amount: number, registerId: string, articleId: string | null,
  objectId: string | null, counterparty: string | null, comment: string, authorId: string,
  to?: string, received?: number | null, bank?: Operation['bank'],
];

export function makeSeed(today: string): Data {
  const d = (n: number) => addDays(today, n);
  const part = (id: string, route: NeedPart['route'], qty: number, status: NeedPart['status'], eta?: number, received?: number): NeedPart =>
    ({ id, route, qty, status, eta: eta === undefined ? undefined : d(eta), received });

  const ops: OpTuple[] = [
    [-55, 'in', 850000, 'r1', 'a-in1', 'o1', 'Архипов Д. С.', 'Аванс по договору, этап 1', 'u-admin'],
    [-54, 'out', 310000, 'r1', 'a-out1', 'o1', 'СтройХим', 'Смеси и профиль', 'u-admin'],
    [-53, 'out', 180000, 'r2', 'a-out2', 'o1', 'Бригада Сафина', 'Оплата за демонтаж', 'u-admin'],
    [-52, 'in', 240000, 'r5', 'a-in2', null, 'Розничные продажи', 'Выручка за неделю', 'u-admin'],
    [-51, 'out', 96000, 'r5', 'a-out5', null, 'ТК «Маршрут»', 'Доставка поставки на склад', 'u-admin'],
    [-50, 'transfer', 200000, 'r1', null, null, null, 'Пополнение кассы офиса', 'u-admin', 'r2', -50],
    [-48, 'in', 500000, 'r4', 'a-in1', 'o2', 'Никитина Е. В.', 'Аванс по договору', 'u-admin'],
    [-47, 'out', 220000, 'r4', 'a-out1', 'o2', 'Электро-Опт', 'Кабель и автоматы', 'u-admin'],
    [-46, 'out', 64000, 'r1', 'a-out7', null, 'Арендодатель офиса', 'Аренда офиса', 'u-admin'],
    [-45, 'in', 310000, 'r5', 'a-in2', null, 'ООО «Ремстрой»', 'Оптовая отгрузка', 'u-admin'],
    [-44, 'out', 260000, 'r5', 'a-out1', null, 'Гипс-Трейд', 'Закупка ГКЛ на склад', 'u-admin'],
    [-41, 'in', 1100000, 'r1', 'a-in1', 'o1', 'Архипов Д. С.', 'Этап 2', 'u-admin'],
    [-40, 'out', 420000, 'r1', 'a-out3', 'o1', 'ИП Белоусов', 'Кровельные работы', 'u-admin'],
    [-39, 'out', 275000, 'r2', 'a-out2', 'o1', 'Бригада Сафина', 'Черновые работы', 'u-admin'],
    [-38, 'out', 118000, 'r1', 'a-out4', 'o1', 'Техпрокат', 'Аренда лесов', 'u-admin'],
    [-37, 'in', 205000, 'r6', 'a-in2', null, 'Розничные продажи', 'Выручка за неделю', 'u-manager'],
    [-36, 'transfer', 150000, 'r6', null, null, null, 'Инкассация в банк', 'u-manager', 'r5', -35],
    [-34, 'in', 600000, 'r1', 'a-in1', 'o3', 'ООО «Полюс-Логистик»', 'Аванс по договору', 'u-admin'],
    [-33, 'out', 340000, 'r1', 'a-out6', null, 'ФНС', 'Налоги и взносы', 'u-admin'],
    [-32, 'out', 150000, 'r7', 'a-out8', null, 'Громов В. А.', 'Выплата собственнику', 'u-owner1'],
    [-31, 'out', 87000, 'r4', 'a-out2', 'o2', 'Электрик Юсупов', 'Монтаж щитка', 'u-admin'],
    [-29, 'in', 280000, 'r5', 'a-in2', null, 'ООО «Домстрой-М»', 'Оптовая отгрузка', 'u-admin'],
    [-27, 'out', 390000, 'r5', 'a-out1', null, 'СтройХим', 'Закупка смесей на склад', 'u-admin'],
    [-26, 'in', 400000, 'r4', 'a-in1', 'o2', 'Никитина Е. В.', 'Этап 1', 'u-admin'],
    [-25, 'out', 192000, 'r1', 'a-out1', 'o1', 'ТеплоМаркет', 'Радиаторы, предоплата', 'u-admin'],
    [-24, 'out', 260000, 'r2', 'a-out2', 'o1', 'Бригада Сафина', 'Стяжка и штукатурка', 'u-admin'],
    [-22, 'transfer', 300000, 'r1', null, null, null, 'Пополнение кассы офиса', 'u-admin', 'r2', -22],
    [-20, 'in', 900000, 'r1', 'a-in1', 'o1', 'Архипов Д. С.', 'Этап 3, часть 1', 'u-admin'],
    [-19, 'out', 145000, 'r1', 'a-out5', 'o1', 'ТК «Маршрут»', 'Доставка материалов', 'u-admin'],
    [-18, 'in', 230000, 'r6', 'a-in2', null, 'Розничные продажи', 'Выручка за неделю', 'u-manager'],
    [-17, 'out', 70000, 'r3', 'a-out1', 'o1', 'Хозтовары', 'Расходники на объект', 'u-foreman1'],
    [-15, 'out', 410000, 'r1', 'a-out3', 'o3', 'ИП Корнеев', 'Демонтаж', 'u-admin'],
    [-13, 'in', 350000, 'r5', 'a-in2', null, 'ООО «Ремстрой»', 'Оптовая отгрузка', 'u-admin'],
    [-12, 'out', 64000, 'r1', 'a-out7', null, 'Арендодатель офиса', 'Аренда офиса', 'u-admin'],
    [-11, 'out', 240000, 'r2', 'a-out2', 'o2', 'Бригада Юсупова', 'Электрика, этап 1', 'u-admin'],
    [-9, 'in', 700000, 'r1', 'a-in1', 'o3', 'ООО «Полюс-Логистик»', 'Этап 1', 'u-admin'],
    [-8, 'out', 54000, 'r1', 'a-out5', 'o1', 'Манипулятор-Сервис', 'Доставка манипулятором', 'u-admin'],
    [-7, 'transfer', 250000, 'r1', null, null, null, 'Пополнение кассы офиса', 'u-admin', 'r2', -7],
    [-7, 'out', 365000, 'r5', 'a-out1', null, 'Паркет-Опт', 'Ламинат, предоплата', 'u-admin'],
    [-6, 'in', 260000, 'r6', 'a-in2', null, 'Розничные продажи', 'Выручка за неделю', 'u-manager'],
    [-6, 'transfer', 180000, 'r6', null, null, null, 'Инкассация в банк', 'u-manager', 'r5', -5],
    [-5, 'out', 300000, 'r2', 'a-out2', 'o1', 'Бригада Сафина', 'Штукатурка', 'u-admin'],
    [-4, 'in', 500000, 'r7', 'a-in3', null, 'Данилов О. Н.', 'Взнос собственника', 'u-owner2'],
    [-3, 'transfer', 400000, 'r1', null, null, null, 'Перевод на ИП для расчётов по Садовой', 'u-admin', 'r4', null],
    [-3, 'out', 128000, 'r4', 'a-out1', 'o2', 'Сантех-Комплект', 'Трубы и фитинги', 'u-admin'],
    [-2, 'in', 450000, 'r1', 'a-in1', 'o1', 'Архипов Д. С.', 'Этап 3, часть 2', 'u-admin', undefined, undefined, 'unmatched'],
    [-2, 'out', 90000, 'r7', 'a-out8', null, 'Миронов П. К.', 'Выплата собственнику', 'u-owner3'],
    [-1, 'transfer', 80000, 'r2', null, null, null, 'Пополнение кассы объекта', 'u-admin', 'r3', null],
    [-1, 'out', 76000, 'r1', 'a-out4', 'o3', 'Техпрокат', 'Аренда отбойных молотков', 'u-admin', undefined, undefined, 'unmatched'],
    [0, 'in', 185000, 'r6', 'a-in2', null, 'Розничные продажи', 'Выручка, начало недели', 'u-manager'],
    [0, 'out', 42000, 'r3', 'a-out1', 'o1', 'Хозтовары', 'Крепёж и расходники', 'u-foreman1'],
  ];
  const bankRegs = new Set(['r1', 'r4', 'r5']);
  const operations: Operation[] = ops.map((t, i) => {
    const [day, kind, amount, registerId, articleId, objectId, counterparty, comment, authorId, to, received, bank] = t;
    const op: Operation = {
      id: `op${i + 1}`, date: d(day), kind, amount, registerId, authorId, comment, history: [],
      articleId: articleId ?? undefined, objectId: objectId ?? undefined, counterparty: counterparty ?? undefined,
    };
    if (kind === 'transfer') {
      op.toRegisterId = to;
      op.transit = received === null || received === undefined ? 'sent' : 'received';
      if (typeof received === 'number') op.receivedDate = d(received);
    }
    if (bankRegs.has(registerId)) op.bank = bank ?? 'matched';
    return op;
  });
  operations[36].requestId = 'rq39';
  operations[24].history = [
    { at: d(-24), by: 'Марина Белова', text: 'Статья изменена: «Оплата труда» → «Материалы»' },
  ];

  const rooms: Room[] = [
    ['rm1', 'o1', '1 этаж', 'Гостиная', 6.2, 4.8, 2.75, [['window', 1.8, 1.5], ['window', 1.8, 1.5], ['door', 0.9, 2.1]], 18, 'Стена у окна завалена внутрь', 4, -60],
    ['rm2', 'o1', '1 этаж', 'Кухня', 4.1, 3.6, 2.75, [['window', 1.4, 1.5], ['door', 0.8, 2.1]], 6, undefined, 2, -60],
    ['rm3', 'o1', '1 этаж', 'Санузел', 2.4, 1.9, 2.7, [['door', 0.7, 2.1]], 4, undefined, 1, -60],
    ['rm4', 'o1', '2 этаж', 'Спальня', 4.5, 3.8, 2.6, [['window', 1.4, 1.4], ['door', 0.8, 2.1]], 9, undefined, 2, -58],
    ['rm5', 'o1', '2 этаж', 'Детская', 3.9, 3.4, 2.6, [['window', 1.4, 1.4], ['door', 0.8, 2.1]], 5, undefined, 2, -58],
    ['rm6', 'o2', '7 этаж', 'Комната', 5.1, 3.5, 2.65, [['window', 2.1, 1.5], ['door', 0.8, 2.1]], 7, undefined, 3, -30],
    ['rm7', 'o2', '7 этаж', 'Кухня', 3.2, 2.9, 2.65, [['window', 1.4, 1.5], ['door', 0.8, 2.1]], 12, 'Пол с уклоном к окну', 2, -30],
    ['rm8', 'o2', '7 этаж', 'Санузел', 1.7, 1.5, 2.6, [['door', 0.7, 2.1]], 3, undefined, 1, -30],
  ].map((r) => {
    const [id, objectId, floor, name, length, width, height, openings, deviation, note, photos, day] = r as [
      string, string, string, string, number, number, number, [string, number, number][], number, string | undefined, number, number,
    ];
    return {
      id, objectId, floor, name, length, width, height, deviation, note, photos,
      openings: openings.map(([kind, w, h]) => ({ kind: kind as 'door' | 'window', w, h })),
      measuredAt: d(day), measuredBy: 'Игорь Савельев',
      history: [{ at: d(day), by: 'Игорь Савельев', text: 'Первичный замер' }],
    };
  });
  rooms[0].history.push({ at: d(-3), by: 'Игорь Савельев', text: 'Отклонение стены: 12 мм → 18 мм после повторного замера' });

  const fact = (day: number, q: number, photos = 1, note?: string) => ({ date: d(day), qty: q, by: 'Игорь Савельев', photos, note });
  const works: Work[] = [
    { id: 'w1', objectId: 'o1', roomId: 'rm1', name: 'Стяжка пола', unit: 'м²', plan: 29.8, accepted: 29.8, deadline: d(-9), facts: [fact(-14, 18), fact(-11, 11.8, 2)] },
    { id: 'w2', objectId: 'o1', roomId: 'rm1', name: 'Штукатурка стен', unit: 'м²', plan: 58, accepted: 0, deadline: d(4), facts: [fact(-4, 16), fact(-2, 20, 2)] },
    { id: 'w3', objectId: 'o1', roomId: 'rm2', name: 'Монтаж каркаса потолка', unit: 'м²', plan: 14.8, accepted: 0, deadline: d(-1), facts: [fact(-3, 14.8, 3)] },
    { id: 'w4', objectId: 'o1', roomId: 'rm4', name: 'Обшивка стен ГКЛ', unit: 'м²', plan: 42, accepted: 0, deadline: d(6), facts: [] },
    { id: 'w5', objectId: 'o1', roomId: 'rm3', name: 'Укладка керамогранита', unit: 'м²', plan: 4.6, accepted: 0, deadline: d(10), facts: [] },
    { id: 'w6', objectId: 'o1', name: 'Монтаж радиаторов', unit: 'шт', plan: 6, accepted: 4, deadline: d(2), facts: [fact(-12, 4, 2)] },
    { id: 'w7', objectId: 'o2', roomId: 'rm6', name: 'Разводка электрики', unit: 'м', plan: 240, accepted: 0, deadline: d(3), facts: [fact(-6, 90), fact(-2, 60)] },
    { id: 'w8', objectId: 'o2', roomId: 'rm8', name: 'Разводка труб', unit: 'м', plan: 60, accepted: 0, deadline: d(7), facts: [] },
    { id: 'w9', objectId: 'o3', name: 'Демонтаж перегородок', unit: 'м²', plan: 86, accepted: 0, deadline: d(5), facts: [{ date: d(-36), qty: 25, by: 'Руслан Каримов', photos: 0, note: 'Состояние на дату подключения объекта к системе' }, { date: d(-4), qty: 15, by: 'Руслан Каримов', photos: 2 }] },
  ];

  const needs: Need[] = [
    {
      id: 'n95', num: 95, objectId: 'o1', date: d(-25), authorId: 'u-foreman1', lines: [
        { id: 'n95l1', materialId: 'm16', qty: 6, wantDate: d(-19), parts: [part('n95p1', 'supplier', 6, 'received', -20, 6)] },
      ],
    },
    {
      id: 'n98', num: 98, objectId: 'o2', date: d(-12), authorId: 'u-foreman1', lines: [
        { id: 'n98l1', materialId: 'm13', qty: 6, wantDate: d(-9), parts: [part('n98p1', 'stock', 6, 'received', -10, 6)] },
        { id: 'n98l2', materialId: 'm15', qty: 3, wantDate: d(1), comment: 'Полотно 800 мм, белые', parts: [part('n98p2', 'supplier', 3, 'shipped', 0)] },
      ],
    },
    {
      id: 'n100', num: 100, objectId: 'o1', date: d(-14), authorId: 'u-foreman1', lines: [
        { id: 'n100l1', materialId: 'm14', qty: 90, wantDate: d(-11), parts: [part('n100p1', 'stock', 90, 'received', -12, 90)] },
        { id: 'n100l2', materialId: 'm6', qty: 30, wantDate: d(-11), parts: [part('n100p2', 'order', 28, 'received', -12, 28)] },
      ],
    },
    {
      id: 'n101', num: 101, objectId: 'o1', date: d(-6), authorId: 'u-foreman1', comment: 'Обшивка второго этажа, начинаем в понедельник', lines: [
        {
          id: 'n101l1', materialId: 'm4', qty: 100, wantDate: d(1), parts: [
            part('n101p1', 'stock', 30, 'shipped', 0),
            part('n101p2', 'order', 40, 'ordered', 3),
            part('n101p3', 'supplier', 20, 'handed', 4),
            part('n101p4', 'clarify', 10, 'clarify'),
          ],
        },
        { id: 'n101l2', materialId: 'm5', qty: 180, wantDate: d(-4), parts: [part('n101p5', 'stock', 180, 'received', -5, 180)] },
        { id: 'n101l3', materialId: 'm12', qty: 6, wantDate: d(-4), parts: [part('n101p6', 'stock', 6, 'received', -5, 6)] },
      ],
      question: { text: 'Последние 10 листов нужны влагостойкие или можно обычные? Влагостойких на складе не хватает.', by: 'Кирилл Жуков' },
    },
    {
      id: 'n102', num: 102, objectId: 'o1', date: d(-2), authorId: 'u-foreman1', lines: [
        { id: 'n102l1', materialId: 'm1', qty: 60, wantDate: d(2), comment: 'Из-за отклонения стены уйдёт больше', parts: [part('n102p1', 'stock', 40, 'reserved', 1)] },
        { id: 'n102l2', materialId: 'm3', qty: 8, wantDate: d(2), parts: [] },
      ],
    },
    {
      id: 'n103', num: 103, objectId: 'o2', date: d(-1), authorId: 'u-foreman1', urgent: true, comment: 'Электрики простаивают без кабеля', lines: [
        { id: 'n103l1', materialId: 'm8', qty: 250, wantDate: d(1), parts: [] },
        { id: 'n103l2', materialId: 'm9', qty: 60, wantDate: d(3), parts: [] },
        { id: 'n103l3', materialId: 'm16', qty: 4, wantDate: d(6), parts: [] },
      ],
    },
    {
      id: 'n104', num: 104, objectId: 'o3', date: d(0), authorId: 'u-foreman2', lines: [
        { id: 'n104l1', materialId: 'm15', qty: 6, wantDate: d(9), comment: 'Офисные, с доводчиком', parts: [part('n104p1', 'supplier', 6, 'handed')] },
      ],
    },
  ];

  const tradeOrders: TradeOrder[] = [
    { id: 'to56', num: 56, materialId: 'm6', qty: 50, supplier: 'СтройХим', date: d(-3), eta: d(2), status: 'ordered' },
    { id: 'to57', num: 57, materialId: 'm10', qty: 120, supplier: 'Паркет-Опт', date: d(-9), eta: d(-1), status: 'delayed' },
    { id: 'to58', num: 58, materialId: 'm4', qty: 40, supplier: 'Гипс-Трейд', date: d(-4), eta: d(3), status: 'ordered', needId: 'n101', lineId: 'n101l1', partId: 'n101p2', objectId: 'o1' },
    { id: 'to59', num: 59, materialId: 'm3', qty: 20, supplier: 'СтройХим', date: d(-2), eta: d(4), status: 'ordered' },
    { id: 'to60', num: 60, materialId: 'm13', qty: 10, supplier: 'Краски Севера', date: d(-2), eta: d(5), status: 'ordered' },
  ];

  const purchases: Purchase[] = [
    {
      id: 'pu27', num: 27, needId: 'n95', lineId: 'n95l1', partId: 'n95p1', objectId: 'o1', materialId: 'm16', qty: 6, wantDate: d(-19),
      reason: 'Торговое направление радиаторы не возит', priority: 'normal', status: 'received', supplier: 'ТеплоМаркет', price: 7250,
      terms: 'Предоплата 50%', eta: d(-20), invoice: true, orderDate: d(-25),
      history: [{ at: d(-25), by: 'Ольга Фомина', text: 'Заказ размещён, предоплата 50%' }, { at: d(-20), by: 'Игорь Савельев', text: 'Получено на объекте: 6 шт' }],
    },
    {
      id: 'pu30', num: 30, needId: 'n98', lineId: 'n98l2', partId: 'n98p2', objectId: 'o2', materialId: 'm15', qty: 3, wantDate: d(1),
      reason: 'Двери не входят в ассортимент склада', priority: 'normal', status: 'shipped', supplier: 'Двери Профи', price: 9600,
      terms: 'Оплата по счёту', eta: d(0), invoice: true, orderDate: d(-8),
      history: [{ at: d(-8), by: 'Ольга Фомина', text: 'Заказ размещён' }, { at: d(-1), by: 'Ольга Фомина', text: 'Поставщик отгрузил, доставка завтра' }],
    },
    {
      id: 'pu31', num: 31, needId: 'n101', lineId: 'n101l1', partId: 'n101p3', objectId: 'o1', materialId: 'm4', qty: 20, wantDate: d(1),
      reason: 'На складе и в заказе не хватает 20 листов', priority: 'high', status: 'sourcing', supplier: 'База «Кровля и фасад»', price: 655,
      terms: 'Самовывоз, оплата по счёту', eta: d(4),
      history: [{ at: d(-4), by: 'Кирилл Жуков', text: 'Передано снабженцу: 20 листов из 100' }, { at: d(-3), by: 'Ольга Фомина', text: 'Запрошена цена у двух поставщиков' }],
    },
    {
      id: 'pu33', num: 33, needId: 'n104', lineId: 'n104l1', partId: 'n104p1', objectId: 'o3', materialId: 'm15', qty: 6, wantDate: d(9),
      reason: 'Двери не входят в ассортимент склада', priority: 'normal', status: 'new',
      history: [{ at: d(0), by: 'Кирилл Жуков', text: 'Передано снабженцу: 6 шт' }],
    },
  ];

  const deliveries: Delivery[] = [
    { id: 'dl198', num: 198, objectId: 'o1', source: 'ТеплоМаркет', eta: d(-20), status: 'received', receivedAt: d(-20), lines: [{ materialId: 'm16', qty: 6, received: 6, needId: 'n95', lineId: 'n95l1', partId: 'n95p1' }] },
    { id: 'dl201', num: 201, objectId: 'o1', source: 'Склад торгового направления', eta: d(-12), status: 'problem', receivedAt: d(-12), comment: 'Двух мешков клея не хватило', photos: 1, lines: [
      { materialId: 'm14', qty: 90, received: 90, needId: 'n100', lineId: 'n100l1', partId: 'n100p1' },
      { materialId: 'm6', qty: 30, received: 28, issue: 'short', needId: 'n100', lineId: 'n100l2', partId: 'n100p2' },
    ] },
    { id: 'dl203', num: 203, objectId: 'o2', source: 'Склад торгового направления', eta: d(-10), status: 'received', receivedAt: d(-10), lines: [{ materialId: 'm13', qty: 6, received: 6, needId: 'n98', lineId: 'n98l1', partId: 'n98p1' }] },
    { id: 'dl205', num: 205, objectId: 'o1', source: 'Склад торгового направления', eta: d(-5), status: 'received', receivedAt: d(-5), lines: [
      { materialId: 'm5', qty: 180, received: 180, needId: 'n101', lineId: 'n101l2', partId: 'n101p5' },
      { materialId: 'm12', qty: 6, received: 6, needId: 'n101', lineId: 'n101l3', partId: 'n101p6' },
    ] },
    { id: 'dl210', num: 210, objectId: 'o1', source: 'Склад торгового направления', eta: d(0), status: 'expected', lines: [{ materialId: 'm4', qty: 30, needId: 'n101', lineId: 'n101l1', partId: 'n101p1' }] },
    { id: 'dl212', num: 212, objectId: 'o2', source: 'Двери Профи', eta: d(0), status: 'expected', lines: [{ materialId: 'm15', qty: 3, needId: 'n98', lineId: 'n98l2', partId: 'n98p2' }] },
  ];

  const mv = (id: string, objectId: string, materialId: string, day: number, kind: SiteMove['kind'], q: number, note?: string): SiteMove =>
    ({ id, objectId, materialId, date: d(day), kind, qty: q, note, by: 'Игорь Савельев' });
  const siteMoves: SiteMove[] = [
    mv('sm1', 'o1', 'm16', -20, 'receive', 6), mv('sm2', 'o1', 'm14', -12, 'receive', 90), mv('sm3', 'o1', 'm6', -12, 'receive', 28),
    mv('sm4', 'o2', 'm13', -10, 'receive', 6), mv('sm5', 'o1', 'm5', -5, 'receive', 180), mv('sm6', 'o1', 'm12', -5, 'receive', 6),
    mv('sm7', 'o1', 'm16', -12, 'use', 4, 'Монтаж радиаторов'), mv('sm8', 'o1', 'm14', -11, 'use', 74, 'Стяжка, гостиная'),
    mv('sm9', 'o1', 'm6', -12, 'loss', 2, 'Намокли при разгрузке'), mv('sm10', 'o1', 'm5', -3, 'use', 110, 'Каркас потолка, кухня'),
    mv('sm11', 'o1', 'm12', -3, 'use', 2), mv('sm12', 'o2', 'm13', -6, 'use', 2, 'Грунтование и первый слой'),
    mv('sm13', 'o1', 'm5', -2, 'issue', 20, 'Выдано бригаде на второй этаж'),
  ];

  const requests: MoneyRequest[] = [
    { id: 'rq38', num: 38, date: d(-9), authorId: 'u-foreman1', amount: 300000, basis: 'Новый перфоратор и набор инструмента', articleId: 'a-out1', entityId: 'e1', objectId: 'o1', due: d(-5), status: 'rejected',
      decisions: [{ at: d(-8), by: 'Виктор Громов', action: 'Отклонено', note: 'Берём в аренду, покупка не согласована' }] },
    { id: 'rq39', num: 39, date: d(-10), authorId: 'u-foreman1', amount: 54000, basis: 'Доставка манипулятором, кровельные материалы', articleId: 'a-out5', entityId: 'e1', objectId: 'o1', due: d(-8), status: 'paid',
      decisions: [{ at: d(-9), by: 'Виктор Громов', action: 'Согласовано' }, { at: d(-8), by: 'Марина Белова', action: 'Оплачено' }] },
    { id: 'rq40', num: 40, date: d(-5), authorId: 'u-supplier', amount: 131000, basis: 'Радиаторы, доплата по счёту № 214', articleId: 'a-out1', entityId: 'e1', objectId: 'o1', due: d(0), status: 'approved', purchaseId: 'pu27',
      decisions: [{ at: d(-4), by: 'Виктор Громов', action: 'Согласовано' }] },
    { id: 'rq41', num: 41, date: d(-2), authorId: 'u-supplier', amount: 86400, basis: 'Двери Профи, оплата по счёту № 318 (3 шт)', articleId: 'a-out1', entityId: 'e2', objectId: 'o2', due: d(1), status: 'pending', purchaseId: 'pu30', decisions: [] },
    { id: 'rq42', num: 42, date: d(-1), authorId: 'u-foreman1', amount: 48000, basis: 'Аренда виброплиты на 4 дня', articleId: 'a-out4', entityId: 'e1', objectId: 'o1', due: d(2), status: 'pending', decisions: [] },
    { id: 'rq43', num: 43, date: d(-1), authorId: 'u-admin', amount: 620000, basis: 'Оплата бригадам за первую половину месяца', articleId: 'a-out2', entityId: 'e1', due: d(3), status: 'pending', decisions: [] },
    { id: 'rq44', num: 44, date: d(0), authorId: 'u-manager', amount: 410000, basis: 'Закупка ламината на склад, доплата Паркет-Опт', articleId: 'a-out1', entityId: 'e3', due: d(4), status: 'clarify',
      decisions: [{ at: d(0), by: 'Олег Данилов', action: 'Запрошено уточнение', note: 'Поставка уже задержана. Когда фактически придёт товар?' }] },
  ];

  const plan: PlanItem[] = [
    { id: 'pl1', date: d(0), flow: 'out', amount: 131000, title: 'Радиаторы, доплата', entityId: 'e1', status: 'approved', requestId: 'rq40', objectId: 'o1' },
    { id: 'pl2', date: d(1), flow: 'out', amount: 86400, title: 'Двери Профи, счёт № 318', entityId: 'e2', status: 'plan', requestId: 'rq41', objectId: 'o2' },
    { id: 'pl3', date: d(2), flow: 'in', amount: 1200000, title: 'Этап 4, Дом на Лесной', entityId: 'e1', status: 'plan', objectId: 'o1' },
    { id: 'pl4', date: d(2), flow: 'out', amount: 48000, title: 'Аренда виброплиты', entityId: 'e1', status: 'plan', requestId: 'rq42', objectId: 'o1' },
    { id: 'pl5', date: d(3), flow: 'out', amount: 620000, title: 'Оплата бригадам', entityId: 'e1', status: 'plan', requestId: 'rq43' },
    { id: 'pl6', date: d(4), flow: 'in', amount: 380000, title: 'Оптовая отгрузка, ООО «Ремстрой»', entityId: 'e3', status: 'plan' },
    { id: 'pl7', date: d(4), flow: 'out', amount: 410000, title: 'Ламинат на склад, доплата', entityId: 'e3', status: 'plan', requestId: 'rq44' },
    { id: 'pl8', date: d(5), flow: 'out', amount: 185000, title: 'Аренда офиса и склада', entityId: 'e1', status: 'plan', regular: true },
    { id: 'pl9', date: d(6), flow: 'in', amount: 700000, title: 'Этап 2, Офис на Заводской', entityId: 'e1', status: 'plan', objectId: 'o3' },
    { id: 'pl10', date: d(8), flow: 'out', amount: 410000, title: 'Налоги и взносы', entityId: 'e1', status: 'plan', regular: true },
    { id: 'pl11', date: d(9), flow: 'in', amount: 450000, title: 'Этап 2, Квартира на Садовой', entityId: 'e2', status: 'plan', objectId: 'o2' },
    { id: 'pl12', date: d(11), flow: 'out', amount: 540000, title: 'Субподряд, фасад', entityId: 'e1', status: 'plan', objectId: 'o1' },
    { id: 'pl13', date: d(12), flow: 'out', amount: 900000, title: 'Материалы на этап 4', entityId: 'e1', status: 'plan', objectId: 'o1' },
  ];

  const data: Data = {
    today,
    seq: 1000,
    users: [
      { id: 'u-foreman1', name: 'Игорь Савельев', role: 'foreman', title: 'Прораб', objectIds: ['o1', 'o2'], hue: 28 },
      { id: 'u-foreman2', name: 'Руслан Каримов', role: 'foreman', title: 'Прораб', objectIds: ['o3'], hue: 150 },
      { id: 'u-owner1', name: 'Виктор Громов', role: 'owner', title: 'Собственник', hue: 215 },
      { id: 'u-owner2', name: 'Олег Данилов', role: 'owner', title: 'Собственник', hue: 285 },
      { id: 'u-owner3', name: 'Павел Миронов', role: 'owner', title: 'Собственник', hue: 95 },
      { id: 'u-owner4', name: 'Сергей Ткаченко', role: 'owner', title: 'Собственник', hue: 340 },
      { id: 'u-manager', name: 'Кирилл Жуков', role: 'manager', title: 'Менеджер торгового направления', hue: 180 },
      { id: 'u-supplier', name: 'Ольга Фомина', role: 'supplier', title: 'Снабженец', hue: 55 },
      { id: 'u-admin', name: 'Марина Белова', role: 'admin', title: 'Экономист, администратор', hue: 250 },
    ],
    directions: [
      { id: 'd-build', name: 'Строительство' },
      { id: 'd-trade', name: 'Торговля' },
    ],
    entities: [
      { id: 'e1', name: 'ООО «Вектор Строй»', short: 'Вектор Строй', directionId: 'd-build' },
      { id: 'e2', name: 'ИП Громов В. А.', short: 'ИП Громов', directionId: 'd-build' },
      { id: 'e3', name: 'ООО «Вектор Снаб»', short: 'Вектор Снаб', directionId: 'd-trade' },
    ],
    registers: [
      { id: 'r1', name: 'Расчётный счёт ·4471', kind: 'bank', entityId: 'e1', opening: 2480000 },
      { id: 'r2', name: 'Касса офиса', kind: 'cash', entityId: 'e1', opening: 620000 },
      { id: 'r3', name: 'Касса объекта «Лесная»', kind: 'cash', entityId: 'e1', opening: 130000 },
      { id: 'r4', name: 'Расчётный счёт ·9026', kind: 'bank', entityId: 'e2', opening: 740000 },
      { id: 'r7', name: 'Касса собственников', kind: 'cash', entityId: 'e2', opening: 410000 },
      { id: 'r5', name: 'Расчётный счёт ·1158', kind: 'bank', entityId: 'e3', opening: 1350000 },
      { id: 'r6', name: 'Касса магазина', kind: 'cash', entityId: 'e3', opening: 190000 },
    ],
    articles: [
      { id: 'a-in1', name: 'Оплата от заказчика', flow: 'in' },
      { id: 'a-in2', name: 'Продажа материалов', flow: 'in' },
      { id: 'a-in3', name: 'Взнос собственника', flow: 'in' },
      { id: 'a-out1', name: 'Материалы', flow: 'out' },
      { id: 'a-out2', name: 'Оплата труда', flow: 'out' },
      { id: 'a-out3', name: 'Субподряд', flow: 'out' },
      { id: 'a-out4', name: 'Аренда техники', flow: 'out' },
      { id: 'a-out5', name: 'Транспорт и доставка', flow: 'out' },
      { id: 'a-out6', name: 'Налоги и взносы', flow: 'out' },
      { id: 'a-out7', name: 'Офис и связь', flow: 'out' },
      { id: 'a-out8', name: 'Выплата собственнику', flow: 'out' },
    ],
    operations,
    objects: [
      { id: 'o1', name: 'Дом на Лесной, 14', address: 'пос. Сосновка, ул. Лесная, 14', customer: 'Архипов Д. С.', contract: 'Договор № 12 от ' + dfull(d(-64)), status: 'active', stage: 'Черновая отделка', foremanId: 'u-foreman1', entityId: 'e1', contractSum: 6800000, planCost: 5100000, start: d(-64), finish: d(48) },
      { id: 'o2', name: 'Квартира на Садовой, 7', address: 'ул. Садовая, 7, кв. 32', customer: 'Никитина Е. В.', contract: 'Договор № 15 от ' + dfull(d(-50)), status: 'active', stage: 'Электрика и сантехника', foremanId: 'u-foreman1', entityId: 'e2', contractSum: 2350000, planCost: 1780000, start: d(-50), finish: d(35) },
      { id: 'o3', name: 'Офис на Заводской, 3', address: 'ул. Заводская, 3, 2 этаж', customer: 'ООО «Полюс-Логистик»', contract: 'Договор № 17 от ' + dfull(d(-36)), status: 'active', stage: 'Демонтаж', foremanId: 'u-foreman2', entityId: 'e1', contractSum: 4200000, planCost: 3300000, start: d(-36), finish: d(70) },
    ],
    floors: [],
    geoVersions: [],
    sources: [],
    rooms,
    acts: [
      { id: 'act1', num: 1, objectId: 'o1', date: d(-58), by: 'Игорь Савельев', rooms: 5, floorArea: 79.4 },
      { id: 'act2', num: 2, objectId: 'o2', date: d(-30), by: 'Игорь Савельев', rooms: 3, floorArea: 29.7 },
    ],
    works,
    avrs: [
      { id: 'avr1', num: 1, objectId: 'o1', date: d(-9), by: 'Игорь Савельев', status: 'accepted', lines: [{ workId: 'w1', qty: 29.8, accepted: 29.8 }, { workId: 'w6', qty: 4, accepted: 4 }] },
      { id: 'avr2', num: 2, objectId: 'o1', date: d(-1), by: 'Игорь Савельев', status: 'review', lines: [{ workId: 'w2', qty: 36 }] },
    ],
    materials: [
      { id: 'm1', name: 'Штукатурка гипсовая, 30 кг', unit: 'меш', group: 'Сухие смеси', price: 520 },
      { id: 'm2', name: 'Шпаклёвка финишная, 25 кг', unit: 'меш', group: 'Сухие смеси', price: 780 },
      { id: 'm3', name: 'Грунтовка глубокого проникновения, 10 л', unit: 'кан', group: 'Грунты и краски', price: 890 },
      { id: 'm4', name: 'Гипсокартон влагостойкий 12,5 мм', unit: 'лист', group: 'Листовые материалы', price: 640 },
      { id: 'm5', name: 'Профиль потолочный 60×27, 3 м', unit: 'шт', group: 'Профиль и крепёж', price: 210 },
      { id: 'm6', name: 'Клей плиточный, 25 кг', unit: 'меш', group: 'Сухие смеси', price: 460 },
      { id: 'm7', name: 'Керамогранит 60×60, серый', unit: 'м²', group: 'Плитка', price: 1450 },
      { id: 'm8', name: 'Кабель ВВГнг 3×2,5', unit: 'м', group: 'Электрика', price: 96 },
      { id: 'm9', name: 'Труба полипропиленовая 20 мм', unit: 'м', group: 'Сантехника', price: 74 },
      { id: 'm10', name: 'Ламинат 33 класс, дуб', unit: 'м²', group: 'Напольные покрытия', price: 1120 },
      { id: 'm11', name: 'Подложка под ламинат 3 мм', unit: 'м²', group: 'Напольные покрытия', price: 85 },
      { id: 'm12', name: 'Саморезы по металлу 3,5×25, 1000 шт', unit: 'уп', group: 'Профиль и крепёж', price: 390 },
      { id: 'm13', name: 'Краска интерьерная белая, 9 л', unit: 'ведро', group: 'Грунты и краски', price: 3200 },
      { id: 'm14', name: 'Смесь для стяжки, 40 кг', unit: 'меш', group: 'Сухие смеси', price: 310 },
      { id: 'm15', name: 'Дверь межкомнатная 800 мм', unit: 'шт', group: 'Двери', price: 9800 },
      { id: 'm16', name: 'Радиатор биметаллический, 8 секций', unit: 'шт', group: 'Отопление', price: 7400 },
    ],
    stock: [
      // "expected" is not stored: it is the sum of the open trade orders for the material
      { materialId: 'm1', total: 180, reserved: 40, place: 'Ряд А, стеллаж 2' },
      { materialId: 'm2', total: 60, reserved: 0, place: 'Ряд А, стеллаж 3' },
      { materialId: 'm3', total: 5, reserved: 0, place: 'Ряд Б, стеллаж 1' },
      { materialId: 'm4', total: 0, reserved: 0, place: 'Ряд В, паллеты' },
      { materialId: 'm5', total: 120, reserved: 0, place: 'Ряд Г, стойка' },
      { materialId: 'm6', total: 12, reserved: 0, place: 'Ряд А, стеллаж 4' },
      { materialId: 'm7', total: 64, reserved: 0, place: 'Ряд Д, паллеты' },
      { materialId: 'm8', total: 800, reserved: 0, place: 'Ряд Е, бухты' },
      { materialId: 'm9', total: 420, reserved: 0, place: 'Ряд Е, стойка' },
      { materialId: 'm10', total: 0, reserved: 0, place: 'Ряд Д, паллеты' },
      { materialId: 'm11', total: 150, reserved: 0, place: 'Ряд Д, рулоны' },
      { materialId: 'm12', total: 34, reserved: 0, place: 'Ряд Г, полка 5' },
      { materialId: 'm13', total: 6, reserved: 0, place: 'Ряд Б, стеллаж 2' },
      { materialId: 'm14', total: 110, reserved: 0, place: 'Ряд А, паллеты' },
    ],
    needs,
    tradeOrders,
    purchases,
    deliveries,
    siteMoves,
    issues: [
      { id: 'is1', objectId: 'o1', place: 'Гостиная, стена у окна', kind: 'geometry', text: 'Отклонение стены 18 мм на 2 м. Штукатурки уйдёт больше, чем по расчёту.', date: d(-3), status: 'open', photos: 2, by: 'Игорь Савельев' },
      { id: 'is2', objectId: 'o1', place: 'Склад на объекте', kind: 'damage', text: 'Два мешка плиточного клея намокли при разгрузке.', date: d(-12), status: 'done', photos: 1, by: 'Игорь Савельев' },
      { id: 'is3', objectId: 'o2', place: 'Кухня', kind: 'delay', text: 'Кабель не привезли, электрики простаивают второй день.', date: d(0), status: 'open', photos: 0, by: 'Игорь Савельев' },
      { id: 'is4', objectId: 'o1', place: 'Санузел', kind: 'rework', text: 'Переделать гидроизоляцию угла у стояка.', date: d(-5), status: 'work', photos: 3, by: 'Игорь Савельев' },
    ],
    requests,
    plan,
    norms: [
      { id: 'nm1', work: 'Штукатурка стен, слой 15 мм', unit: 'м²', version: 2, updated: d(-20), by: 'Марина Белова',
        lines: [{ materialId: 'm1', perUnit: 0.45 }, { materialId: 'm3', perUnit: 0.02 }],
        previous: [{ version: 1, updated: d(-90), text: 'Штукатурка 0,40 меш/м², грунтовка 0,02 кан/м²' }] },
      { id: 'nm2', work: 'Обшивка стен ГКЛ в один слой', unit: 'м²', version: 1, updated: d(-90), by: 'Марина Белова',
        lines: [{ materialId: 'm4', perUnit: 0.35 }, { materialId: 'm5', perUnit: 0.9 }, { materialId: 'm12', perUnit: 0.03 }], previous: [] },
      { id: 'nm3', work: 'Укладка керамогранита', unit: 'м²', version: 1, updated: d(-90), by: 'Марина Белова',
        lines: [{ materialId: 'm7', perUnit: 1.07 }, { materialId: 'm6', perUnit: 0.2 }], previous: [] },
      { id: 'nm4', work: 'Стяжка пола, 40 мм', unit: 'м²', version: 1, updated: d(-90), by: 'Марина Белова',
        lines: [{ materialId: 'm14', perUnit: 2.1 }, { materialId: 'm3', perUnit: 0.015 }], previous: [] },
      { id: 'nm5', work: 'Укладка ламината', unit: 'м²', version: 1, updated: d(-90), by: 'Марина Белова',
        lines: [{ materialId: 'm10', perUnit: 1.05 }, { materialId: 'm11', perUnit: 1.05 }], previous: [] },
    ],
    audit: [
      { id: 'au1', at: d(-24), by: 'Марина Белова', area: 'Деньги', text: 'Операция от ' + dfull(d(-25)) + ', ТеплоМаркет: изменена статья', before: 'Оплата труда', after: 'Материалы' },
      { id: 'au2', at: d(-20), by: 'Марина Белова', area: 'Нормативы', text: 'Штукатурка стен: новая версия нормы', before: '0,40 меш/м²', after: '0,45 меш/м²' },
      { id: 'au3', at: d(-9), by: 'Марина Белова', area: 'АВР', text: 'АВР № 1, Дом на Лесной: объёмы приняты', after: '29,8 м² стяжки, 4 радиатора' },
      { id: 'au4', at: d(-8), by: 'Виктор Громов', area: 'Заявки', text: 'Заявка № 38 на 300 000 ₽ отклонена', after: 'Берём в аренду, покупка не согласована' },
      { id: 'au5', at: d(-4), by: 'Кирилл Жуков', area: 'ТМЦ', text: 'Потребность № 101, гипсокартон: позиция разделена на четыре маршрута', after: '30 склад · 40 заказ · 20 снабженец · 10 уточнение' },
      { id: 'au6', at: d(-3), by: 'Игорь Савельев', area: 'Геометрия', text: 'Гостиная, Дом на Лесной: изменено отклонение стены', before: '12 мм', after: '18 мм' },
      { id: 'au7', at: d(-2), by: 'Марина Белова', area: 'Доступ', text: 'Руслан Каримов: открыт доступ к объекту «Офис на Заводской, 3»' },
    ],
  };

  enrich(data, d);
  check(data);
  return data;
}

function dfull(date: string): string {
  const [y, m, dd] = date.split('-');
  return `${dd}.${m}.${y}`;
}

/** Figures that must agree. A failure here means the seed is wrong, not the screen. */
function check(data: Data): void {
  for (const n of data.needs) for (const l of n.lines) {
    const allocated = l.parts.reduce((s, p) => s + p.qty, 0);
    console.assert(allocated <= l.qty, `need ${n.num}: parts exceed the line`, l);
    for (const p of l.parts) console.assert((p.received ?? 0) <= p.qty, `need ${n.num}: received exceeds part`, p);
  }
  for (const s of data.stock) console.assert(s.reserved <= s.total, 'stock: reserved exceeds total', s);
  for (const w of data.works) {
    const done = w.facts.reduce((s, f) => s + f.qty, 0);
    console.assert(w.accepted <= done + 1e-9, 'work: accepted exceeds done', w);
    console.assert(done <= w.plan + 1e-9, 'work: done exceeds plan', w);
  }
  for (const dl of data.deliveries) for (const l of dl.lines) {
    console.assert(data.needs.some((n) => n.id === l.needId), 'delivery: unknown need', l);
  }
}
