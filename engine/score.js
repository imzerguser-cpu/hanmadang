export const RANK_SCORE = { 1: 10, 2: 6, 3: 3, 0: 2, 4: 0, 5: -10 };

// 설계서 5장 우선순위를 점수 무게로 옮긴 값
export const WEIGHTS = {
  HAS_FIRST: 1000,   // 1순위를 하나라도 가지면
  MISSING_GIL: 200,  // 못 채운 길 하나당
  RANK5: 50,         // 5순위 배정 하나당 (RANK_SCORE에 더해 추가 감점)
  CLUSTER: 2,        // 같은 학급 모둠이 같은 시각·같은 구역이면 짝마다
  FLOOR_CHANGE: 1,   // 이어지는 체험 사이 층(또는 실내↔야외)이 바뀔 때마다
};

export function rankOf(app, boothNo) {
  return app.prefs?.[boothNo] ?? 0;
}

export const GRADE_ORDER = ['유', '초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '성인'];

// 자리가 모자랄 때 누가 먼저인가. settings.priority 기본 ['grade', 'schoolSize', 'lottery']
// settings.schoolSize: { 학교명: 전교생 수 } — 없는 학교는 맨 뒤
export function priorityCompare(settings = {}) {
  const order = settings.priority ?? ['grade', 'schoolSize', 'lottery'];
  const sizes = settings.schoolSize || {};
  const gradeIdx = g => { const i = GRADE_ORDER.indexOf(g); return i < 0 ? GRADE_ORDER.length : i; };
  const keys = {
    grade: a => gradeIdx(a.grade),
    schoolSize: a => sizes[a.school] ?? Infinity,
    lottery: a => a.lottery ?? 0,
  };
  return (a, b) => {
    for (const k of order) {
      const x = keys[k](a), y = keys[k](b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };
}

export function gradeOk(booth, grade) {
  return !booth.grades || booth.grades.length === 0 || booth.grades.includes(grade);
}

export function itemValue(app, boothNo) {
  const r = rankOf(app, boothNo);
  return RANK_SCORE[r] - (r === 5 ? WEIGHTS.RANK5 : 0);
}

export function baseScore(app, items, gilCount) {
  let s = 0;
  let hasFirst = false;
  for (const it of items) {
    s += itemValue(app, it.boothNo);
    if (rankOf(app, it.boothNo) === 1) hasFirst = true;
  }
  if (hasFirst) s += WEIGHTS.HAS_FIRST;
  s -= WEIGHTS.MISSING_GIL * (gilCount - new Set(items.map(i => i.gil)).size);
  const sorted = [...items].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].floor !== sorted[i - 1].floor) s -= WEIGHTS.FLOOR_CHANGE;
  }
  return s;
}
