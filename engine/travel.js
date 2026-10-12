// 구역 사이 추가 이동 분. 표 키는 'zoneA|zoneB', 어느 방향으로 적어도 된다.
export function extraMove(zoneA, zoneB, table = {}) {
  if (zoneA === zoneB) return 0;
  return table[`${zoneA}|${zoneB}`] ?? table[`${zoneB}|${zoneA}`] ?? 0;
}

// 두 체험을 한 사람이 둘 다 할 수 있는가 (어느 쪽이 먼저든)
export function compatible(a, b, extra = 0) {
  return a.end + a.moveMin + extra <= b.start || b.end + b.moveMin + extra <= a.start;
}
