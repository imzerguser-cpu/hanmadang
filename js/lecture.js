import { call, getConfig } from './api.js';
import { h, $, clear, toast, busy, GRADE_OPTIONS, fmtTime, fmtDeadline, deadlineMs } from './util.js';

let config;
let lectures = [];

const type = () => document.querySelector('input[name="type"]:checked').value;

function field(label, input, hint) {
  return h('label', { class: 'field' }, label, hint ? h('span', { class: 'hint' }, hint) : null, input);
}

function gradeSelect() {
  const s = h('select', { id: 'w-grade' }, h('option', { value: '' }, '학년'));
  GRADE_OPTIONS.forEach(([v, l]) => s.append(h('option', { value: v }, l)));
  return s;
}


// 고른 예약 주체에 맞는 입력 칸
function renderWho() {
  const box = clear($('#who'));
  const t = type();
  if (t === '개인') {
    box.append(field('학생 안내코드', h('input', { id: 'w-code', maxlength: '6', autocapitalize: 'characters' }), '학교 안내장의 6자리'),
      field('학년', gradeSelect()),
      field('별명', h('input', { id: 'w-name', maxlength: '20' }), '실명 말고 별명'));
  } else if (t === '학급') {
    box.append(field('학교 코드', h('input', { id: 'w-code', maxlength: '6', autocapitalize: 'characters' }), '교육지원청에서 안내한 6자리'),
      h('div', { class: 'row' }, field('학년', gradeSelect()), field('반', h('input', { id: 'w-cls', inputmode: 'numeric', maxlength: '3' }))),
      field('인원', h('input', { id: 'w-size', type: 'number', min: '1', max: '40' })));
  } else {
    box.append(field('이름 또는 별명', h('input', { id: 'w-name', maxlength: '20' })),
      field('참가번호 (있으면)', h('input', { id: 'w-id', maxlength: '5', placeholder: '예: L0012', autocapitalize: 'characters' }), '처음이면 비워 두세요. 예약하면 참가번호를 드려요.'));
  }
}

function readWho() {
  const t = type();
  const v = id => ($(`#${id}`) ? $(`#${id}`).value.trim() : '');
  if (t === '개인') return { type: t, code: v('w-code').toUpperCase(), grade: v('w-grade'), name: v('w-name') };
  if (t === '학급') return { type: t, code: v('w-code').toUpperCase(), grade: v('w-grade'), cls: v('w-cls'), size: Number(v('w-size')) };
  const who = { type: t, name: v('w-name') };
  if (v('w-id')) who.id = v('w-id').toUpperCase();
  return who;
}

async function loadList() {
  lectures = await call('lecture.list');
  const box = clear($('#list'));
  const sel = clear($('#lecture'));
  for (const l of lectures) {
    const who = l.period === '오전' ? '초등·학부모·주민' : '중·고·학부모·주민';
    box.append(h('div', { class: 'card' },
      h('div', { class: 'name', style: 'font-weight:700' }, l.name),
      h('div', {}, l.speaker),
      h('div', { class: 'muted' }, `11월 4일 ${fmtTime(l.start)}~${fmtTime(l.end)} · ${l.place} · ${who}`),
      h('div', { style: 'margin-top:6px' }, h('b', {}, `사전 예약 남은 자리 ${l.preLeft}`), ` / ${l.preCapacity}`),
    ));
    sel.append(h('option', { value: l.id, disabled: l.preLeft <= 0 }, `${fmtTime(l.start)} ${l.name} (${l.speaker})${l.preLeft <= 0 ? ' — 마감' : ''}`));
  }
}

async function onBook(e) {
  e.preventDefault();
  const pin = $('#pin').value.trim();
  if (!/^\d{4}$/.test(pin)) { toast('비밀번호는 숫자 4자리예요.', 'error'); return; }
  await busy($('#book-go'), async () => {
    const r = await call('lecture.book', { lectureId: $('#lecture').value, pin, who: readWho() });
    const l = lectures.find(x => x.id === $('#lecture').value);
    const box = $('#booked');
    clear(box).append(h('div', {}, h('b', {}, '예약했어요. '), `${fmtTime(l.start)} ${l.name} · ${l.place}`));
    if (r.participantId) {
      box.append(h('div', { style: 'margin-top:8px' }, '참가번호 ', h('span', { class: 'code' }, r.participantId),
        ' — 당일 체험 현장 예약에도 이 번호와 비밀번호를 써요. 꼭 적어 두세요.'));
      const idInput = $('#w-id');
      if (idInput) idInput.value = r.participantId;
    }
    box.classList.remove('hidden');
    await loadList();
  });
}

async function onMine(e) {
  e.preventDefault();
  const pin = $('#pin').value.trim();
  await busy($('#mine-go'), async () => {
    const who = readWho();
    const r = await call('lecture.mine', { pin, who });
    const box = clear($('#mine-list'));
    if (!r.items.length) { box.append(h('p', { class: 'muted' }, '예약한 특강이 없어요.')); return; }
    for (const it of r.items) {
      box.append(h('div', { class: 'card', style: 'background:#fafbfc' },
        h('b', {}, `${fmtTime(it.start)} ${it.name}`), h('div', { class: 'muted' }, `${it.speaker} · ${it.place} · ${it.size}명`),
        h('button', { type: 'button', class: 'btn small', style: 'margin-top:8px', onclick: async ev => {
          await busy(ev.target, async () => {
            await call('lecture.cancel', { recordId: it.recordId, pin, who });
            toast('취소했어요.');
            ev.target.closest('.card').remove();
            await loadList();
          });
        } }, '예약 취소')));
    }
  });
}

async function main() {
  try {
    config = await getConfig();
    await loadList();
  } catch (err) {
    $('#list').append(h('div', { class: 'error-box' }, err.message));
    return;
  }
  const st = config.settings;
  const open = config.now >= deadlineMs(st['특강예약_시작']) && config.now < deadlineMs(st['특강예약_마감']);
  $('#period').append(h('div', {}, `사전 예약 기간: ${fmtDeadline(st['특강예약_시작'])} ~ ${fmtDeadline(st['특강예약_마감'])}`),
    open ? null : h('div', { style: 'margin-top:6px' }, h('b', {}, '지금은 사전 예약 기간이 아니에요.'), ' 당일 현장 접수를 이용해 주세요.'));
  if (!open) $('#book-go').disabled = true;
  renderWho();
  document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', renderWho));
  $('#book').addEventListener('submit', onBook);
  $('#mine').addEventListener('submit', onMine);
}

main();
