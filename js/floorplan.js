// 서천미래교육지원센터 평면도 (배치도 시트 [붙임3]의 셀 범위). 1칸 ≈ 1m 로 어림한다.
// 로비·중정·야외·2층 복도는 배치도에 넓이가 없어 어림 위치다 — 10/16 이후 현장 확인 뒤 고친다.

function col(letters) {
  return [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

// 'E12:K26' → { x, y, w, h } (2층은 행에서 46을 빼 1층과 같은 높이에 맞춘다)
function cells(range, floor) {
  const [a, b] = range.split(':');
  const pa = a.match(/^([A-Z]+)(\d+)$/);
  const pb = (b || a).match(/^([A-Z]+)(\d+)$/);
  const shift = floor === 2 ? 46 : 0;
  const x1 = col(pa[1]); const x2 = col(pb[1]);
  const y1 = Number(pa[2]) - shift; const y2 = Number(pb[2]) - shift;
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

// id: 엔진·서버의 구역(zone) 이름과 같다. kind: room(체험 장소) / fixed(엘리베이터·화장실 등) / out(야외)
const RAW = [
  // 1층
  ['training', '교원연수실', 1, 'E12:K26', 'room'],
  ['aiRoom', 'AI교육실', 1, 'E27:K34', 'room'],
  ['tidal', '갯벌체험관', 1, 'E39:K42', 'room'],
  ['playground', '상상놀이터', 1, 'N22:V30', 'room'],
  ['library1', '자료실', 1, 'N31:V33', 'fixed'],
  ['elev1', '엘리베이터', 1, 'P36:R38', 'fixed'],
  ['parents', '학부모회의실', 1, 'N40:R40', 'fixed'],
  ['artRoom', '예술활동실', 1, 'W12:AE18', 'room'],
  ['wc1a', '화장실', 1, 'AJ15:AO15', 'fixed'],
  ['science', '과학실험실', 1, 'AP12:AW18', 'room'],
  ['courtyard', '중정', 1, 'AG21:AW32', 'room'],
  ['bookcafe', '북카페', 1, 'AI36:AU42', 'room'],
  ['wc1b', '화장실', 1, 'W39:AD41', 'fixed'],
  ['future', '미래활동실', 1, 'BD7:BS27', 'room'],
  ['lobby', '로비(홀)', 1, 'BD30:BS46', 'room'],
  ['outFront', '야외 (미래봄 입구)', 1, 'BU30:CF48', 'out'],
  ['outNorth', '야외 (북쪽)', 1, 'N2:AE8', 'out'],
  // 2층
  ['coding', '코딩사물인터넷실', 2, 'E58:K69', 'room'],
  ['sangsang', '상상이룸공작실', 2, 'E78:K88', 'room'],
  ['special4', '특별체험실4', 2, 'N60:R61', 'room'],
  ['special3', '특별체험실3', 2, 'S60:V62', 'room'],
  ['special2', '특별체험실2', 2, 'W58:AE64', 'room'],
  ['wc2a', '화장실', 2, 'AJ58:AO64', 'fixed'],
  ['special1', '특별체험실1', 2, 'AP58:BA64', 'room'],
  ['futureEdu', '미래교육실', 2, 'N68:V79', 'room'],
  ['hall2', '2층 복도', 2, 'AF68:BA76', 'room'],
  ['elev2', '엘리베이터', 2, 'P82:R84', 'fixed'],
  ['wc2b', '화장실', 2, 'W85:AD87', 'fixed'],
  ['math', '수학체험실', 2, 'AE82:BK88', 'room'],
];

export const ROOMS = RAW.map(([id, name, floor, range, kind]) => ({ id, name, floor, kind, ...cells(range, floor) }));
const byId = Object.fromEntries(ROOMS.map(r => [r.id, r]));

export function room(id) {
  return byId[id] || null;
}

function center(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function dist(a, b) {
  const p = center(a); const q = center(b);
  return Math.abs(p.x - q.x) + Math.abs(p.y - q.y);   // 복도를 따라 걷는 거리로 보고 가로+세로
}

const PACE = 50;   // 사람 많은 행사장에서 1분에 약 50m

// 구역 a에서 b까지 걷는 분 (모르는 구역이면 3분)
export function walkMinutes(a, b) {
  if (!a || !b || a === b) return 0;
  const ra = byId[a]; const rb = byId[b];
  if (!ra || !rb) return 3;
  let m;
  if (ra.floor !== rb.floor) {
    const ea = byId[ra.floor === 2 ? 'elev2' : 'elev1'];
    const eb = byId[rb.floor === 2 ? 'elev2' : 'elev1'];
    m = (dist(ra, ea) + dist(eb, rb)) / PACE + 2;   // 층 이동 2분
  } else {
    m = dist(ra, rb) / PACE;
  }
  if (ra.kind === 'out' || rb.kind === 'out') m += 1;   // 신발·출입문
  return Math.max(1, Math.ceil(m));
}

// 사람이 읽는 길 안내 문장
export function directions(a, b) {
  const ra = byId[a]; const rb = byId[b];
  if (!rb) return '운영진에게 장소를 물어보세요.';
  if (!ra) return `${rb.floor === 2 ? '2층 ' : ''}${rb.name}(으)로 가요.`;
  if (a === b) return `지금 있는 ${rb.name}에서 바로 해요.`;
  const min = walkMinutes(a, b);
  const steps = [];
  if (ra.floor !== rb.floor) {
    steps.push(`${ra.name}에서 엘리베이터(또는 계단)로 가요`);
    steps.push(`${rb.floor === 2 ? '2층으로 올라가요' : '1층으로 내려가요'}`);
    steps.push(`${rb.name}(으)로 가요`);
  } else if (rb.kind === 'out') {
    steps.push(`${ra.name}에서 건물 밖 ${rb.name}(으)로 나가요`);
  } else if (ra.kind === 'out') {
    steps.push(`건물로 들어와 ${rb.floor === 2 ? '2층 ' : ''}${rb.name}(으)로 가요`);
  } else {
    steps.push(`${ra.name}에서 ${rb.floor === 2 ? '2층 ' : '1층 '}${rb.name}(으)로 걸어가요`);
  }
  return `${steps.join(' → ')} (약 ${min}분)`;
}

// 평면도 SVG. from·to 는 구역 id. to 가 있는 층을 그리고, from 이 다른 층이면 그 층도 위에 작게 그린다.
export function mapSvg({ from, to, label } = {}) {
  const rt = byId[to]; const rf = byId[from];
  const floors = rt ? [rt.floor] : [1];
  if (rf && rt && rf.floor !== rt.floor) floors.unshift(rf.floor);
  const W = 86;
  const H = 52;
  const parts = [];
  floors.forEach((floor, i) => {
    const oy = i * (H + 4);
    parts.push(`<text x="2" y="${oy + 3}" font-size="2.6" font-weight="700" fill="currentColor">${floor}층</text>`);
    parts.push(`<rect x="4" y="${oy + 5}" width="68" height="41" rx="1.4" fill="#fff" stroke="#aabbb2" stroke-width=".3"/>`);
    for (const r of ROOMS) {
      if (r.floor !== floor) continue;
      const isTo = r.id === to; const isFrom = r.id === from;
      const fill = isTo ? 'var(--accent, #2563eb)' : r.kind === 'out' ? 'none' : 'currentColor';
      const op = isTo ? 1 : r.kind === 'fixed' ? 0.12 : r.kind === 'out' ? 1 : 0.07;
      const dash = r.kind === 'out' ? ' stroke-dasharray="1 .8"' : '';
      parts.push(`<rect x="${r.x}" y="${r.y + oy}" width="${r.w}" height="${r.h}" rx=".6" fill="${fill}" fill-opacity="${op}" stroke="currentColor" stroke-opacity="${isFrom ? 1 : 0.35}" stroke-width="${isFrom ? 0.7 : 0.25}"${dash}/>`);
      if (r.kind === 'fixed' && r.id.startsWith('wc') && !isTo) continue;   // 화장실 이름은 생략(겹침)
      const fs = r.w < 8 ? 1.7 : r.w >= 12 ? 2.6 : 2.2;
      parts.push(`<text x="${r.x + r.w / 2}" y="${r.y + oy + r.h / 2 + 0.7}" font-size="${fs}" text-anchor="middle" fill="${isTo ? '#fff' : 'currentColor'}" font-weight="${isTo || isFrom ? 700 : 400}">${r.name}</text>`);
    }
  });
  // 출발 → 도착 선 (층이 다르면 엘리베이터를 거쳐)
  if (rf && rt && from !== to) {
    const yOf = fl => floors.indexOf(fl) * (H + 4);
    const pt = (r) => { const c = center(r); return `${c.x},${c.y + yOf(r.floor)}`; };
    let pts;
    if (rf.floor !== rt.floor) {
      const ea = byId[rf.floor === 2 ? 'elev2' : 'elev1']; const eb = byId[rt.floor === 2 ? 'elev2' : 'elev1'];
      pts = [pt(rf), pt(ea), pt(eb), pt(rt)];
    } else {
      pts = [pt(rf), pt(rt)];
    }
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#205b49" stroke-width=".8" stroke-dasharray="2 1.2" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(`<circle cx="${pts[0].split(',')[0]}" cy="${pts[0].split(',')[1]}" r="1.4" fill="#f2c200" stroke="#203b37" stroke-width=".4"/>`);
    parts.push(`<circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="1.4" fill="#205b49" stroke="#fff" stroke-width=".4"/>`);
  }
  parts.push(`<text x="2" y="${floors.length * (H + 4) + 1}" font-size="2.3" fill="#43594d">출발 ● → 도착 ● · 이동 방향 안내</text>`);
  const totalH = floors.length * (H + 4) + 4;
  const aria = label || (rt ? `${rt.floor}층 ${rt.name} 위치` : '평면도');
  return `<svg viewBox="0 0 ${W} ${totalH}" role="img" aria-label="${aria}" style="width:100%;height:auto;display:block">${parts.join('')}</svg>`;
}
