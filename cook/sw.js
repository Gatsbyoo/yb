/* 离线缓存策略：stale-while-revalidate
   - 有缓存就立刻返回 → 超市里没信号也是秒开
   - 同时后台拉新版本写回缓存 → 下次打开就是最新的
   关键：不能用 cache-first，否则改了代码用户永远收不到更新 */
var CACHE = 'chisha-v2';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/app.js',
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
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(e.request).then(function (hit) {
        var fresh = fetch(e.request).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(e.request, res.clone()).catch(function () {});
          }
          return res;
        }).catch(function () {
          // 网络彻底失败：导航请求退回首页
          if (e.request.mode === 'navigate') return cache.match('./index.html');
          return hit;
        });

        return hit || fresh;
      });
    })
  );
});
