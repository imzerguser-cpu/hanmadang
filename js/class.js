import { call, getConfig } from './api.js';
import { h, $, clear, toast, busy, GRADE_OPTIONS, deadlineMs } from './util.js';
import { gilsFor, periodOfGrade, allDone, cleanPrefs } from './prefs-model.js';
import { mountPrefs, progressBar } from './prefs-ui.js';

let config;
let code = '';
let school = '';
let grade = '';
let cls = '';
let gils = [];
let picker;
// 모둠: { name, roster: [], size, prefs: null(학급 공통 따름) 또는 {…} }
let groups = [];
let common = {};
let target = 'common';

function show(id) {
  for (const s of ['step-login', 'step-class', 'step-groups', 'step-done']) $(`#${s}`).classList.toggle('hidden', s !== id);
  $('#bar').classList.toggle('hidden', id !== 'step-groups');
  window.scrollTo({ top: 0 });
}

function splitNames(text) {
  return String(text || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}

// ---- 모둠 편집 ----
function renderGroups() {
  const box = clear($('#groups'));
  groups.forEach((g, i) => {
    const sizeInput = h('input', { type: 'number', min: '1', max: '40', value: String(g.size || ''), oninput: e => { g.size = Number(e.target.value); } });
    box.append(h('div', { class: 'card', style: 'margin:10px 0;background:#fafbfc' },
      h('div', { class: 'row', style: 'align-items:end' },
        h('label', { class: 'field', style: 'flex:2' }, '모둠 이름',
          h('input', { value: g.name, maxlength: '20', oninput: e => { g.name = e.target.value.trim(); renderTargets(); } })),
        h('label', { class: 'field' }, '인원', sizeInput),
      ),
      h('label', { class: 'field' }, '명단', h('span', { class: 'hint' }, '실명은 적지 마세요. 별명·번호로 쓰거나 비워 두고 인원만 넣어도 돼요. 출석부 실명 칸은 현장에서 손으로 써요.'),
        h('textarea', { style: 'min-height:70px', oninput: e => {
          g.roster = splitNames(e.target.value);
          if (g.roster.length) { g.size = g.roster.length; sizeInput.value = String(g.size); }
        } }, g.roster.join('\n'))),
      h('div', { class: 'row' },
        h('span', { class: 'muted', style: 'align-self:center;font-size:14px' }, g.prefs ? '선호: 이 모둠만 따로' : '선호: 학급 공통'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { groups.splice(i, 1); renderGroups(); renderTargets(); } }, '모둠 삭제'),
      ),
    ));
  });
}

function addGroup(roster = []) {
  groups.push({ name: `${groups.length + 1}모둠`, roster, size: roster.length || 0, prefs: null });
}

function splitRoster() {
  const names = splitNames($('#roster-all').value);
  const n = Math.max(1, Math.min(12, Number($('#split-n').value) || 1));
  if (!names.length) { toast('명단을 먼저 붙여 넣어 주세요.', 'error'); return; }
  const keep = groups.map(g => g.prefs);
  groups = [];
  for (let i = 0; i < n; i++) addGroup([]);
  names.forEach((name, i) => groups[i % n].roster.push(name));
  groups.forEach((g, i) => { g.size = g.roster.length; g.prefs = keep[i] || null; });
  renderGroups();
  renderTargets();
  toast(`${names.length}명을 ${n}개 모둠으로 나눴어요.`);
}

// ---- 선호 ----
function prefsOfTarget() {
  if (target === 'common') return common;
  const g = groups[Number(target)];
  return g.prefs || common;
}

function saveTarget(prefs) {
  if (target === 'common') common = prefs;
  else groups[Number(target)].prefs = prefs;
}

function renderTargets() {
  const sel = clear($('#target'));
  sel.append(h('option', { value: 'common' }, '학급 공통 (모든 모둠)'));
  groups.forEach((g, i) => sel.append(h('option', { value: String(i) }, `${g.name || `${i + 1}모둠`}${g.prefs ? ' — 따로 고름' : ' — 따로 고르기'}`)));
  if (target !== 'common' && !groups[Number(target)]) target = 'common';
  sel.value = target;
}

function mountPicker() {
  if (target !== 'common' && !groups[Number(target)].prefs) groups[Number(target)].prefs = { ...common };
  picker = mountPrefs($('#prefs'), { gils, prefs: prefsOfTarget(), quick: $('#quick').checked, onChange: p => { saveTarget(p); updateBar(); } });
  renderGroups();
  updateBar();
}

