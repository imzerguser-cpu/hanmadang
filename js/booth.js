// 부스 운영자 화면: 명단·참여 확인·현장 접수. 처리는 기기에 먼저 쌓고(대기열) 30초마다 서버로 보낸다.
import { call } from './api.js';
import { h, $, clear, toast, fmtTime } from './util.js';
import * as store from './store.js';

const params = new URLSearchParams(location.search);
const boothNo = params.get('b') || store.load('booth.last.b');
const token = params.get('t') || store.load('booth.last.t');
const K = `booth.${boothNo}`;
let roster = store.load(`${K}.roster`);
let queue = store.load(`${K}.queue`, []);
let device = store.load('booth.device');
if (!device) { device = Math.random().toString(36).slice(2, 8); store.save('booth.device', device); }
let seq = store.load(`${K}.seq`, 0);
let online = true;
let syncing = false;
const open = new Set();
const drafts = {};          // 회차별 현장 접수 입력 중인 내용 (화면을 다시 그려도 지워지지 않게)
let renderLater = false;

// 운영자가 입력 칸에 글을 쓰는 중이면 자동 동기화가 화면을 다시 그리지 않는다
function typing() {
  const el = document.activeElement;
  return !!(el && el.tagName === 'INPUT' && el.closest('#sessions'));
}

const ROUTE = { 자동배정: '배정', 실시간: '현장 예약', 특강사전: '사전 예약', 현장접수: '현장 접수' };

function setNet(ok) {
  online = ok;
  const el = $('#net');
  el.classList.toggle('off', !ok);
  el.textContent = `${ok ? '연결됨' : '오프라인'}${queue.length ? ` · 전송 대기 ${queue.length}` : ''}`;
}

function persist() {
  store.save(`${K}.roster`, roster);
  store.save(`${K}.queue`, queue);
  store.save(`${K}.seq`, seq);
}

function nextOpId() {
  seq += 1;
  return `${boothNo}-${device}-${seq}`;
}

