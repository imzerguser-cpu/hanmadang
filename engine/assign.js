import { mulberry32, shuffle } from './rng.js';
import { PERIODS } from './sessions.js';
import { compatible, extraMove } from './travel.js';
import { rankOf, gradeOk, itemValue, baseScore, priorityCompare, WEIGHTS } from './score.js';
import { computeStats } from './stats.js';

const now = () => (globalThis.performance?.now ? performance.now() : Date.now());

function buildContext(booths, sessions, settings) {
  const assignBooths = booths.filter(b => b.kind === '배정');
  const gils = [...new Set(assignBooths.map(b => b.gil))];
  const boothsByGil = new Map(gils.map(g => [g, assignBooths.filter(b => b.gil === g)]));
  const boothByNo = new Map(booths.map(b => [b.no, b]));
  const sessionsByBooth = new Map();
  for (const s of sessions) {
    if (!sessionsByBooth.has(s.boothNo)) sessionsByBooth.set(s.boothNo, []);
    sessionsByBooth.get(s.boothNo).push(s);
  }
  for (const list of sessionsByBooth.values()) list.sort((a, b) => a.start - b.start);
  const sessById = new Map(sessions.map(s => [s.id, s]));
  return { gils, boothsByGil, boothByNo, sessionsByBooth, sessById, extraTable: settings.extraMove || {} };
}

function makeItem(booth, sess) {
  return { gil: booth.gil, boothNo: booth.no, sessionId: sess.id, start: sess.start, end: sess.end,
    moveMin: sess.moveMin, zone: booth.zone, floor: booth.floor };
}

function eligible(booth, app) {
  return booth.kind === '배정' && gradeOk(booth, app.grade) && booth.periods.includes(app.period);
}

function timeOk(ctx, app, items, cand, skip) {
  for (const it of items) {
    if (it === skip) continue;
    if (!compatible(it, cand, extraMove(it.zone, cand.zone, ctx.extraTable))) return false;
  }
  for (const bl of app.blocked || []) {
    const blk = { start: bl.start, end: bl.end, moveMin: bl.moveMin ?? 5, zone: bl.zone };
    if (!compatible(blk, cand, extraMove(blk.zone, cand.zone, ctx.extraTable))) return false;
  }
  return true;
}

// ---- 상태: 남은 자리, 신청자별 일정, 학급 모둠 묶기 색인 ----
function clusterKey(app, item) { return `${app.classKey}|${item.start}|${item.zone}`; }

function place(state, app, item) {
  state.sched.get(app.id).push(item);
  state.remaining.set(item.sessionId, state.remaining.get(item.sessionId) - app.size);
  if (!state.bySession.has(item.sessionId)) state.bySession.set(item.sessionId, new Set());
  state.bySession.get(item.sessionId).add(app.id);
  if (app.classKey) state.cluster.set(clusterKey(app, item), (state.cluster.get(clusterKey(app, item)) || 0) + 1);
}

function unplace(state, app, item) {
  const arr = state.sched.get(app.id);
  arr.splice(arr.indexOf(item), 1);
  state.remaining.set(item.sessionId, state.remaining.get(item.sessionId) + app.size);
  state.bySession.get(item.sessionId).delete(app.id);
  if (app.classKey) state.cluster.set(clusterKey(app, item), state.cluster.get(clusterKey(app, item)) - 1);
}

// item 자리에 이 신청자 말고 같은 학급 모둠이 몇이나 있는가
function clusterN(state, app, item) {
  if (!app.classKey) return 0;
  const key = clusterKey(app, item);
  const self = state.sched.get(app.id).filter(it => clusterKey(app, it) === key).length;
  return (state.cluster.get(key) || 0) - self;
}

function candidates(ctx, state, app, gil, skip) {
  const items = state.sched.get(app.id);
  const out = [];
  for (const b of ctx.boothsByGil.get(gil) || []) {
    if (!eligible(b, app)) continue;
    if (items.some(it => it !== skip && it.boothNo === b.no)) continue;
    for (const s of ctx.sessionsByBooth.get(b.no) || []) {
      if (s.period !== app.period) continue;
      const free = state.remaining.get(s.id) + (skip && skip.sessionId === s.id ? app.size : 0);
      if (free < app.size) continue;
      const cand = makeItem(b, s);
      if (!timeOk(ctx, app, items, cand, skip)) continue;
      out.push(cand);
    }
  }
  return out;
}

function missingGils(ctx, state, app) {
  const have = new Set(state.sched.get(app.id).map(i => i.gil));
  return ctx.gils.filter(g => !have.has(g));
}

