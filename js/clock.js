// 서버 시각에 맞춘 '지금'. 행사 화면은 모두 이 시계를 쓴다.
let offset = 0;

export function syncClock(serverNowMs) {
  if (typeof serverNowMs === 'number') offset = serverNowMs - Date.now();
}

export function nowMs() {
  return Date.now() + offset;
}

export function kst(ms = nowMs()) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

// 행사일 자정부터의 분. 전날까지는 -1, 다음 날부터는 1441
export function eventNowMin(eventDate) {
  const p = kst();
  if (p.date < eventDate) return -1;
  if (p.date > eventDate) return 24 * 60 + 1;
  return p.min;
}