// 처리를 화면에 먼저 반영하고 대기열에 넣는다
function enqueue(op, applyLocal) {
  queue.push({ ...op, opId: nextOpId(), at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
  applyLocal();
  persist();
  render();
  sync();
}

function check(person, on) {
  enqueue({ t: on ? 'check' : 'uncheck', rid: person.rid }, () => {
    person.status = on ? '참여' : (person.route === '자동배정' ? '배정' : person.route === '현장접수' ? '취소' : '예약');
  });
}

function walkin(session, pid, label, size) {
  if (!pid && !label) { toast('참가번호·모둠 코드나 이름을 넣어 주세요.', 'error'); return false; }
  drafts[session.id] = { pid: '', label: '', size: '1' };
  enqueue({ t: 'walkin', sessionId: session.id, pid, label, size }, () => {
    session.list.push({ rid: `tmp-${seq}`, label: pid ? `${pid} (확인 중)` : label, size, route: '현장접수', status: '참여', pending: true });
  });
  return true;
}

function sessionView(s, nowMin) {
  const active = s.list.filter(p => p.status !== '취소');
  const came = active.filter(p => p.status === '참여').reduce((n, p) => n + p.size, 0);
  const booked = active.reduce((n, p) => n + p.size, 0);
  const isNow = s.start <= nowMin + 10 && nowMin < s.end;
  const expanded = open.has(s.id) || (open.size === 0 && isNow);
  const head = h('button', { type: 'button', class: 'slot', style: `--gil:${isNow ? 'var(--accent)' : 'var(--line)'}`, 'aria-expanded': String(expanded),
    onclick: () => { if (open.has(s.id)) open.delete(s.id); else open.add(s.id); render(); } },
    h('span', { class: 'time' }, fmtTime(s.start), h('small', {}, fmtTime(s.end))),
    h('span', { class: 'what' }, h('b', {}, `신청 ${booked}명 · 참여 ${came}명 · 미도착 ${Math.max(0, booked - came)}명`), h('small', {}, `남은 자리 ${s.available} / 정원 ${s.capacity}`)),
    h('span', { class: 'badge' }, expanded ? '▲' : '▼'));
  const wrap = h('div', {}, head);
  if (!expanded) return wrap;
  const list = h('div', { class: 'card', style: 'margin-top:-4px' });
  if (!active.length) list.append(h('p', { class: 'muted' }, '아직 명단이 없어요.'));
  for (const p of active) {
    const done = p.status === '참여';
    list.append(h('div', { class: 'rec' },
      h('span', {}, h('b', {}, p.label), h('small', {}, `${p.size}명 · ${ROUTE[p.route] || p.route}${p.pending ? ' · 전송 대기' : ''}`)),
      p.pending ? h('span', { class: 'badge' }, '✓ 접수')
        : done ? h('button', { type: 'button', class: 'btn small', onclick: () => check(p, false) }, '✓ 확인됨 (되돌리기)')
          : h('button', { type: 'button', class: 'btn small primary', onclick: () => check(p, true) }, '참여 확인')));
  }
  const d = drafts[s.id] || (drafts[s.id] = { pid: '', label: '', size: '1' });
  const keep = key => e => { d[key] = e.target.value; };
  const pid = h('input', { placeholder: '참가번호 또는 모둠 코드 (예: L0012)', autocapitalize: 'characters', value: d.pid, oninput: keep('pid') });
  const label = h('input', { placeholder: '번호가 없으면: 학교 학년 이름 (예: 마산초 2 이OO)', value: d.label, oninput: keep('label') });
  const size = h('input', { type: 'number', min: '1', max: '40', value: d.size, style: 'max-width:90px', oninput: keep('size') });
  list.append(h('div', { style: 'margin-top:12px;border-top:1px solid var(--line);padding-top:10px' },
    h('b', {}, '현장 접수'),
    pid, label,
    h('div', { class: 'row', style: 'align-items:center' }, h('label', {}, '인원 ', size),
      h('button', { type: 'button', class: 'btn primary', onclick: () => {
        const ok = walkin(s, pid.value.trim().toUpperCase(), label.value.trim(), Math.max(1, Number(size.value) || 1));
        if (ok) drafts[s.id] = { pid: '', label: '', size: '1' };
      } }, '현장 접수'))));
  wrap.append(list);
  return wrap;
}

function nowMinGuess() {
  if (!roster) return -1;
  const elapsed = Math.floor((Date.now() - (roster.fetchedAt || Date.now())) / 60000);
  return roster.nowMin >= 0 && roster.nowMin <= 1440 ? roster.nowMin + elapsed : roster.nowMin;
}

function render() {
  setNet(online);
  if (!roster) return;
  $('#title').textContent = `${roster.booth.no}. ${roster.booth.name}`;
  $('#place').textContent = [roster.booth.gil, roster.booth.place].filter(Boolean).join(' · ');
  $('#emergency').classList.toggle('hidden', !roster.emergency);
  const box = clear($('#sessions'));
  const nowMin = nowMinGuess();
  for (const s of roster.sessions) box.append(sessionView(s, nowMin));
}

function takeRoster(r) {
  // 아직 서버로 못 보낸 처리는 새 명단 위에 다시 반영
  roster = { ...r, fetchedAt: Date.now() };
  for (const op of queue) {
    for (const s of roster.sessions) {
      if (op.t === 'walkin' && s.id === op.sessionId) s.list.push({ rid: `tmp-${op.opId}`, label: op.pid || op.label, size: op.size, route: '현장접수', status: '참여', pending: true });
      const p = s.list.find(x => x.rid === op.rid);
      if (p) p.status = op.t === 'check' ? '참여' : (p.route === '자동배정' ? '배정' : '예약');
    }
  }
  persist();
}

async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    if (queue.length) {
      const sent = queue.slice();
      const r = await call('booth.sync', { boothNo, token, ops: sent });
      const failed = r.results.filter(x => !x.ok);
      if (failed.length) toast(`처리하지 못한 기록 ${failed.length}건: ${failed[0].error}`, 'error');
      queue = queue.slice(sent.length);
      takeRoster(r.roster);
    } else {
      takeRoster(await call('booth.roster', { boothNo, token }));
    }
    setNet(true);
    $('#error').classList.add('hidden');
  } catch (err) {
    if (/운영자 주소/.test(err.message)) {
      $('#error').textContent = err.message;
      $('#error').classList.remove('hidden');
    }
    setNet(false);
  } finally {
    syncing = false;
    if (typing()) { renderLater = true; setNet(online); } else render();
  }
}

if (!boothNo || !token) {
  $('#title').textContent = '운영자 주소가 필요해요';
  $('#error').textContent = '교육지원청에서 받은 부스 운영자 QR(주소)로 들어와 주세요.';
  $('#error').classList.remove('hidden');
} else {
  store.save('booth.last.b', boothNo);
  store.save('booth.last.t', token);
  render();
  sync();
  setInterval(sync, 30000);
  document.addEventListener('focusout', () => setTimeout(() => { if (renderLater && !typing()) { renderLater = false; render(); } }, 0));
  window.addEventListener('online', sync);
  window.addEventListener('offline', () => setNet(false));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
