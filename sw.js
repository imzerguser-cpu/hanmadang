// 화면 파일을 기기에 저장해 인터넷이 없어도 운영자 화면 등이 다시 열리게 한다.
// 서버(Apps Script) 요청은 저장하지 않는다. 화면 파일을 고치면 VERSION 을 올린다.
const VERSION = 'hanmadang-1791816121088';
const SHELL = [
  './', 'index.html', 'booth.html', 'schedule.html', 'live.html', 'apply.html', 'class.html', 'lecture.html',
  'css/app.css',
  'js/api.js', 'js/settings.js', 'js/util.js', 'js/store.js', 'js/clock.js', 'js/floorplan.js', 'js/recommend.js',
  'js/prefs-model.js', 'js/prefs-ui.js', 'js/student-code.js', 'js/alarm.js', 'js/alarm-rules.js', 'js/signpad.js', 'js/booth.js', 'js/schedule.js', 'js/live.js', 'js/apply.js', 'js/class.js', 'js/lecture.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// 같은 출처의 GET 화면 파일: 인터넷이 되면 새로 받아 저장, 안 되면 저장본
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/api')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

// 부스 운영자 알림을 누르면 운영자 화면으로
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.includes('booth.html'));
    return open ? open.focus() : self.clients.openWindow('booth.html');
  }));
});
