import { gradeOk } from './score.js';
import { compatible, extraMove } from './travel.js';

// 배정 결과가 설계서 5장 '꼭 지킬 조건'을 지키는지 검사한다. 위반 문장 목록을 돌려준다.
export function validate({ booths, sessions, applicants, assignments, settings = {} }) {
  const errs = [];
  const boothByNo = new Map(booths.map(b => [b.no, b]));
  const sessById = new Map(sessions.map(s => [s.id, s]));
  const appById = new Map(applicants.map(a => [a.id, a]));
  const extra = settings.extraMove || {};
  const used = new Map();
  const byApp = new Map();

  for (const a of assignments) {
    const sess = sessById.get(a.sessionId);
    const booth = boothByNo.get(a.boothNo);
    const app = appById.get(a.applicantId);
    if (!sess || !booth || !app) { errs.push(`알 수 없는 항목 ${a.applicantId} ${a.boothNo} ${a.sessionId}`); continue; }
    if (sess.boothNo !== booth.no) errs.push(`회차-부스 불일치 ${a.sessionId} ${booth.no}`);
    if (booth.kind !== '배정') errs.push(`배정 대상 아님 ${booth.no}`);
    if (!gradeOk(booth, app.grade)) errs.push(`학년 불일치 ${app.id} ${booth.no}`);
    if (sess.period !== app.period) errs.push(`시간대 불일치 ${app.id} ${a.sessionId}`);
    used.set(sess.id, (used.get(sess.id) || 0) + app.size);
    if (!byApp.has(app.id)) byApp.set(app.id, []);
    byApp.get(app.id).push({ ...a, gil: booth.gil, start: sess.start, end: sess.end, moveMin: sess.moveMin, zone: booth.zone });
  }

  for (const [sid, n] of used) {
    const s = sessById.get(sid);
    if (n > s.assignable) errs.push(`정원 초과 ${sid} ${n}/${s.assignable}`);
  }

  for (const [appId, items] of byApp) {
    const app = appById.get(appId);
    const gils = new Set();
    const boothsSeen = new Set();
    for (const it of items) {
      if (gils.has(it.gil)) errs.push(`같은 길 중복 ${appId} ${it.gil}`);
      gils.add(it.gil);
      if (boothsSeen.has(it.boothNo)) errs.push(`같은 부스 중복 ${appId} ${it.boothNo}`);
      boothsSeen.add(it.boothNo);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const x = items[i], y = items[j];
        if (!compatible(x, y, extraMove(x.zone, y.zone, extra))) errs.push(`시간 겹침 ${appId} ${x.sessionId} ${y.sessionId}`);
      }
      for (const bl of app.blocked || []) {
        const blk = { start: bl.start, end: bl.end, moveMin: bl.moveMin ?? 5, zone: bl.zone };
        if (!compatible(blk, items[i], extraMove(blk.zone, items[i].zone, extra))) errs.push(`비워 둘 시간 겹침 ${appId} ${items[i].sessionId}`);
      }
    }
  }
  return errs;
}