export function assign({ booths, sessions, applicants, settings = {} }) {
  const rand = mulberry32(settings.seed ?? 1);
  const ctx = buildContext(booths, sessions, settings);
  const G = ctx.gils.length;
  const state = {
    remaining: new Map(sessions.map(s => [s.id, s.assignable])),
    sched: new Map(applicants.map(a => [a.id, []])),
    cluster: new Map(),
    bySession: new Map(),   // 회차 id → 그 회차에 배정된 신청자 id 모음
  };
  const score = app => baseScore(app, state.sched.get(app.id), G);

  // 추첨 번호를 붙이고 우선순위로 줄 세운다 (학년 낮은 순 → 작은 학교 순 → 추첨)
  const lottery = new Map(applicants.map(a => [a.id, rand()]));
  const cmpRaw = priorityCompare(settings);
  const cmp = (a, b) => cmpRaw({ ...a, lottery: lottery.get(a.id) }, { ...b, lottery: lottery.get(b.id) });
  const queue = [...applicants].sort(cmp);
  const hasFirst = app => state.sched.get(app.id).some(it => rankOf(app, it.boothNo) === 1);

  // ① 1순위 보장 (자리 옮겨 앉히기)
  const appById = new Map(applicants.map(a => [a.id, a]));
  const firstItem = new Map();                  // 신청자 id → 1단계에서 받은 1순위 칸
  const occupants = new Map();                  // 회차 id → 그 회차에 1순위로 앉은 신청자 id 목록
  const sit = (app, item) => {
    place(state, app, item);
    firstItem.set(app.id, item);
    if (!occupants.has(item.sessionId)) occupants.set(item.sessionId, []);
    occupants.get(item.sessionId).push(app.id);
  };
  const stand = app => {
    const item = firstItem.get(app.id);
    unplace(state, app, item);
    firstItem.delete(app.id);
    const list = occupants.get(item.sessionId);
    list.splice(list.indexOf(app.id), 1);
    return item;
  };
  // 정원은 따지지 않은 1순위 후보 (학년·시간대·비워 둘 시간만 확인)
  const firstCands = (app, excludeSession) => {
    const out = [];
    for (const [key, r] of Object.entries(app.prefs || {})) {
      if (r !== 1) continue;
      const booth = ctx.boothByNo.get(isNaN(key) ? key : Number(key));
      if (!booth || !eligible(booth, app)) continue;
      for (const sess of ctx.sessionsByBooth.get(booth.no) || []) {
        if (sess.period !== app.period || sess.id === excludeSession || sess.assignable < app.size) continue;
        const cand = makeItem(booth, sess);
        if (timeOk(ctx, app, [], cand)) out.push(cand);
      }
    }
    return out.sort((x, y) => (state.remaining.get(y.sessionId) - state.remaining.get(x.sessionId)) || (x.start - y.start));
  };
  function seat(app, depth, visited, excludeSession) {
    const cands = firstCands(app, excludeSession);
    for (const c of cands) {
      if (state.remaining.get(c.sessionId) >= app.size) { sit(app, c); return true; }
    }
    if (depth === 0) return false;
    for (const c of cands) {
      for (const occId of [...(occupants.get(c.sessionId) || [])]) {
        if (visited.has(occId)) continue;
        const occ = appById.get(occId);
        if (state.remaining.get(c.sessionId) + occ.size < app.size) continue;
        visited.add(occId);
        const back = stand(occ);
        if (seat(occ, depth - 1, visited, c.sessionId)) {
          if (state.remaining.get(c.sessionId) >= app.size) { sit(app, c); return true; }
        } else {
          sit(occ, back);
        }
      }
    }
    return false;
  }
  const depth = settings.augmentDepth ?? 4;
  for (const app of queue) seat(app, depth, new Set([app.id]));

  // ② 길 채우기: 덜 만족한 신청자부터 한 칸씩, 선택지가 가장 적은 길부터
  let progress = true;
  while (progress) {
    progress = false;
    const pending = applicants.filter(a => missingGils(ctx, state, a).length > 0);
    pending.sort((a, b) => (score(a) - score(b)) || cmp(a, b));
    for (const app of pending) {
      let bestOpts = null;
      for (const g of missingGils(ctx, state, app)) {
        const c = candidates(ctx, state, app, g);
        if (c.length && (!bestOpts || c.length < bestOpts.length)) bestOpts = c;
      }
      if (!bestOpts) continue;
      let best = null, bestVal = -Infinity;
      for (const c of bestOpts) {
        const v = itemValue(app, c.boothNo) + 0.01 * state.remaining.get(c.sessionId) + 2 * WEIGHTS.CLUSTER * clusterN(state, app, c);
        if (v > bestVal) { bestVal = v; best = c; }
      }
      place(state, app, best);
      progress = true;
    }
  }

  // ③ 개선: 옮기기·맞바꾸기를 시간 제한 안에서 반복 (점수가 오를 때만 받아들인다)
  const byPeriod = new Map();
  for (const a of applicants) {
    if (!byPeriod.has(a.period)) byPeriod.set(a.period, []);
    byPeriod.get(a.period).push(a);
  }

  function tryRelocate(app) {
    const items = state.sched.get(app.id);
    const missing = missingGils(ctx, state, app);
    let gil, old = null;
    if (missing.length && (rand() < 0.5 || !items.length)) gil = missing[Math.floor(rand() * missing.length)];
    else if (items.length) { old = items[Math.floor(rand() * items.length)]; gil = old.gil; }
    else return;
    const before = baseScore(app, items, G);
    const hadFirst = hasFirst(app);
    const nOld = old ? clusterN(state, app, old) : 0;
    let best = null, bestDelta = 1e-9;
    for (const c of candidates(ctx, state, app, gil, old)) {
      if (old && c.sessionId === old.sessionId) continue;
      const next = items.filter(i => i !== old).concat([c]);
      if (hadFirst && !next.some(it => rankOf(app, it.boothNo) === 1)) continue;
      const d = baseScore(app, next, G) - before + 2 * WEIGHTS.CLUSTER * (clusterN(state, app, c) - nOld);
      if (d > bestDelta) { bestDelta = d; best = c; }
    }
    if (best) { if (old) unplace(state, app, old); place(state, app, best); }
  }

  function trySwap(A) {
    const itemsA = state.sched.get(A.id);
    if (!itemsA.length) return;
    const a = itemsA[Math.floor(rand() * itemsA.length)];
    const peers = byPeriod.get(A.period);
    const B = peers[Math.floor(rand() * peers.length)];
    if (B === A) return;
    const b = state.sched.get(B.id).find(it => it.gil === a.gil);
    if (!b || b.sessionId === a.sessionId) return;
    const boothA = ctx.boothByNo.get(a.boothNo), boothB = ctx.boothByNo.get(b.boothNo);
    if (!eligible(boothB, A) || !eligible(boothA, B)) return;
    if (state.sched.get(A.id).some(it => it !== a && it.boothNo === b.boothNo)) return;
    if (state.sched.get(B.id).some(it => it !== b && it.boothNo === a.boothNo)) return;

    const beforeA = baseScore(A, itemsA, G), beforeB = baseScore(B, state.sched.get(B.id), G);
    const firstA = hasFirst(A), firstB = hasFirst(B);
    unplace(state, A, a); unplace(state, B, b);
    const nA0 = clusterN(state, A, a), nB0 = clusterN(state, B, b);
    const newA = makeItem(boothB, ctx.sessById.get(b.sessionId));
    const newB = makeItem(boothA, ctx.sessById.get(a.sessionId));
    const ok = state.remaining.get(newA.sessionId) >= A.size && state.remaining.get(newB.sessionId) >= B.size
      && timeOk(ctx, A, state.sched.get(A.id), newA) && timeOk(ctx, B, state.sched.get(B.id), newB);
    let delta = -Infinity;
    if (ok) {
      delta = baseScore(A, state.sched.get(A.id).concat([newA]), G) - beforeA
        + baseScore(B, state.sched.get(B.id).concat([newB]), G) - beforeB
        + 2 * WEIGHTS.CLUSTER * (clusterN(state, A, newA) - nA0 + clusterN(state, B, newB) - nB0);
    }
    const keepsFirst = (app, had, rest, added) => !had || rest.concat([added]).some(it => rankOf(app, it.boothNo) === 1);
    const fair = ok && keepsFirst(A, firstA, state.sched.get(A.id), newA) && keepsFirst(B, firstB, state.sched.get(B.id), newB);
    if (fair && delta > 1e-9) { place(state, A, newA); place(state, B, newB); }
    else { place(state, A, a); place(state, B, b); }
  }

  // 길 끼워 넣기: 빈 길에 들어갈 시간이 없을 때
  //  (가) 내 일정 하나를 다른 회차로 옮기고 그 자리에 빈 길을 넣는다
  //  (나) 그 회차에 앉은 다른 사람을 같은 길의 다른 회차로 옮기고 그 자리를 받는다
  const keepsFirstAfter = (app, had) => !had || hasFirst(app);
  const bestOf = (app, cands) => {
    let best = null, bestVal = -Infinity;
    for (const c of cands) {
      const v = itemValue(app, c.boothNo) + 0.01 * state.remaining.get(c.sessionId);
      if (v > bestVal) { bestVal = v; best = c; }
    }
    return best;
  };
  function tryRepair(app) {
    const missing = missingGils(ctx, state, app);
    if (!missing.length) return;
    const g = missing[Math.floor(rand() * missing.length)];
    const items = state.sched.get(app.id);
    const had = hasFirst(app);
    const before = baseScore(app, items, G);
    const slots = [];
    for (const b of ctx.boothsByGil.get(g) || []) {
      if (!eligible(b, app) || items.some(it => it.boothNo === b.no)) continue;
      for (const s of ctx.sessionsByBooth.get(b.no) || []) if (s.period === app.period) slots.push(makeItem(b, s));
    }
    for (const cand of shuffle(slots, rand).slice(0, 24)) {
      if (!timeOk(ctx, app, [], cand)) continue;               // 비워 둘 시간
      const conflicts = items.filter(it => !compatible(it, cand, extraMove(it.zone, cand.zone, ctx.extraTable)));
      const free = state.remaining.get(cand.sessionId);

      if (conflicts.length === 1 && free >= app.size) {         // (가)
        const moved = conflicts[0];
        unplace(state, app, moved);
        place(state, app, cand);
        const alt = bestOf(app, candidates(ctx, state, app, moved.gil));
        if (alt) {
          place(state, app, alt);
          if (keepsFirstAfter(app, had) && baseScore(app, state.sched.get(app.id), G) > before) return;
          unplace(state, app, alt);
        }
        unplace(state, app, cand);
        place(state, app, moved);
        continue;
      }

      if (conflicts.length === 0 && free < app.size) {          // (나)
        for (const occId of [...(state.bySession.get(cand.sessionId) || [])]) {
          const occ = appById.get(occId);
          if (free + occ.size < app.size) continue;
          const occItem = state.sched.get(occ.id).find(it => it.sessionId === cand.sessionId);
          const occHad = hasFirst(occ);
          const occBefore = baseScore(occ, state.sched.get(occ.id), G);
          unplace(state, occ, occItem);
          const alt = bestOf(occ, candidates(ctx, state, occ, g).filter(c => c.sessionId !== cand.sessionId));
          if (alt) {
            place(state, occ, alt);
            if (state.remaining.get(cand.sessionId) >= app.size) {
              place(state, app, cand);
              const delta = baseScore(occ, state.sched.get(occ.id), G) - occBefore + baseScore(app, state.sched.get(app.id), G) - before;
              if (delta > 1e-9 && keepsFirstAfter(occ, occHad)) return;
              unplace(state, app, cand);
            }
            unplace(state, occ, alt);
          }
          place(state, occ, occItem);
        }
      }
    }
  }

  const timeLimit = settings.timeLimitMs ?? 20000;
  const maxIter = settings.maxIter ?? Infinity;
  const deadline = now() + timeLimit;
  let incomplete = [];
  if (applicants.length && timeLimit > 0) {
    for (let iter = 0; iter < maxIter; iter++) {
      if ((iter & 63) === 0) {
        if (now() > deadline) break;
        incomplete = applicants.filter(a => missingGils(ctx, state, a).length > 0);
      }
      if (incomplete.length && rand() < 0.5) {
        tryRepair(incomplete[Math.floor(rand() * incomplete.length)]);
        continue;
      }
      const app = applicants[Math.floor(rand() * applicants.length)];
      if (rand() < 0.5) tryRelocate(app); else trySwap(app);
    }
  }

  // ④ 결과 정리
  const assignments = [];
  for (const app of applicants) {
    for (const it of [...state.sched.get(app.id)].sort((x, y) => x.start - y.start)) {
      assignments.push({ applicantId: app.id, boothNo: it.boothNo, sessionId: it.sessionId, gil: it.gil, start: it.start, end: it.end, size: app.size });
    }
  }

  // ⑤ 빈 시간(15분 이상)에 추천 부스 넣기: 앞 체험과 같은 층의 추천 부스를 먼저
  const recBooths = booths.filter(b => b.kind === '추천' && b.periods.some(Boolean));
  const minGap = settings.minGapMin ?? 15;
  const recommendations = [];
  if (recBooths.length) {
    for (const app of applicants) {
      const period = PERIODS[app.period];
      const busy = [
        ...state.sched.get(app.id).map(it => ({ start: it.start, end: it.end + it.moveMin, floor: it.floor })),
        ...(app.blocked || []).map(bl => ({ start: bl.start, end: bl.end + (bl.moveMin ?? 5), floor: null })),
      ].sort((x, y) => x.start - y.start);
      let cursor = period.start, prevFloor = null;
      for (const slot of [...busy, { start: period.end, end: period.end, floor: null }]) {
        if (slot.start - cursor >= minGap) {
          const pick = recBooths.find(b => b.floor === prevFloor) || recBooths[0];
          recommendations.push({ applicantId: app.id, boothNo: pick.no, start: cursor, end: slot.start });
        }
        cursor = Math.max(cursor, slot.end);
        if (slot.floor !== null) prevFloor = slot.floor;
      }
    }
  }

  return { assignments, recommendations, stats: computeStats({ applicants, assignments, booths, sessions }) };
}
