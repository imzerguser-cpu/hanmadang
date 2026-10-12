// 선호 신청 규칙: 길마다 1순위로 고르는 부스 수 (서버 설정 '선호_1순위개수', '선호_1순위개수_지속하길'과 같은 기본값)
export const FIRST_PICKS = { default: 3, 지속하길: 2 };

// 대상 학년 때문에 그 길에서 고를 수 있는 부스가 적으면 있는 만큼만
export function firstPickCount(gil, available, rule) {
  rule = rule || FIRST_PICKS;
  return Math.min(rule[gil] ?? rule.default, available);
}
