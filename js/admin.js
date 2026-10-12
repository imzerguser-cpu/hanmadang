import { call } from './api.js';
import { h, $, clear, toast, busy, GIL_COLORS } from './util.js';
import { GIL_ORDER } from './prefs-model.js';
import * as store from './store.js';

let key = store.load('admin.key');
let exp = null;     // 내보낸 자료 (신청·부스·회차)
let last = null;    // 마지막 배정 결과

const pct = x => `${(x * 100).toFixed(1)}%`;
const admin = (action, body = {}) => call(action, { key, ...body });

function tile(label, value, sub = '') {
  return h('div', { class: 'tile' }, h('span', {}, label), h('b', {}, value), sub ? h('span', {}, sub) : null);
}

async function loadStatus() {
  const [st, cfg] = await Promise.all([admin('admin.status'), call('config')]);
  const box = clear($('#tiles'));
  for (const p of ['오전', '오후']) {
    const a = st.applicants[p];
    box.append(tile(`${p === '오전' ? '초등(오전)' : '중·고(오후)'} 신청`, `${a.인원}명`, `개인 ${a.개인} · 모둠 ${a.모둠}`));
  }
  const rec = st.records;
  box.append(tile('특강 사전 예약', `${rec['특강사전·예약'] || 0}건`));
  box.append(tile('학부모·주민 등록', `${st.live}명`));
  box.append(tile('참여 확인', `${Object.entries(rec).filter(([k]) => k.endsWith('·참여')).reduce((n, [, v]) => n + v, 0)}건`));
  renderSwitches(cfg.settings);
}

function renderSwitches(s) {
  const box = clear($('#switches'));
  const items = [
    ['신청열림', '학생 선호 신청 받기'],
    ['공개_오전', '오전 배정 결과 공개'],
    ['공개_오후', '오후 배정 결과 공개'],
    ['비상모드', '비상 모드 (휴대폰 예약 막고 부스 기기로만 접수)'],
    ['우천모드', '우천 모드 (야외 부스를 우천 시 장소로)'],
  ];
  for (const [k, label] of items) {
    const on = s[k] === '예';
    box.append(h('div', { class: 'toggle' }, h('span', {}, label, h('small', { class: 'muted', style: 'display:block' }, on ? '켜짐' : '꺼짐')),
      h('button', { type: 'button', class: `btn small${on ? '' : ' primary'}`, onclick: e => busy(e.target, async () => {
        await admin('admin.setSettings', { values: { [k]: on ? '아니오' : '예' } });
        toast(`${label}: ${on ? '껐어요' : '켰어요'}`);
        await loadStatus();
      }) }, on ? '끄기' : '켜기')));
  }
}

async function loadExport() {
  exp = await admin('admin.export');
  renderHot();
}

// 부스별 5점 신청 인원 ÷ 배정 가능 자리
function renderHot() {
  const period = $('#hot-period').value;
  const apps = exp.applicants.filter(a => a.period === period);
  const want = {};
  for (const a of apps) for (const [no, r] of Object.entries(a.prefs)) if (r === 1) want[no] = (want[no] || 0) + a.size;
  const seats = {};
  for (const s of exp.sessions) if (s.period === period) seats[s.boothNo] = (seats[s.boothNo] || 0) + s.assignable;
  const rows = exp.booths.filter(b => b.kind === '배정' && b.periods.includes(period))
    .map(b => ({ b, w: want[b.no] || 0, s: seats[b.no] || 0 }))
    .map(x => ({ ...x, ratio: x.s ? x.w / x.s : 0 }))
    .sort((x, y) => y.ratio - x.ratio);
  const t = clear($('#hot'));
  t.append(h('tr', {}, h('th', {}, '부스'), h('th', {}, '길'), h('th', { class: 'num' }, '5점 신청'), h('th', { class: 'num' }, '배정 자리'), h('th', { class: 'num' }, '배율')));
  for (const x of rows) {
    t.append(h('tr', { class: x.ratio >= 2 ? 'hot' : x.ratio >= 1 ? 'warm' : '' },
      h('td', {}, `${x.b.no}. ${x.b.name}`), h('td', {}, x.b.gil), h('td', { class: 'num' }, x.w), h('td', { class: 'num' }, x.s), h('td', { class: 'num' }, x.ratio.toFixed(2))));
  }
}

function runWorker(input) {
  return new Promise((resolve, reject) => {
    const w = new Worker('js/assign-worker.js', { type: 'module' });
    w.onmessage = e => { w.terminate(); e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)); };
    w.onerror = e => { w.terminate(); reject(new Error(e.message || '계산 오류')); };
    w.postMessage(input);
  });
}

