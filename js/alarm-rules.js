// 부스 운영자 알림 규칙 (화면과 무관해서 Node에서도 시험한다)
// 부스 기기는 하루 종일 화면을 켜 두고 쓰므로 푸시 서버 없이도 화면 안 알림이 확실하게 닿는다.
// - 회차 시작 LEAD분 전부터 시작 전까지: "곧 시작, 명단 준비"
// - 회차가 끝난 뒤 SIGN_WINDOW분 동안 주강사 서명이 없으면: "강사 서명을 해 주세요"
export const LEAD = 5;
export const SIGN_WINDOW = 15;

const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function boothAlerts(sessions, nowMin, lead = LEAD) {
  const out = [];
  sessions.forEach((s, i) => {
    const n = i + 1;
    if (nowMin >= s.start - lead && nowMin < s.start) {
      const booked = (s.list || []).filter(p => p.status !== '취소').reduce((k, p) => k + (p.size || 1), 0);
      out.push({ key: `start|${s.id}`, session: s,
        title: `${n}회차 ${hhmm(s.start)} · ${s.start - nowMin}분 뒤 시작`,
        body: `신청 ${booked}명. 학생이 오면 [참여 확인]을 눌러 주세요.` });
    }
    const signed = (s.signs || []).some(g => g.role === '주강사');
    if (!signed && nowMin >= s.end && nowMin < s.end + SIGN_WINDOW) {
      out.push({ key: `sign|${s.id}`, session: s,
        title: `${n}회차 강사 서명을 해 주세요`,
        body: `${hhmm(s.start)} 회차가 끝났어요. 강사비 지급 증빙용으로 주강사(보조강사) 서명이 필요해요.` });
    }
  });
  return out;
}
