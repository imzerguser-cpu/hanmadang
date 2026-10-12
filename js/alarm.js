// 체험 시간 알림: 진동·소리·화면 배너, 허용하면 휴대폰 알림창까지.
// 구글 무료 구성이라 푸시 서버가 없다. 그래서 이 화면이 열려 있을 때(다른 앱으로 잠깐 넘어간 경우 포함)만 알린다.
// 앱을 완전히 닫거나 휴대폰이 오래 잠기면 알림이 늦거나 오지 않을 수 있다.
import * as store from './store.js';
import { dueAlerts } from './alarm-rules.js';

let audio = null;

export const alarmOn = () => store.load('alarm.on') === true;

export async function enableAlarm() {
  unlockAudio();   // 소리는 사용자가 버튼을 누른 순간에만 켤 수 있다
  store.save('alarm.on', true);
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

export function disableAlarm() {
  store.save('alarm.on', false);
}

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
  const opts = { body: a.body, tag: a.key, renotify: true, data: { url: 'schedule.html' } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) { await reg.showNotification(a.title, opts); return; }
    new Notification(a.title, opts);
  } catch { /* 화면 배너로만 */ }
}

// 지금 울려야 할 알림을 한 번씩만 울리고, 화면 배너용으로 돌려준다
export function checkAlarms(items, nowMin, onAlert) {
  if (!alarmOn() || nowMin < 0) return;
  const fired = new Set(store.load('alarm.fired', []));
  for (const a of dueAlerts(items, nowMin)) {
    if (fired.has(a.key)) continue;
    fired.add(a.key);
    store.save('alarm.fired', [...fired]);
    const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;   // 화면을 한 번도 안 눌렀으면 진동이 막힌다
    if (navigator.vibrate && touched) navigator.vibrate([300, 150, 300]);
    beep();
    systemNotify(a);
    onAlert(a);
  }
}
