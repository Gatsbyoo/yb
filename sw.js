/* 离线缓存：stale-while-revalidate
   - 有缓存就立刻用 → 打开即开，不用等网络
   - 后台同时拉新版本写回缓存 → 下次打开就是最新的
   不能用 cache-first：那样改了代码用户永远收不到更新（做菜那版踩过这个坑） */

var CACHE = 'xiaorizi-v1';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/core.js',
  './js/mod-todo.js',
  './js/mod-bill.js',
  './js/mod-day.js',
  './js/mod-diary.js',
  './js/mod-habit.js',
  './js/mod-cycle.js',
  './js/mod-wheel.js',
  './js/shell.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* 做菜那个应用有自己的 service worker，这里不插手 */
  if (url.pathname.indexOf('/cook/') !== -1) return;

  /* 页面导航：先网络，失败给离线壳 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (r) {
            return r || caches.match('./');
          });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req)
        .then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return cached; });

      return cached || network;
    })
  );
});
