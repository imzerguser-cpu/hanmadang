import { rankOf, RANK_SCORE } from './score.js';

export function computeStats({ applicants, assignments, booths, sessions }) {
  const gilCount = new Set(booths.filter(b => b.kind === '배정').map(b => b.gil)).size;
  const byApp = new Map(applicants.map(a => [a.id, []]));
  for (const a of assignments) byApp.get(a.applicantId)?.push(a);

  let withFirst = 0, complete5 = 0, rank5 = 0, scoreSum = 0, itemCount = 0, people = 0;
  const failed = [];
  const schools = new Map();
  const missingByGil = {};
  const firstsHist = {};   // 1순위를 몇 개 받았나 → 신청 건수
  const allGils = [...new Set(booths.filter(b => b.kind === '배정').map(b => b.gil))];

  for (const app of applicants) {
    people += app.size;
    const items = byApp.get(app.id);
    const firsts = items.filter(it => rankOf(app, it.boothNo) === 1).length;
    firstsHist[firsts] = (firstsHist[firsts] || 0) + 1;
    const hasFirst = firsts > 0;
    if (hasFirst) withFirst++;
    const gils = new Set(items.map(i => i.gil));
    if (gils.size === gilCount) complete5++;
    for (const g of allGils) if (!gils.has(g)) missingByGil[g] = (missingByGil[g] || 0) + 1;
    for (const it of items) {
      const r = rankOf(app, it.boothNo);
      if (r === 5) rank5++;
      scoreSum += RANK_SCORE[r];
      itemCount++;
    }
    if (!hasFirst || gils.size < gilCount) failed.push(app.id);
    schools.set(app.school, (schools.get(app.school) || false) || hasFirst);
  }

  const boothFill = {};
  for (const s of sessions) {
    boothFill[s.boothNo] ??= { assigned: 0, assignable: 0 };
    boothFill[s.boothNo].assignable += s.assignable;
  }
  for (const a of assignments) boothFill[a.boothNo].assigned += a.size;

  // 길별로 배정 자리가 신청 인원보다 모자라면 그 길은 누군가 못 채운다 (관리 화면 병목 표시용)
  const gilOf = new Map(booths.map(b => [b.no, b.gil]));
  const periods = [...new Set(applicants.map(a => a.period))];
  const supplyByGil = {};
  for (const g of allGils) supplyByGil[g] = { seats: 0, needed: people };
  for (const s of sessions) {
    if (periods.includes(s.period) && supplyByGil[gilOf.get(s.boothNo)]) supplyByGil[gilOf.get(s.boothNo)].seats += s.assignable;
  }

  const n = applicants.length || 1;
  return {
    applicants: applicants.length, people,
    withFirst, rateFirst: withFirst / n,
    complete5, rateComplete: complete5 / n,
    rank5, avgScore: itemCount ? scoreSum / itemCount : 0,
    schools: schools.size, schoolsWithFirst: [...schools.values()].filter(Boolean).length,
    missingByGil, supplyByGil, firstsHist, boothFill, failed,
  };
}
