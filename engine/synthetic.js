import { mulberry32 } from './rng.js';
import { firstPickCount } from './rules.js';

const GRADES = {
  오전: ['초1', '초2', '초3', '초4', '초5', '초6'],
  오후: ['중1', '중2', '중3', '고1', '고2', '고3'],
};

// 시험용 가상 신청자. 인기 부스 쏠림을 흉내 내려고 부스마다 인기 무게를 둔다.
export function makeApplicants({ booths, period, individuals = 300, groups = 80, seed = 1, quickRatio = 0.3, schools = 12 }) {
  const rand = mulberry32(seed);
  const list = booths.filter(b => b.kind === '배정' && b.periods.includes(period));
  const byGil = new Map();
  for (const b of list) {
    if (!byGil.has(b.gil)) byGil.set(b.gil, []);
    byGil.get(b.gil).push(b);
  }
  const pop = new Map(list.map(b => [b.no, 0.2 + rand() ** 2 * 3]));
  const grades = GRADES[period];
  const pick = arr => arr[Math.floor(rand() * arr.length)];

  function prefsFor() {
    const prefs = {};
    const quick = rand() < quickRatio;
    for (const gilBooths of byGil.values()) {
      const ordered = gilBooths
        .map(b => [b, pop.get(b.no) * rand()])
        .sort((x, y) => y[1] - x[1])
        .map(x => x[0]);
      // 1순위는 길마다 정해진 개수(기본 3, 지속하길 2). 빠른 신청은 1순위만 고른다
      const k = firstPickCount(ordered[0].gil, ordered.length);
      ordered.slice(0, k).forEach(b => { prefs[b.no] = 1; });
      if (quick) continue;
      const rest = ordered.slice(k);
      const per = Math.max(1, Math.ceil(rest.length / 4));
      rest.forEach((b, i) => { prefs[b.no] = Math.min(5, 2 + Math.floor(i / per)); });
    }
    return prefs;
  }

  const apps = [];
  for (let i = 0; i < individuals; i++) {
    apps.push({ id: `P${i + 1}`, type: '개인', school: `학교${1 + Math.floor(rand() * schools)}`,
      grade: pick(grades), size: 1, period, prefs: prefsFor(), blocked: [] });
  }
  let g = 0;
  while (g < groups) {
    const school = `학교${1 + Math.floor(rand() * schools)}`;
    const grade = pick(grades);
    const classKey = `${school}-${grade}-${1 + Math.floor(rand() * 4)}`;
    const classPrefs = prefsFor();
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n && g < groups; k++, g++) {
      apps.push({ id: `G${g + 1}`, type: '모둠', school, grade, classKey, size: 5 + Math.floor(rand() * 3),
        period, prefs: { ...classPrefs }, blocked: [] });
    }
  }
  return apps;
}
