// 요소 만들기: h('button', { class: 'btn', onclick }, '글자', 다른요소)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const GIL_COLORS = {
  성장하길: '#f2c200',
  꿈키우길: '#5b7fd6',
  지속하길: '#2f9e5b',
  마주하길: '#f07a2a',
  함께하길: '#a25cc2',
  이벤트: '#888888',
  전시: '#888888',
};

export function fmtTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

let toastTimer;
export function toast(msg, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, kind === 'error' ? 4500 : 2500);
}

// 버튼을 누르는 동안 막고, 오류는 알림으로
export async function busy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '잠시만요…';
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

export const GRADE_OPTIONS = [
  ['초1', '초등 1학년'], ['초2', '초등 2학년'], ['초3', '초등 3학년'], ['초4', '초등 4학년'], ['초5', '초등 5학년'],
  ['초6', '초등 6학년'], ['중1', '중학교 1학년'], ['중2', '중학교 2학년'], ['중3', '중학교 3학년'],
  ['고1', '고등학교 1학년'], ['고2', '고등학교 2학년'], ['고3', '고등학교 3학년'],
];

// 'YYYY-MM-DD HH:MM' → '11월 3일(화) 18:00'
export function fmtDeadline(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const day = '일월화수목금토'[d.getUTCDay()];
  return `${+m[2]}월 ${+m[3]}일(${day}) ${m[4]}:${m[5]}`;
}

export function deadlineMs(s) {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00+09:00`) : NaN;
}
