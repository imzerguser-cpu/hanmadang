export const PERIODS = {
  오전: { start: 600, end: 720 },
  오후: { start: 780, end: 900 },
};

function ratioFor(onsiteRatio, period) {
  if (typeof onsiteRatio === 'number') return onsiteRatio;
  return onsiteRatio?.[period] ?? 0.3;
}

// 배정 부스만 회차를 만든다. 체험이 시간대 끝을 넘으면 그 회차는 만들지 않는다.
export function generateSessions(booths, settings = {}) {
  const out = [];
  for (const b of booths) {
    if (b.kind !== '배정') continue;
    for (const period of b.periods) {
      const { start, end } = PERIODS[period];
      const step = b.expMin + b.moveMin;
      const ratio = ratioFor(settings.onsiteRatio ?? 0.3, period);
      const reserved = b.capacity <= 3 ? 0 : Math.floor(b.capacity * ratio);
      let idx = 1;
      for (let t = start; t + b.expMin <= end; t += step) {
        out.push({
          id: `${b.no}-${period}-${idx}`, boothNo: b.no, period, idx,
          start: t, end: t + b.expMin, moveMin: b.moveMin,
          capacity: b.capacity, reserved, assignable: b.capacity - reserved,
        });
        idx++;
      }
    }
  }
  return out;
}
