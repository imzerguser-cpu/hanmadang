// 5길 선호 고르기 화면 조각 (학생·교사 공통)
import { h, clear, GIL_COLORS, toast } from './util.js';
import { RANKS, setRank, gilStatus } from './prefs-model.js';

export function mountPrefs(container, { gils, prefs = {}, quick = false, onChange = () => {} }) {
  let state = { ...prefs };
  let current = 0;
  let quickMode = quick;

  function statusAll() {
    return gils.map(g => gilStatus(state, g));
  }

  function change(next) {
    state = next;
    render();
    onChange(state, statusAll());
  }

  function choose(boothNo, rank) {
    const r = setRank(state, gils, boothNo, rank);
    if (r.error) { toast(r.error, 'error'); return; }
    change(r.prefs);
  }

  function boothCard(g, b, st) {
    const mine = state[b.no];
    const card = h('div', { class: `booth${mine ? ` r${mine}` : ''}`, 'data-booth': b.no },
      h('div', { class: 'name' }, `${b.no}. ${b.name}`),
      h('div', { class: 'meta' }, b.place, mine ? ` · ${RANKS[mine - 1].score}점 ${RANKS[mine - 1].label}` : ''),
    );
    if (quickMode) {
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', String(mine === 1));
      card.addEventListener('click', () => choose(b.no, 1));
      return card;
    }
    const row = h('div', { class: 'ranks' });
    for (const r of RANKS) {
      const full = st.counts[r.rank] >= (r.rank === 1 ? g.need : g.max) && mine !== r.rank;
      row.append(h('button', {
        type: 'button', class: 'rank-btn', 'aria-pressed': String(mine === r.rank), disabled: full,
        title: `${r.score}점 ${r.label}`, onclick: () => choose(b.no, r.rank),
      }, h('b', {}, `${r.score}점`), r.short));
    }
    card.append(row);
    return card;
  }

  function render() {
    clear(container);
    container.classList.toggle('quick', quickMode);
    const all = statusAll();
    const tabs = h('div', { class: 'gil-tabs', role: 'tablist' });
    gils.forEach((g, i) => {
      tabs.append(h('button', {
        type: 'button', role: 'tab', class: 'gil-tab', style: `--gil:${GIL_COLORS[g.gil]}`,
        'aria-selected': String(i === current), onclick: () => { current = i; render(); window.scrollTo({ top: 0 }); },
      }, g.gil, h('span', { class: 'mark' }, all[i].done ? '✓' : `${all[i].counts[1]}/${g.need}`)));
    });
    container.append(tabs);

    const g = gils[current];
    const st = all[current];
    const tip = quickMode
      ? `꼭 하고 싶은 체험을 ${g.need}개 눌러 주세요. (선호도 5점)`
      : `가장 하고 싶은 체험에 5점을 꼭 ${g.need}개 주세요. 4점~1점은 각각 ${g.max}개까지 줄 수 있어요. 점수를 안 준 부스는 '보통'으로 봐요.`;
    container.append(h('div', { class: 'gil-head', style: `--gil:${GIL_COLORS[g.gil]}` },
      h('b', {}, g.gil), ' ',
      h('span', { class: 'muted' }, st.firstLeft > 0 ? `5점(꼭 하고 싶어요)을 ${st.firstLeft}개 더 주세요` : '5점을 다 줬어요 ✓'),
      h('div', { class: 'muted', style: 'font-size:14px' }, tip),
    ));
    for (const b of g.booths) container.append(boothCard(g, b, st));
  }

  render();
  return {
    getPrefs: () => ({ ...state }),
    setPrefs: p => change({ ...p }),
    setQuick: q => { quickMode = q; render(); },
    // 아직 못 채운 다음 길로. 다 채웠으면 false
    next() {
      const all = statusAll();
      for (let step = 1; step <= gils.length; step++) {
        const i = (current + step) % gils.length;
        if (!all[i].done) { current = i; render(); window.scrollTo({ top: 0 }); return true; }
      }
      return false;
    },
    status: statusAll,
    current: () => current,
  };
}

// 아래 고정 막대의 길 진행 칸
export function progressBar(gils, status) {
  return h('div', { class: 'progress', 'aria-label': '길별 진행' },
    gils.map((g, i) => h('span', { class: status[i].done ? 'done' : '', title: g.gil })));
}
