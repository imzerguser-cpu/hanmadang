// 화면 안 알림: 진동·소리·배너, 허용하면 기기 알림창까지. 부스 운영자 화면에서 쓴다.
// 구글 무료 구성이라 푸시 서버가 없어서, 화면이 열려 있는 동안만 알린다(부스 기기는 하루 종일 켜 두므로 충분).
import * as store from './store.js';

let audio = null;

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch { /* 소리 없이 계속 */ }
}

function beep() {
  try {
    if (!audio) return;
    [0, 0.5].forEach(at => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.25;
      o.connect(g); g.connect(audio.destination);
      o.start(audio.currentTime + at); o.stop(audio.currentTime + at + 0.3);
    });
  } catch { /* 무시 */ }
}

async function systemNotify(a) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body: a.body, tag: a.key, renotify: true };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) { await reg.showNotification(a.title, opts); return; }
    new Notification(a.title, opts);
  } catch { /* 화면 배너로만 */ }
}

// ns: 저장 이름 (기기·부스마다 따로 켜고 끈다)
export function makeAlarm(ns) {
  const onKey = `${ns}.alarm.on`;
  const firedKey = `${ns}.alarm.fired`;
  return {
    on: () => store.load(onKey) === true,
    async enable() {
      unlockAudio();   // 소리는 사용자가 버튼을 누른 순간에만 켤 수 있다
      store.save(onKey, true);
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* 무시 */ }
      }
    },
    disable() { store.save(onKey, false); },
    // 울려야 할 알림을 한 번씩만 울린다
    fire(alerts, onAlert) {
      if (store.load(onKey) !== true) return;
      unlockAudio();
      const fired = new Set(store.load(firedKey, []));
      for (const a of alerts) {
        if (fired.has(a.key)) continue;
        fired.add(a.key);
        store.save(firedKey, [...fired]);
        const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;   // 한 번도 안 눌렀으면 진동이 막힌다
        if (navigator.vibrate && touched) navigator.vibrate([300, 150, 300]);
        beep();
        systemNotify(a);
        onAlert(a);
      }
    },
  };
}
