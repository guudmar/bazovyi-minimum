// Demo data for the supplement to the concept: floors and versions of geometry, surfaces and zones,
// the catalogue with source positions, crews and bases of calculations. Everything here is invented.
import { totalsOf } from './select';
import type { Data } from './types';

export function enrich(data: Data, d: (n: number) => string): void {
  const on = (objectId: string, floor: string) => data.rooms.filter((r) => r.objectId === objectId && r.floor === floor);
  const who = 'Игорь Савельев';

  data.floors = [
    { id: 'f1', objectId: 'o1', name: '1 этаж' },
    { id: 'f2', objectId: 'o1', name: '2 этаж' },
    { id: 'f3', objectId: 'o2', name: '7 этаж' },
  ];

  for (const r of data.rooms) {
    r.method = 'manual';
    r.purpose = /санузел/i.test(r.name) ? 'Мокрая зона' : /кухня/i.test(r.name) ? 'Кухня' : 'Жилая';
    r.elements = [];
    r.zones = [];
    r.uneven = r.deviation ? [{ id: `${r.id}u1`, place: r.note ? 'Стена у окна' : 'Стены', mm: r.deviation }] : [];
  }
  const room = (id: string) => data.rooms.find((r) => r.id === id)!;
  room('rm1').method = 'laser';
  room('rm1').elements = [
    { id: 'rm1e1', kind: 'slope', name: 'Откосы окон', length: 4.8, height: 0.25, count: 2 },
    { id: 'rm1e2', kind: 'niche', name: 'Ниша под телевизор', length: 1.6, height: 1.1, count: 1 },
  ];
  room('rm3').elements = [{ id: 'rm3e1', kind: 'ledge', name: 'Короб стояка', length: 0.4, height: 2.7, count: 2 }];
  room('rm3').zones = [{ id: 'rm3z1', name: 'Душевая', purpose: 'Мокрая зона', area: 1.4 }];
  room('rm7').uneven = [{ id: 'rm7u1', place: 'Пол, уклон к окну', mm: 12 }];

  data.geoVersions = [
    { id: 'gv1', objectId: 'o1', floor: '1 этаж', num: 1, status: 'confirmed', createdAt: d(-60), by: who, sentAt: d(-58), confirmedAt: d(-57), confirmedBy: 'Марина Белова',
      totals: totalsOf(on('o1', '1 этаж')), changes: [{ at: d(-60), by: who, text: 'Первичный замер этажа: 3 помещения' }] },
    { id: 'gv2', objectId: 'o1', floor: '1 этаж', num: 2, status: 'draft', createdAt: d(-3), by: who, reason: 'Повторный замер стены у окна в гостиной',
      changes: [{ at: d(-3), by: who, text: 'Гостиная: отклонение стены 12 мм → 18 мм' }] },
    { id: 'gv3', objectId: 'o1', floor: '2 этаж', num: 1, status: 'confirmed', createdAt: d(-58), by: who, sentAt: d(-58), confirmedAt: d(-57), confirmedBy: 'Марина Белова',
      totals: totalsOf(on('o1', '2 этаж')), changes: [{ at: d(-58), by: who, text: 'Первичный замер этажа: 2 помещения' }] },
    { id: 'gv4', objectId: 'o2', floor: '7 этаж', num: 1, status: 'review', createdAt: d(-30), by: who, sentAt: d(-2),
      totals: totalsOf(on('o2', '7 этаж')), changes: [{ at: d(-30), by: who, text: 'Первичный замер: 3 помещения' }, { at: d(-2), by: who, text: 'Кухня: добавлен уклон пола 12 мм' }] },
  ];
  // each version keeps the rooms as they were measured in it
  for (const v of data.geoVersions) if (v.status !== 'draft') v.snapshot = structuredClone(on(v.objectId, v.floor));
  const first = data.geoVersions[0].snapshot?.find((r) => r.id === 'rm1');
  if (first) { first.deviation = 12; first.uneven = [{ id: 'rm1u1', place: 'Стена у окна', mm: 12 }]; }
  // one act per floor, never one per room
  data.acts = [
    { id: 'act1', num: 1, objectId: 'o1', floor: '1 этаж', versionId: 'gv1', date: d(-58), by: who, rooms: 3, floorArea: totalsOf(on('o1', '1 этаж')).floor },
    { id: 'act2', num: 2, objectId: 'o1', floor: '2 этаж', versionId: 'gv3', date: d(-58), by: who, rooms: 2, floorArea: totalsOf(on('o1', '2 этаж')).floor },
    { id: 'act3', num: 3, objectId: 'o2', floor: '7 этаж', versionId: 'gv4', date: d(-2), by: who, rooms: 3, floorArea: totalsOf(on('o2', '7 этаж')).floor },
  ];

  const cat: Record<string, [code: string, family: string, pack?: string, useUnit?: string, k?: number]> = {
    m1: ['СМ-0001', 'Штукатурка гипсовая', 'мешок 30 кг', 'кг', 30], m2: ['СМ-0002', 'Шпаклёвка финишная', 'мешок 25 кг', 'кг', 25],
    m3: ['ГК-0001', 'Грунтовка', 'канистра 10 л', 'л', 10], m4: ['ЛМ-0001', 'Гипсокартон', 'лист 2500×1200 мм', 'м²', 3],
    m5: ['ПК-0001', 'Профиль потолочный', 'хлыст 3 м', 'м', 3], m6: ['СМ-0003', 'Клей плиточный', 'мешок 25 кг', 'кг', 25],
    m7: ['ПЛ-0001', 'Керамогранит'], m8: ['ЭЛ-0001', 'Кабель силовой'], m9: ['СТ-0001', 'Труба полипропиленовая'],
    m10: ['НП-0001', 'Ламинат'], m11: ['НП-0002', 'Подложка под ламинат'], m12: ['ПК-0002', 'Саморезы', 'упаковка 1000 шт', 'шт', 1000],
    m13: ['ГК-0002', 'Краска интерьерная', 'ведро 9 л', 'л', 9], m14: ['СМ-0004', 'Смесь для стяжки', 'мешок 40 кг', 'кг', 40],
    m15: ['ДВ-0001', 'Дверь межкомнатная'], m16: ['ОТ-0001', 'Радиатор биметаллический'],
  };
  for (const m of data.materials) {
    const c = cat[m.id];
    if (c) Object.assign(m, { code: c[0], family: c[1], pack: c[2], useUnit: c[3], k: c[4] });
  }
  // a second position of the same family: the same parent group, another mix with its own consumption
  data.materials.push({ id: 'm17', name: 'Штукатурка гипсовая машинная, 30 кг', unit: 'меш', group: 'Сухие смеси', price: 480, code: 'СМ-0005', family: 'Штукатурка гипсовая', pack: 'мешок 30 кг', useUnit: 'кг', k: 30 });

  data.sources = [
    { id: 's1', supplier: 'СтройХим', code: 'ШГ-СТАРТ-30', name: 'Штукатурка гипс. «Старт» 30кг', unit: 'меш', materialId: 'm1', status: 'matched', seenAt: d(-54) },
    { id: 's2', supplier: 'Гипс-Трейд', code: 'ГКЛВ-12.5-2500', name: 'ГКЛВ 2500×1200×12,5 влагост.', unit: 'лист', materialId: 'm4', status: 'matched', seenAt: d(-44) },
    { id: 's3', supplier: 'СтройХим', code: 'КП-11-25', name: 'Клей плит. КП-11 25кг', unit: 'меш', materialId: 'm6', status: 'matched', seenAt: d(-27) },
    { id: 's4', supplier: 'Двери Профи', code: 'ДГ-800-Б', name: 'Полотно дверное ДГ 800 белое, эмаль', unit: 'шт', materialId: 'm15', status: 'matched', seenAt: d(-8) },
    { id: 's5', supplier: 'ТеплоМаркет', code: 'БМ-500-8', name: 'Радиатор БМ-500 8 секц.', unit: 'шт', materialId: 'm16', status: 'matched', seenAt: d(-25) },
    { id: 's6', supplier: 'СтройХим', code: 'ШГ-СЛОЙ-30М', name: 'Штукатурка гипс. «Слой» 30 кг машинная', unit: 'меш', status: 'queue', seenAt: d(-12), note: 'В счёте предложена вместо «Старта». Расход и способ нанесения другие.' },
    { id: 's7', supplier: 'Склад торгового направления', name: 'Грунт бетоноконтакт 5 кг', unit: 'ведро', status: 'temp', seenAt: d(-5), deliveryId: 'dl205', qty: 2, note: 'Пришло с поставкой № 205, в потребности не было.' },
  ];
  const dl = (id: string) => data.deliveries.find((x) => x.id === id)!;
  Object.assign(dl('dl210').lines[0], { sourceName: 'ГКЛВ 2500×1200×12,5 влагост.', sourceCode: 'ГКЛВ-12.5-2500' });
  Object.assign(dl('dl212').lines[0], { sourceName: 'Полотно дверное ДГ 800 белое, эмаль', sourceCode: 'ДГ-800-Б' });
  dl('dl205').extras = [{ id: 'dl205x1', sourceName: 'Грунт бетоноконтакт 5 кг', qty: 2, unit: 'ведро' }];
  for (const x of data.deliveries) if (x.status !== 'expected') x.place = 'Склад на объекте';
  for (const m of data.siteMoves) if (m.kind === 'receive') m.place = 'Склад на объекте';

  const base: Record<string, 'walls' | 'floor' | 'ceiling'> = { nm1: 'walls', nm2: 'walls', nm3: 'floor', nm4: 'floor', nm5: 'floor' };
  for (const n of data.norms) n.base = base[n.id];
  const plan: Record<string, [crew: string, normId?: string, geo?: string]> = {
    w1: ['Бригада Сафина', 'nm4', 'gv1'], w2: ['Бригада Сафина', 'nm1', 'gv1'], w3: ['Бригада Сафина'], w4: ['Бригада Сафина', 'nm2', 'gv3'],
    w5: ['Плиточник Ахмедов', 'nm3', 'gv1'], w6: ['Сантехник Лукин'], w7: ['Бригада Юсупова'], w8: ['Сантехник Лукин'], w9: ['ИП Корнеев'],
  };
  for (const w of data.works) {
    const p = plan[w.id];
    if (p) Object.assign(w, { crew: p[0], normId: p[1], geoVersionId: p[2] });
  }

  const need = data.needs.find((n) => n.id === 'n102');
  if (need) Object.assign(need, { floor: '1 этаж', roomId: 'rm1', basis: { workId: 'w2', normId: 'nm1', normVersion: 2, geoVersionId: 'gv1', volume: 22 } });

  for (const i of data.issues) i.history = [{ at: i.date, by: i.by, text: 'Замечание создано' }];
  const issue = (id: string) => data.issues.find((i) => i.id === id)!;
  Object.assign(issue('is1'), { source: { kind: 'room', id: 'rm1', label: 'Гостиная, 1 этаж' }, responsible: 'Марина Белова' });
  Object.assign(issue('is3'), { source: { kind: 'need', id: 'n103', label: 'Потребность № 103' }, responsible: 'Кирилл Жуков', due: d(1) });
  issue('is4').history!.push({ at: d(-4), by: who, text: 'Взято в работу' });
  issue('is2').history!.push({ at: d(-11), by: who, text: 'Решено: мешки списаны как потеря' });
}
