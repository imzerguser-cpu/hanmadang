import { call, getConfig } from './api.js';
import { h, $, clear, toast, busy, fmtDeadline, deadlineMs } from './util.js';
import { lookupCode, attachCodeHint } from './student-code.js';
import { gilsFor, periodOfGrade, allDone, cleanPrefs } from './prefs-model.js';
import { mountPrefs, progressBar } from './prefs-ui.js';

let config;
let who;
let picker;
let gils;

function show(id) {
  for (const s of ['step-info', 'step-prefs', 'step-done']) $(`#${s}`).classList.toggle('hidden', s !== id);
  $('#bar').classList.toggle('hidden', id !== 'step-prefs');
  window.scrollTo({ top: 0 });
}

function fillForm() {
  const fromLink = new URLSearchParams(location.search).get('code');   // 학교 안내장 QR에 코드가 들어 있다
  if (fromLink) $('#code').value = fromLink.toUpperCase();
  attachCodeHint($('#code'), $('#code-who'));
  const st = config.settings;
  $('#deadlines').append(
    h('div', {}, `초등(오전 체험) 신청 마감: `, h('b', {}, fmtDeadline(st['마감_오전']))),
    h('div', {}, `중·고(오후 체험) 신청 마감: `, h('b', {}, fmtDeadline(st['마감_오후']))),
  );
}

function updateBar() {
  const status = picker.status();
  clear($('#bar-progress')).replaceWith(progressBar(gils, status));
  $('.bottom-bar .progress').id = 'bar-progress';
  const done = allDone(picker.getPrefs(), gils);
  $('#submit').disabled = !done;
  $('#next').classList.toggle('hidden', done);
}

async function onInfo(e) {
  e.preventDefault();
  const info = {
    code: $('#code').value.trim().toUpperCase(),
    name: $('#name').value.trim(), pin: $('#pin').value.trim(),
  };
  if (!info.code || !info.name) { toast('안내코드와 별명을 넣어 주세요.', 'error'); return; }
  if (!/^\d{4}$/.test(info.pin)) { toast('비밀번호는 숫자 4자리예요.', 'error'); return; }
  await busy($('#go'), async () => {
    info.grade = (await lookupCode(info.code)).grade;   // 학년은 안내코드로 정해진다
    const period = periodOfGrade(info.grade);
    const st = config.settings;
    if (st['신청열림'] !== '예' || config.now >= deadlineMs(st[`마감_${period}`])) {
      toast(`${period === '오전' ? '초등' : '중·고'} 신청이 마감되었어요. 당일 현장 접수를 이용해 주세요.`, 'error');
      return;
    }
    let saved = {};
    try {
      saved = (await call('apply.get', info)).prefs;
      toast('신청한 내용을 불러왔어요.');
    } catch (err) {
      if (!/신청 내역이 없습니다/.test(err.message)) throw err;
    }
    who = info;
    gils = gilsFor(config, info.grade);
    $('#who').textContent = `${info.name}의 5길 체험 고르기`;
    picker = mountPrefs($('#prefs'), { gils, prefs: cleanPrefs(saved, gils), quick: false, onChange: updateBar });
    updateBar();
    show('step-prefs');
  });
}

async function onSubmit() {
  await busy($('#submit'), async () => {
    const prefs = picker.getPrefs();
    const r = await call('apply.save', { ...who, prefs });
    $('#done-msg').textContent = `${r.school} ${who.grade} '${who.name}'의 신청이 저장되었어요. 별명과 비밀번호를 꼭 기억해 두세요.`;
    $('#done-warn').textContent = r.warning || '';
    $('#done-warn').classList.toggle('hidden', !r.warning);
    const list = clear($('#done-list'));
    for (const g of gils) {
      const names = g.booths.filter(b => prefs[b.no] === 1).map(b => b.name);
      list.append(h('div', { style: 'margin:6px 0' }, h('b', {}, g.gil), ' · ', names.join(', ')));
    }
    show('step-done');
  });
}

async function main() {
  try {
    config = await getConfig();
  } catch (err) {
    $('#step-info').prepend(h('div', { class: 'error-box' }, err.message));
    return;
  }
  fillForm();
  $('#info').addEventListener('submit', onInfo);
  $('#quick').addEventListener('change', e => picker && picker.setQuick(e.target.checked));
  $('#next').addEventListener('click', () => picker.next());
  $('#submit').addEventListener('click', onSubmit);
}

main();
