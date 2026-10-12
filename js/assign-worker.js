// 자동 배정 계산을 화면과 따로 돌린다 (20초 동안 화면이 멈추지 않게)
import { assign, validate } from '../engine/index.js';

self.onmessage = e => {
  const t0 = performance.now();
  try {
    const r = assign(e.data);
    const errors = validate({ ...e.data, assignments: r.assignments });
    self.postMessage({ ok: true, ...r, errors, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