function everyDone() {
  if (!groups.length) return false;
  return groups.every(g => allDone(g.prefs || common, gils));
}

function updateBar() {
  const old = $('#bar-progress');
  const bar = progressBar(gils, picker.status());
  bar.id = 'bar-progress';
  old.replaceWith(bar);
  $('#save').disabled = !everyDone();
  $('#next').classList.toggle('hidden', allDone(picker.getPrefs(), gils));
}

// ---- 단계 ----
async function onLogin(e) {
  e.preventDefault();
  await busy($('#login-go'), async () => {
    code = $('#code').value.trim().toUpperCase();
    school = (await call('class.login', { code })).school;
    $('#school-name').textContent = school;
    show('step-class');
  });
}

async function onClass(e) {
  e.preventDefault();
  grade = $('#grade').value;
  cls = $('#cls').value.trim();
  if (!grade || !cls) { toast('학년과 반을 넣어 주세요.', 'error'); return; }
  const period = periodOfGrade(grade);
  if (config.settings['신청열림'] !== '예' || config.now >= deadlineMs(config.settings[`마감_${period}`])) {
    toast('신청이 마감되었어요.', 'error');
    return;
  }
  await busy($('#class-go'), async () => {
    const got = await call('class.get', { code, grade, cls });
    gils = gilsFor(config, grade);
    groups = got.groups.map(g => ({ name: g.name, roster: g.roster, size: g.size, prefs: cleanPrefs(g.prefs, gils) }));
    // 모든 모둠 선호가 같으면 학급 공통으로 본다
    const first = groups[0] && JSON.stringify(groups[0].prefs);
    if (groups.length && groups.every(g => JSON.stringify(g.prefs) === first)) {
      common = groups[0].prefs;
      groups.forEach(g => { g.prefs = null; });
    } else {
      common = {};
    }
    if (!groups.length) { addGroup(); addGroup(); addGroup(); }
    $('#class-title').textContent = `${school} ${grade} ${cls}반`;
    target = 'common';
    renderTargets();
    show('step-groups');
    mountPicker();
    if (got.groups.length) toast('저장된 모둠을 불러왔어요.');
  });
}

async function onSave() {
  for (const g of groups) {
    if (!g.name) { toast('모둠 이름을 넣어 주세요.', 'error'); return; }
    if (!(g.size >= 1)) { toast(`${g.name}: 인원을 넣어 주세요.`, 'error'); return; }
  }
  await busy($('#save'), async () => {
    const r = await call('class.save', {
      code, grade, cls,
      groups: groups.map(g => ({ name: g.name, roster: g.roster, size: g.size, prefs: g.prefs || common })),
    });
    $('#done-msg').textContent = `${school} ${grade} ${cls}반, 모둠 ${r.groups.length}개를 저장했어요. 마감 전까지 같은 학교 코드로 다시 고칠 수 있어요.`;
    const t = clear($('#codes'));
    t.append(h('tr', {}, h('th', { class: 'nowrap' }, '모둠'), h('th', { class: 'nowrap' }, '인원'), h('th', { class: 'nowrap' }, '모둠 코드'), h('th', {}, '명단')));
    r.groups.forEach(g => t.append(h('tr', {}, h('td', { class: 'nowrap' }, g.name), h('td', { class: 'nowrap' }, `${g.size}명`), h('td', { class: 'code nowrap' }, g.code), h('td', {}, g.roster.join(', ')))));
    show('step-done');
  });
}

async function main() {
  try {
    config = await getConfig();
  } catch (err) {
    $('#step-login').prepend(h('div', { class: 'error-box' }, err.message));
    return;
  }
  const gradeSel = $('#grade');
  gradeSel.append(h('option', { value: '' }, '학년'));
  GRADE_OPTIONS.forEach(([v, label]) => gradeSel.append(h('option', { value: v }, label)));
  $('#login').addEventListener('submit', onLogin);
  $('#pick-class').addEventListener('submit', onClass);
  $('#add-group').addEventListener('click', () => { addGroup(); renderGroups(); renderTargets(); });
  $('#split-go').addEventListener('click', splitRoster);
  $('#target').addEventListener('change', e => { target = e.target.value; mountPicker(); window.scrollTo({ top: $('#prefs').offsetTop - 80 }); });
  $('#quick').addEventListener('change', e => picker && picker.setQuick(e.target.checked));
  $('#next').addEventListener('click', () => picker.next());
  $('#save').addEventListener('click', onSave);
  $('#print').addEventListener('click', () => window.print());
  $('#edit-again').addEventListener('click', () => { show('step-groups'); mountPicker(); });
}

main();
