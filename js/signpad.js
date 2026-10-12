// 강사 서명 받기: 이름 + 손가락 서명. 출석부(강사 등록부)에 그대로 찍히는 작은 PNG로 돌려준다.
import { h, toast } from './util.js';
import * as store from './store.js';

const OUT_W = 300;
const OUT_H = 110;

export function askSignature({ title, role, boothNo }) {
  return new Promise(resolve => {
    const nameKey = `booth.${boothNo}.signer.${role}`;   // 같은 기기에서는 강사 이름을 기억해 둔다
    const name = h('input', { maxlength: '20', value: store.load(nameKey, ''), placeholder: '강사 이름', autocomplete: 'off' });
    const canvas = h('canvas', { class: 'signpad', 'aria-label': '여기에 서명' });
    let strokes = 0;
    let drawing = false;
    const ctx = canvas.getContext('2d');
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      strokes = 0;
    };
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', e => { drawing = true; canvas.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; ctx.lineTo(...pos(e)); ctx.stroke(); strokes++; });
    const stop = () => { drawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    const close = v => { box.remove(); document.body.style.overflow = ''; resolve(v); };
    const save = () => {
      const n = name.value.trim();
      if (!n) { toast('강사 이름을 넣어 주세요.', 'error'); return; }
      if (strokes < 5) { toast('서명 칸에 서명해 주세요.', 'error'); return; }
      const out = document.createElement('canvas');
      out.width = OUT_W; out.height = OUT_H;
      out.getContext('2d').drawImage(canvas, 0, 0, OUT_W, OUT_H);
      store.save(nameKey, n);
      close({ name: n, img: out.toDataURL('image/png') });
    };
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-card' },
        h('b', { style: 'font-size:18px' }, title),
        h('p', { class: 'muted', style: 'font-size:14px;margin:4px 0 8px' }, '강사비 지급 증빙으로 출석부(강사 등록부)에 인쇄돼요.'),
        h('label', { class: 'field' }, `${role} 이름`, name),
        h('div', { class: 'row', style: 'align-items:center' }, h('b', { style: 'flex:3' }, '서명'),
          h('button', { type: 'button', class: 'btn small', style: 'flex:none', onclick: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); strokes = 0; } }, '지우기')),
        canvas,
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, '취소'),
          h('button', { type: 'button', class: 'btn primary', onclick: save }, '서명 저장'))));
    document.body.append(box);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(fit);
  });
}
