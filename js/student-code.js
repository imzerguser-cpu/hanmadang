import { call } from './api.js';
import { GRADE_OPTIONS } from './util.js';

// 학생 안내코드는 학교·학년마다 하나라서, 코드만 넣으면 학교와 학년이 정해진다 (학년을 따로 고르지 않는다)
const gradeLabel = g => (GRADE_OPTIONS.find(([v]) => v === g) || [g, g])[1];

export async function lookupCode(code) {
  return call('student.code', { code: String(code || '').trim().toUpperCase() });
}

// 코드 칸 아래에 '○○초등학교 초등 4학년' 을 바로 보여 준다
export function attachCodeHint(input, out) {
  let seq = 0;
  const check = async () => {
    const v = input.value.trim().toUpperCase();
    const my = ++seq;
    if (v.length < 6) { out.textContent = ''; out.className = 'hint'; return; }
    try {
      const r = await lookupCode(v);
      if (my !== seq) return;
      out.textContent = `${r.school} ${gradeLabel(r.grade)} 안내코드예요.`;
      out.className = 'hint ok';
    } catch (err) {
      if (my !== seq) return;
      out.textContent = err.message;
      out.className = 'hint bad';
    }
  };
  input.addEventListener('input', check);
  if (input.value) check();
}
