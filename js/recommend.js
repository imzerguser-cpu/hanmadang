// 학부모·주민 현장 추천: 지금 1시간 안에 시작하고, 걸어가서 늦지 않고, 자리가 남았고, 내 예약과 겹치지 않는 회차를
// 길마다 3개씩 고른다. 아직 안 했고 예약도 안 한 길이 먼저.
import { walkMinutes as defaultWalk } from './floorplan.js';
import { GIL_ORDER } from './prefs-model.js';

export const SORTS = {
  soon: { label: '⚡ 금방 할 수 있는 곳', cmp: (x, y) => x.seat.s - y.seat.s || y.seat.a - x.seat.a },
  scarce: { label: '🔥 마감 임박', cmp: (x, y) => x.seat.a - y.seat.a || x.seat.s - y.seat.s },
  roomy: { label: '😌 여유 있는 곳', cmp: (x, y) => y.seat.a / y.seat.c - x.seat.a / x.seat.c || x.seat.s - y.seat.s },
  near: { label: '📍 가까운 곳', cmp: (x, y) => x.walk - y.walk || x.seat.s - y.seat.s },
};

function overlaps(a, b) {
  const am = a.moveMin === undefined ? 5 : a.moveMin;
  const bm = b.moveMin === undefined ? 5 : b.moveMin;
  return !(a.end + am <= b.start || b.end + bm <= a.start);
}

// seats: live.summary 의 seats, booths/lectures: config, mine: 내 일정 items(예약·참여·배정)
export function recommend({ seats, booths, lectures = [], mine = [], nowMin, from, sort = 'soon', perGil = 3, walk = defaultWalk }) {
  const active = mine.filter(i => i.status !== '취소');
  const doneGils = new Set(active.filter(i => i.status === '참여' && i.gil).map(i => i.gil));
  // 이미 예약했거나 한 길은 뒤로 (다섯 길을 고루 돌도록)
  const coveredGils = new Set(active.filter(i => i.gil).map(i => i.gil));
  const heldTargets = new Set(active.map(i => String(i.target)));
  const groups = new Map();
  for (const seat of seats) {
    if (seat.a <= 0 || seat.s <= nowMin) continue;
    let place;
    let gil;
    if (seat.lecture) {
      const l = lectures.find(x => x.id === seat.b);
      if (!l) continue;
      place = { name: l.name, zone: l.zone, place: l.place, no: l.id };
      gil = '특강';
    } else {
      const b = booths.find(x => String(x.no) === String(seat.b));
      if (!b || b.kind !== '배정') continue;
      place = b;
      gil = b.gil;
    }
    if (heldTargets.has(String(place.no))) continue;
    const slot = { start: seat.s, end: seat.e, moveMin: seat.m };
    if (active.some(i => overlaps(slot, { start: i.start, end: i.end, moveMin: 5 }))) continue;
    const w = walk(from, place.zone);
    if (nowMin + w > seat.s) continue;   // 걸어가면 늦는다
    if (!groups.has(gil)) groups.set(gil, []);
    groups.get(gil).push({ seat, booth: place, walk: w });
  }
  const cmp = (SORTS[sort] || SORTS.soon).cmp;
  const order = [...GIL_ORDER.filter(g => !coveredGils.has(g)), ...GIL_ORDER.filter(g => coveredGils.has(g)), '특강'];
  return order
    .filter(g => groups.has(g))
    .map(g => {
      // 같은 부스의 여러 회차 중 가장 앞선 것만 (추천 3개가 한 부스로 채워지지 않게)
      const best = new Map();
      for (const it of groups.get(g).sort(cmp)) if (!best.has(String(it.booth.no))) best.set(String(it.booth.no), it);
      return { gil: g, done: doneGils.has(g), covered: coveredGils.has(g), items: [...best.values()].slice(0, perGil) };
    });
}
