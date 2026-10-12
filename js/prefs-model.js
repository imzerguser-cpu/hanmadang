// 5길 선호 상태와 검사. 화면(DOM)과 무관해서 Node에서도 시험한다.
// 저장 값은 부스번호 → 순위(1 = 가장 하고 싶음 … 5 = 하고 싶지 않음). 엔진·서버와 같은 값이다.
// 화면에는 '참여 선호도' 점수로 보여 준다: 점수 = 6 − 순위 (5점 = 꼭 하고 싶어요, 1점 = 안 하고 싶어요).
// 규칙은 서버 apps-script/src/30-apply.js 의 validatePrefs_ 와 같다.

export const GIL_ORDER = ['성장하길', '꿈키우길', '지속하길', '마주하길', '함께하길'];

export const RANKS = [
  { rank: 1, score: 5, short: '꼭', label: '꼭 하고 싶어요' },
  { rank: 2, score: 4, short: '좋아요', label: '하면 좋아요' },
  { rank: 3, score: 3, short: '시간 되면', label: '시간이 되면 해도 좋아요' },
  { rank: 4, score: 2, short: '별로', label: '굳이 하고 싶지 않아요' },
  { rank: 5, score: 1, short: '안 할래요', label: '재미없을 것 같거나 많이 해 봤어요' },
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
    return { prefs, error: rank === 1 ? `${g.gil}에서 5점(꼭 하고 싶어요)은 ${g.need}개까지예요. 다른 5점을 먼저 빼 주세요.` : `${scoreOf(rank)}점은 ${g.max}개까지 줄 수 있어요.` };
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