function renderResult(period, r) {
  const s = r.stats;
  const box = clear($('#result'));
  const labelOf = Object.fromEntries(exp.applicants.map(a => [a.id, a.label]));
  box.append(h('div', { class: 'tiles' },
    tile('선호도 5점 체험 받음', pct(s.rateFirst), `${s.withFirst} / ${s.applicants}건`),
    tile('다섯 길 완성', pct(s.rateComplete), `${s.complete5}건`),
    tile('학교별 5점 체험', `${s.schoolsWithFirst} / ${s.schools}교`),
    tile('선호도 1점 배정', `${s.rank5}건`),
    tile('계산 시간', `${(r.ms / 1000).toFixed(1)}초`, r.errors.length ? `조건 위반 ${r.errors.length}건!` : '조건 위반 0건')));
  const hist = Object.entries(s.firstsHist).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}개 ${v}건`).join(' · ');
  box.append(h('p', {}, h('b', {}, '5점 체험을 몇 개 받았나: '), hist));
  const t = h('table', { class: 'simple' }, h('tr', {}, h('th', {}, '길'), h('th', { class: 'num' }, '배정 자리'), h('th', { class: 'num' }, '신청 인원'), h('th', { class: 'num' }, '못 채운 신청')));
  for (const g of GIL_ORDER) {
    const sup = s.supplyByGil[g];
    if (!sup) continue;
    t.append(h('tr', { class: sup.seats < sup.needed ? 'warm' : '' }, h('td', { style: `border-left:6px solid ${GIL_COLORS[g]}` }, g),
      h('td', { class: 'num' }, sup.seats), h('td', { class: 'num' }, sup.needed), h('td', { class: 'num' }, s.missingByGil[g] || 0)));
  }
  box.append(h('div', { class: 'scroll' }, t));
  if (s.failed.length) {
    box.append(h('details', { style: 'margin:10px 0' }, h('summary', {}, `5점 체험을 못 받았거나 다섯 길을 다 못 채운 신청 ${s.failed.length}건`),
      h('p', { class: 'muted', style: 'font-size:14px' }, '대부분 그 길의 자리가 모자라서예요. 빈 시간에는 이벤트·전시가 추천으로 들어가요.'),
      h('ul', {}, s.failed.slice(0, 300).map(id => h('li', {}, labelOf[id] || id)))));
  }
  const save = h('button', { type: 'button', class: 'btn primary', disabled: r.errors.length > 0 }, `이 결과 저장 (${period})`);
  const pub = h('button', { type: 'button', class: 'btn', disabled: true }, '학생에게 공개');
  save.addEventListener('click', () => busy(save, async () => {
    const out = await admin('admin.saveAssignments', { period, assignments: r.assignments, recommendations: r.recommendations });
    toast(`저장했어요 (${out.saved}건). 확인한 뒤 공개를 누르세요.`);
    pub.disabled = false;
  }));
  pub.addEventListener('click', () => busy(pub, async () => {
    await admin('admin.publish', { period, on: true });
    toast(`${period} 배정 결과를 공개했어요.`);
    await loadStatus();
  }));
  box.append(h('div', { class: 'row', style: 'margin-top:10px' }, save, pub));
}

async function runAssign() {
  const period = $('#period').value;
  const secs = Math.max(5, Math.min(120, Number($('#secs').value) || 20));
  await busy($('#run'), async () => {
    await loadExport();
    const applicants = exp.applicants.filter(a => a.period === period);
    if (!applicants.length) { toast(`${period} 신청이 없어요.`, 'error'); return; }
    clear($('#result')).append(h('p', { class: 'muted' }, `${applicants.length}건을 계산하고 있어요… 약 ${secs}초 걸려요.`));
    last = await runWorker({
      booths: exp.booths, sessions: exp.sessions, applicants,
      settings: { timeLimitMs: secs * 1000, schoolSize: exp.schoolSize, seed: 1 },
    });
    renderResult(period, last);
  });
}

async function enter() {
  $('#login').classList.add('hidden');
  $('#main').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
  await loadStatus();
  await loadExport();
}

$('#login').addEventListener('submit', e => {
  e.preventDefault();
  busy($('#login-go'), async () => {
    key = $('#key').value.trim();
    await admin('admin.status');
    store.save('admin.key', key);
    await enter();
  });
});
$('#logout').addEventListener('click', () => { store.remove('admin.key'); location.reload(); });
$('#reload').addEventListener('click', e => busy(e.target, async () => { await loadStatus(); await loadExport(); }));
$('#hot-period').addEventListener('change', renderHot);
$('#run').addEventListener('click', runAssign);
// 표 → CSV 파일 (엑셀에서 한글이 깨지지 않게 BOM을 붙인다)
function downloadCsv(name, rows) {
  const head = rows.length ? Object.keys(rows[0]) : [];
  const cell = v => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [head.map(cell).join(','), ...rows.map(r => head.map(k => cell(r[k])).join(','))];
  const BOM = String.fromCharCode(0xfeff);
  const url = URL.createObjectURL(new Blob([BOM + lines.join(String.fromCharCode(13, 10))], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

$('#dump').addEventListener('click', e => busy(e.target, async () => {
  const d = await admin('admin.dump');
  const stamp = d.printedAt.slice(0, 16).replace(/[-: ]/g, '');
  downloadCsv(`한마당_신청자_${stamp}.csv`, d.신청자);
  downloadCsv(`한마당_기록_${stamp}.csv`, d.기록);
  if (d.강사서명 && d.강사서명.length) downloadCsv(`한마당_강사서명_${stamp}.csv`, d.강사서명);
  toast(`내려받았어요: 신청자 ${d.신청자.length}줄, 기록 ${d.기록.length}줄, 강사 서명 ${(d.강사서명 || []).length}건`);
}));
$('#purge').addEventListener('click', e => busy(e.target, async () => {
  const r = await admin('admin.purge', { confirm: $('#purge-confirm').value.trim() });
  $('#purge-confirm').value = '';
  toast(`지웠어요: 신청자 ${r.deleted.신청자}줄, 기록 ${r.deleted.기록}줄`);
  await loadStatus();
}));
$('#rebuild').addEventListener('click', e => busy(e.target, async () => {
  const r = await admin('admin.rebuildSessions');
  toast(`회차 ${r.count}개를 다시 만들었어요.`);
  await loadExport();
}));
if (key) enter().catch(err => { toast(err.message, 'error'); store.remove('admin.key'); });
