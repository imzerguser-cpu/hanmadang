// 행사 당일 체험 시간 알림 규칙 (화면과 무관해서 Node에서도 시험한다)
// - 체험 시작 LEAD분 전부터 시작 전까지: "곧 시작, 지금 출발"
// - 체험이 끝난 뒤 3분 동안: "끝났어요, 다음은 어디"
export const LEAD = 5;

export function dueAlerts(items, nowMin, lead = LEAD) {
  const main = items.filter(i => i.kind !== '추천');
  const out = [];
  main.forEach((it, i) => {
    if (it.status === '참여') return;
    const before = main[i - 1];
    const endDue = before && nowMin >= before.end && nowMin < before.end + 3;   // 앞 체험 "끝났어요" 알림이 다음 장소를 이미 알려 준다
    if (!endDue && nowMin >= it.start - lead && nowMin < it.start) {
      const left = it.start - nowMin;
      out.push({ key: `start|${it.start}|${it.name}`, item: it, prev: main[i - 1] || null,
        title: `${left}분 뒤 체험 시작`, body: `${it.name} · ${it.place}. 지금 출발하세요.` });
    }
  });
  main.forEach((it, i) => {
    if (nowMin >= it.end && nowMin < it.end + 3) {
      const next = main[i + 1];
      out.push({ key: `end|${it.end}|${it.name}`, item: next || null, prev: it,
        title: '체험이 끝났어요',
        body: next ? `다음은 ${next.name} · ${next.place}. 길 안내를 보세요.` : '오늘 배정된 체험을 모두 마쳤어요.' });
    }
  });
  return out;
}
