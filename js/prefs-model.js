// 5길 선호 상태와 검사. 화면(DOM)과 무관해서 Node에서도 시험한다.
// 저장 값은 부스번호 → 순위(1 = 선호도 가장 높음 … 5 = 가장 낮음). 엔진·서버와 같은 값이다.
// 화면에는 '참여 선호도' 점수로 보여 준다: 점수 = 6 − 순위 (5점 = 선호도 가장 높음, 1점 = 가장 낮음). 점수에 말 표현은 붙이지 않는다.
// 규칙은 서버 apps-script/src/30-apply.js 의 validatePrefs_ 와 같다.

export const GIL_ORDER = ['성장하길', '꿈키우길', '지속하길', '마주하길', '함께하길'];

export const RANKS = [
  { rank: 1, score: 5 },
  { rank: 2, score: 4 },
  { rank: 3, score: 3 },
  { rank: 4, score: 2 },
  { rank: 5, score: 1 },
];

export const scoreOf = rank => 6 - rank;

export function periodOfGrade(grade) {
  return /^(유|초)/.test(grade) ? '오전' : '오후';
}

export function firstPicks(gil, settings = {}) {
  const own = settings[`선호_1순위개수_${gil}`];
  return Number(own !== undefined && own !== '' ? own : (settings['선호_1순위개수'] || 3));
}

// 이 학년이 고를 수 있는 길별 부스 목록과 개수 규칙
export function gilsFor(config, grade) {
  const period = periodOfGrade(grade);
  const max = Number(config.settings['선호_순위최대'] || 5);
  const eligible = config.booths.filter(b => b.kind === '배정' && b.periods.includes(period) && (!b.grades.length || b.grades.includes(grade)));
  return GIL_ORDER
    .map(gil => {
      const booths = eligible.filter(b => b.gil === gil);
      return { gil, booths, need: Math.min(firstPicks(gil, config.settings), booths.length), max };
    })
    .filter(g => g.booths.length);
}

function gilOf(gils, boothNo) {
  return gils.find(g => g.booths.some(b => String(b.no) === String(boothNo)));
}

export function countsFor(prefs, gilInfo) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const b of gilInfo.booths) {
    const r = prefs[b.no];
    if (r) c[r]++;
  }
  return c;
}

export function limitOf(gilInfo, rank) {
  return rank === 1 ? gilInfo.need : gilInfo.max;
}

// 점수(순위)를 주거나(같은 점수를 다시 누르면 뺀다) 바꾼다. 원본은 바꾸지 않는다.
export function setRank(prefs, gils, boothNo, rank) {
  const g = gilOf(gils, boothNo);
  if (!g) return { prefs, error: '고를 수 없는 부스입니다.' };
  const next = { ...prefs };
  if (next[boothNo] === rank) {
    delete next[boothNo];
    return { prefs: next };
  }
  const c = countsFor(prefs, g);
  if (prefs[boothNo] !== rank && c[rank] >= limitOf(g, rank)) {
    return { prefs, error: rank === 1 ? `${g.gil}에서 5점은 ${g.need}개까지예요. 다른 5점을 먼저 빼 주세요.` : `${scoreOf(rank)}점은 ${g.max}개까지 줄 수 있어요.` };
  }
  next[boothNo] = rank;
  return { prefs: next };
}

export function gilStatus(prefs, gilInfo) {
  const c = countsFor(prefs, gilInfo);
  const over = [2, 3, 4, 5].some(r => c[r] > gilInfo.max);
  return { counts: c, firstLeft: gilInfo.need - c[1], done: c[1] === gilInfo.need && !over };
}

export function allDone(prefs, gils) {
  return gils.every(g => gilStatus(prefs, g).done);
}

// 고를 수 없게 된 부스(학년·시간대가 바뀐 경우)를 뺀다
export function cleanPrefs(prefs, gils) {
  const out = {};
  for (const [no, r] of Object.entries(prefs || {})) if (gilOf(gils, no)) out[no] = Number(r);
  return out;
}
