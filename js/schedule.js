import { call, getConfig } from './api.js';
import { h, $, clear, toast, busy, GIL_COLORS, fmtTime } from './util.js';
import { attachCodeHint } from './student-code.js';
import { syncClock, eventNowMin } from './clock.js';
import { directions, mapSvg, room } from './floorplan.js';
import { GIL_ORDER } from './prefs-model.js';
import * as store from './store.js';

let config;
let cred = store.load('schedule.cred');
let data = store.load('schedule.data');
let lastFetch = 0;

function zoneOf(item) {
  return item.zone || null;
}

function stampsView(stamps) {
  const box = clear($('#stamps'));
  for (const g of GIL_ORDER) {
    const done = stamps.includes(g);
    box.append(h('div', { class: `stamp${done ? ' done' : ''}`, style: `--gil:${GIL_COLORS[g]}`, title: g },
      h('span', { class: 'dot' }, done ? '✓' : ''), h('small', {}, g)));
  }
  if (stamps.length === 5) box.append(h('div', { class: 'done-box', style: 'grid-column:1/-1;margin-top:8px;text-align:center' }, h('b', {}, '🎉 오길 잘했어! 다섯 길 완주'), h('div', { class: 'muted' }, '이 화면을 운영진에게 보여 주세요.')));
}

function showMap(item, prev) {
  const from = prev ? zoneOf(prev) : 'lobby';
  const to = zoneOf(item);
  $('#map-title').textContent = `${fmtTime(item.start)} ${item.name}`;
  $('#map-dir').textContent = `${room(to) ? room(to).name : item.place} · ${directions(from, to)}`;
  $('#map').innerHTML = mapSvg({ from, to });
  $('#map-box').classList.remove('hidden');
  $('#map-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function nowCard(items, nowMin) {
  const box = clear($('#now-card'));
  const main = items.filter(i => i.kind !== '추천');
  if (nowMin < 0) {
    box.append(h('b', {}, '행사 날(11월 4일)에 이 화면을 열면 지금 갈 곳을 알려 줘요.'));
    return;
  }
  const current = main.find(i => i.start <= nowMin && nowMin < i.end);
  const next = main.find(i => i.start > nowMin);
  if (current) {
    box.append(h('div', { class: 'muted' }, '지금 체험 중'), h('b', { style: 'font-size:19px' }, current.name), h('div', {}, `${fmtTime(current.start)}~${fmtTime(current.end)} · ${current.place}`));
  }
  if (next) {
    const prev = [...main].reverse().find(i => i.end <= next.start) || null;
    const left = next.start - nowMin;
    box.append(h('div', { class: 'muted', style: current ? 'margin-top:10px' : '' }, `다음 · ${left}분 뒤 시작`),
      h('b', { style: 'font-size:19px' }, next.name),
      h('div', {}, `${fmtTime(next.start)} · ${next.place}`),
      h('div', { class: 'muted', style: 'font-size:14px' }, directions(prev ? zoneOf(prev) : 'lobby', zoneOf(next))),
      h('button', { type: 'button', class: 'btn small', style: 'margin-top:8px', onclick: () => showMap(next, prev) }, '지도로 보기'));
  } else if (!current) {
    box.append(h('b', {}, '오늘 체험을 모두 마쳤어요. 고생했어요!'));
  }
}

function render() {
  const nowMin = eventNowMin(config.settings['행사일']);
  $('#who').textContent = data.who;
  stampsView(data.stamps);
  nowCard(data.items, nowMin);
  const box = clear($('#timeline'));
  let prev = null;
  for (const it of data.items) {
    const past = nowMin >= it.end;
    const color = it.kind === '특강' ? '#475467' : (GIL_COLORS[it.gil] || '#98a2b3');
    const badge = it.status === '참여' ? '✓ 참여' : it.kind === '추천' ? '자유 관람' : it.kind === '특강' ? '특강' : '';
    const p = prev;
    box.append(h('button', {
      type: 'button', class: `slot${past ? ' past' : ''}${it.kind === '추천' ? ' free' : ''}`, style: `--gil:${color}`,
      onclick: () => showMap(it, p),
    },
      h('span', { class: 'time' }, fmtTime(it.start), h('small', {}, fmtTime(it.end))),
      h('span', { class: 'what' },
        h('b', {}, it.kind === '추천' ? `빈 시간 · ${it.name} 어때요?` : it.name),
        h('small', {}, [it.gil, it.place].filter(Boolean).join(' · '))),
      badge ? h('span', { class: 'badge' }, badge) : null));
    if (it.kind !== '추천') prev = it;
  }
  $('#login').classList.add('hidden');
  $('#view').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
}

async function fetchSchedule() {
  const r = cred.groupCode ? await call('schedule.get', { groupCode: cred.groupCode }) : await call('schedule.get', cred);
  data = r;
  lastFetch = Date.now();
  store.save('schedule.data', data);
}

async function login(newCred, button) {
  await busy(button, async () => {
    cred = newCred;
    await fetchSchedule();
    store.save('schedule.cred', cred);
    render();
  });
}

function setMode(mode) {
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('#form-person').classList.toggle('hidden', mode !== 'person');
  $('#form-group').classList.toggle('hidden', mode !== 'group');
}

async function main() {
  try {
    config = await getConfig();
    syncClock(config.now);
  } catch (err) {
    if (!data) { $('#login').prepend(h('div', { class: 'error-box' }, err.message)); return; }
    config = store.load('schedule.config');   // 인터넷이 없어도 저장해 둔 일정은 보여 준다
  }
  if (config) store.save('schedule.config', config);
  const fromLink = new URLSearchParams(location.search).get('code');
  if (fromLink) $('#code').value = fromLink.toUpperCase();
  attachCodeHint($('#code'), $('#code-who'));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#form-person').addEventListener('submit', e => {
    e.preventDefault();
    login({ code: $('#code').value.trim().toUpperCase(), name: $('#name').value.trim(), pin: $('#pin').value.trim() }, $('#go-person'));
  });
  $('#form-group').addEventListener('submit', e => {
    e.preventDefault();
    login({ groupCode: $('#gcode').value.trim().toUpperCase() }, $('#go-group'));
  });
  $('#refresh').addEventListener('click', async e => {
    if (Date.now() - lastFetch < 60000) { toast('1분에 한 번 새로 고칠 수 있어요.'); return; }
    await busy(e.target, async () => { await fetchSchedule(); render(); toast('도장을 새로 받았어요.'); });
  });
  $('#logout').addEventListener('click', () => {
    store.remove('schedule.cred'); store.remove('schedule.data');
    location.reload();
  });
  if (cred && data) {
    render();
    fetchSchedule().then(render).catch(() => {});   // 저장된 일정을 먼저 보여 주고 뒤에서 새로 받기
  }
  setInterval(() => { if (data && !document.hidden) nowCard(data.items, eventNowMin(config.settings['행사일'])); }, 30000);
}

main();
