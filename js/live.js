import { call, getConfig } from './api.js';
import { h, $, clear, toast, busy, GIL_COLORS, fmtTime } from './util.js';
import { syncClock, eventNowMin } from './clock.js';
import { ROOMS, room, directions, mapSvg } from './floorplan.js';
import { GIL_ORDER } from './prefs-model.js';
import { recommend, SORTS } from './recommend.js';
import * as store from './store.js';

let config;
let cred = store.load('live.cred');
let mine = { items: [], stamps: [] };
let summary = { seats: [], emergency: false, nowMin: -1 };
let sort = store.load('live.sort', 'soon');
let here = store.load('live.here', null);

const nowMin = () => eventNowMin(config.settings['행사일']);

function setMode(mode) {
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('#form-new').classList.toggle('hidden', mode !== 'new');
  $('#form-old').classList.toggle('hidden', mode !== 'old');
}

// 지금 위치: 직접 고른 곳 > 마지막으로 참여한 곳 > 로비
function currentZone() {
  if (here) return here;
  const last = [...mine.items].filter(i => i.status === '참여').sort((a, b) => b.start - a.start)[0];
  return (last && last.zone) || 'lobby';
}

function showMap(name, start, zone) {
  $('#map-title').textContent = `${fmtTime(start)} ${name}`;
  $('#map-dir').textContent = directions(currentZone(), zone);
  $('#map').innerHTML = mapSvg({ from: currentZone(), to: zone });
  $('#map-box').classList.remove('hidden');
  $('#map-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderStamps() {
  const box = clear($('#stamps'));
  for (const g of GIL_ORDER) {
    const done = mine.stamps.includes(g);
    box.append(h('div', { class: `stamp${done ? ' done' : ''}`, style: `--gil:${GIL_COLORS[g]}` }, h('span', { class: 'dot' }, done ? '✓' : ''), h('small', {}, g)));
  }
}

function renderMine() {
  const box = clear($('#mine'));
  const items = mine.items.filter(i => i.status === '예약' || i.status === '참여');
  if (!items.length) { box.append(h('p', { class: 'muted' }, '아직 예약이 없어요. 아래 추천에서 골라 보세요.')); return; }
  const now = nowMin();
  for (const it of items) {
    const canCancel = it.status === '예약' && it.start > now && it.route === '실시간';
    box.append(h('div', { class: 'slot', style: `--gil:${GIL_COLORS[it.gil] || '#475467'};cursor:default` },
      h('span', { class: 'time' }, fmtTime(it.start), h('small', {}, fmtTime(it.end))),
      h('span', { class: 'what' }, h('b', {}, it.name), h('small', {}, [it.gil || it.kind, it.place].filter(Boolean).join(' · '))),
      h('span', { style: 'display:grid;gap:4px' },
        it.status === '참여' ? h('span', { class: 'badge' }, '✓ 참여') : h('button', { type: 'button', class: 'btn small', onclick: () => showMap(it.name, it.start, it.zone) }, '길 안내'),
        canCancel ? h('button', { type: 'button', class: 'btn small', onclick: e => cancel(it, e.target) }, '취소') : null)));
  }
}

function renderRecs() {
  const box = clear($('#recs'));
  const now = nowMin();
  if (now < 0) { box.append(h('div', { class: 'notice' }, '행사 날(11월 4일) 체험 시간에 이 화면을 열면 지금 갈 수 있는 체험을 추천해 드려요.')); return; }
  if (summary.emergency) { box.append(h('p', { class: 'muted' }, '비상 모드에서는 휴대폰 예약을 받지 않아요. 남은 자리는 아래에서 볼 수 있어요.')); }
  const groups = recommend({ seats: summary.seats, booths: config.booths, lectures: config.lectures, mine: mine.items, nowMin: now, from: currentZone(), sort });
  if (!groups.length) {
    box.append(h('div', { class: 'notice' }, '지금부터 1시간 안에 예약할 수 있는 체험이 없어요. 기다리는 동안 여기 어때요?'));
    for (const b of config.booths.filter(x => x.kind === '추천')) {
      box.append(h('div', { class: 'rec' }, h('span', {}, h('b', {}, b.name), h('small', {}, `${b.place} · 예약 없이 자유롭게`)),
        h('button', { type: 'button', class: 'btn small', onclick: () => showMap(b.name, now, b.zone) }, '길 안내')));
    }
    return;
  }
  for (const g of groups) {
    const sec = h('div', { class: `gil-group${g.covered ? ' done' : ''}`, style: `--gil:${GIL_COLORS[g.gil] || '#475467'}` },
      h('b', {}, g.gil, g.done ? ' (도장 받음)' : g.covered ? ' (예약함)' : ''));
    for (const it of g.items) {
      const s = it.seat;
      sec.append(h('div', { class: 'rec' },
        h('span', {}, h('b', {}, it.booth.name),
          h('small', {}, `${fmtTime(s.s)} 시작 · ${it.walk ? `${it.walk}분 거리` : '바로 여기'} · 남은 자리 ${s.a}/${s.c}`),
          h('small', {}, it.booth.place)),
        summary.emergency
          ? h('button', { type: 'button', class: 'btn small', onclick: () => showMap(it.booth.name, s.s, it.booth.zone) }, '길 안내')
          : h('button', { type: 'button', class: 'btn small primary', onclick: e => book(s, it, e.target) }, '예약')));
    }
    box.append(sec);
  }
}

function render() {
  $('#my-id').textContent = cred.id;
  $('#my-name').textContent = mine.who || '';
  $('#emergency').classList.toggle('hidden', !summary.emergency);
  renderStamps();
  renderMine();
  renderRecs();
}

async function refreshAll() {
  const [m, s] = await Promise.all([call('live.mine', cred), call('live.summary')]);
  mine = m;
  summary = s;
  render();
}

async function book(seat, it, button) {
  await busy(button, async () => {
    try {
      await call('live.book', { ...cred, sessionId: seat.id });
      toast(`예약했어요. ${fmtTime(seat.s)} ${it.booth.name}`);
    } catch (err) {
      toast(err.message, 'error');
    }
    await refreshAll();
    if (mine.items.some(i => String(i.target) === String(it.booth.no))) showMap(it.booth.name, seat.s, it.booth.zone);
  });
}

async function cancel(it, button) {
  await busy(button, async () => {
    await call('live.cancel', { ...cred, recordId: it.recordId });
    toast('예약을 취소했어요.');
    await refreshAll();
  });
}

function enter() {
  $('#login').classList.add('hidden');
  $('#view').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
}

async function main() {
  try {
    config = await getConfig();
    syncClock(config.now);
  } catch (err) {
    $('#login').prepend(h('div', { class: 'error-box' }, err.message));
    return;
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#form-new').addEventListener('submit', async e => {
    e.preventDefault();
    await busy($('#go-new'), async () => {
      const pin = $('#pin-new').value.trim();
      const r = await call('live.register', { name: $('#name').value.trim(), pin });
      cred = { id: r.id, pin };
      store.save('live.cred', cred);
      enter();
      await refreshAll();
      toast(`참가번호 ${r.id} — 적어 두세요.`);
    });
  });
  $('#form-old').addEventListener('submit', async e => {
    e.preventDefault();
    await busy($('#go-old'), async () => {
      cred = { id: $('#pid').value.trim().toUpperCase(), pin: $('#pin-old').value.trim() };
      await refreshAll();
      store.save('live.cred', cred);
      enter();
    });
  });
  $('#logout').addEventListener('click', () => { store.remove('live.cred'); location.reload(); });

  const sel = $('#here');
  sel.append(h('option', { value: '' }, '자동 (마지막 체험한 곳)'));
  ROOMS.filter(r => r.kind !== 'fixed').forEach(r => sel.append(h('option', { value: r.id }, `${r.floor === 2 ? '2층 ' : ''}${r.name}`)));
  sel.value = here || '';
  sel.addEventListener('change', () => { here = sel.value || null; store.save('live.here', here); renderRecs(); });
  const sorts = $('#sorts');
  for (const [key, s] of Object.entries(SORTS)) {
    sorts.append(h('button', { type: 'button', class: 'btn small', 'data-sort': key, 'aria-pressed': String(key === sort), onclick: () => {
      sort = key;
      store.save('live.sort', sort);
      sorts.querySelectorAll('[data-sort]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === sort)));
      renderRecs();
    } }, s.label));
  }

  if (cred) {
    enter();
    try { await refreshAll(); } catch (err) { toast(err.message, 'error'); }
  }
  // 화면이 보일 때만 30초마다 남은 자리 새로 받기
  setInterval(async () => {
    if (!cred || document.hidden) return;
    try { summary = await call('live.summary'); render(); } catch { /* 다음에 다시 */ }
  }, 30000);
  if (room('lobby') === null) console.warn('평면도 자료 없음');
}

main();
