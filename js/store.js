// 이 기기에만 저장 (사생활 보호 모드 등에서 실패해도 화면은 동작)
const PREFIX = 'hanmadang.';

export function load(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 저장 못 해도 계속 */ }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* 무시 */ }
}
