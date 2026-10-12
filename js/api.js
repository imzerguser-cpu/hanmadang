import { API_URL } from './settings.js';

const KEY = 'hanmadang.api';

function apiUrl() {
  const fromQuery = new URLSearchParams(location.search).get('api');
  if (fromQuery) {
    try { localStorage.setItem(KEY, fromQuery); } catch { /* 저장 못 해도 이번엔 쓴다 */ }
    return fromQuery;
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch { /* 사생활 보호 모드 등 */ }
  return API_URL || '/api';
}

// 본문을 text/plain 으로 보내 Apps Script 사전 요청(preflight)을 피한다
export async function call(action, body = {}) {
  let res;
  try {
    res = await fetch(apiUrl(), { method: 'POST', body: JSON.stringify({ action, ...body }) });
  } catch {
    throw new Error('인터넷 연결을 확인해 주세요.');
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('서버 응답을 읽지 못했어요. 잠시 뒤 다시 해 주세요.');
  if (!data.ok) throw new Error(data.error);
  return data.data;
}

// 부스·회차·설정. 60초 동안 이 탭에 보관한다
export async function getConfig() {
  try {
    const hit = JSON.parse(sessionStorage.getItem('hanmadang.config') || 'null');
    if (hit && Date.now() - hit.at < 60000) return hit.data;
  } catch { /* 무시 */ }
  const data = await call('config');
  try { sessionStorage.setItem('hanmadang.config', JSON.stringify({ at: Date.now(), data })); } catch { /* 무시 */ }
  return data;
}
