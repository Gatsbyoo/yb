/* 外壳 · 路由、首页、工具宫格、我 */
(function () {
  'use strict';

  var App = window.App;
  var $ = App.$, esc = App.esc, D = App.D;

  var SVG = {
    back: '<svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7"/></svg>',
    go: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5z"/><path d="M9.5 20.5v-6h5v6"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20.2c.6-3.8 3.6-6 7.2-6s6.6 2.2 7.2 6"/></svg>'
  };

  function profile() { return App.Store.get('profile', { name: '' }); }
  function saveProfile(p) { App.Store.set('profile', p); }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    if (h < 23) return '晚上好';
    return '夜深了';
  }

  /* ================= 路由 ================= */

  var shellRoute = '#/';
  var current = { name: '' };

  function parse() {
    var h = (location.hash || '#/').replace(/^#\/?/, '');
    var p = h.split('/').filter(Boolean);
    if (p[0] === 't' && p[1]) return { name: 'tool', id: p[1] };
    if (p[0] === 'tools') return { name: 'tools' };
    if (p[0] === 'me') return { name: 'me' };
    return { name: 'home' };
  }

  function render(keepScroll) {
    var r = parse();
    var view = $('#view');
    var nav = $('#nav');
    var y = window.scrollY;

    /* 换页时先收掉所有弹层，避免返回键之后弹层还压在上面 */
    App.closeSheets();

    if (r.name !== 'tool') {
      shellRoute = r.name === 'home' ? '#/' : '#/' + r.name;
    }

    current = r;

    if (r.name === 'tool') {
      var m = App.get(r.id);
      if (!m) { location.hash = '#/tools'; return; }
      nav.hidden = true;
      view.className = 'view view-tool';
      view.innerHTML =
        '<header class="thd">' +
        '<button class="thd-b" type="button" data-back aria-label="返回">' + SVG.back + '</button>' +
        '<div class="thd-tit">' +
        '<span class="thd-t">' + esc(m.name) + '</span>' +
        '<span class="thd-s">' + esc(m.sub || '') + '</span>' +
        '</div>' +
        '</header>' +
        '<div class="toolbody" id="toolBody"></div>';
      m.render($('#toolBody', view));
    } else {
      nav.hidden = false;
      view.className = 'view';
      /* #view 是常驻元素，事件用赋值不用 addEventListener，
         否则每次重绘都会多挂一个监听（点一下勾选会被触发多次） */
      view.onclick = null;
      if (r.name === 'home') view.innerHTML = homeHtml();
      else if (r.name === 'tools') view.innerHTML = toolsHtml();
      else view.innerHTML = meHtml();
      if (r.name === 'home') bindHome(view);
      if (r.name === 'me') bindMe(view);
    }

    App.$$('.nv').forEach(function (a) {
      var t = a.getAttribute('href');
      a.classList.toggle('is-on', t === shellRoute);
    });

    window.scrollTo(0, keepScroll ? y : 0);
  }

  /* ================= 首页 ================= */

  function homeHtml() {
    var p = profile();
    var todo = App.get('todo');
    var day = App.get('day');
    var habit = App.get('habit');
    var bill = App.get('bill');
    var cycle = App.get('cycle');
    var diary = App.get('diary');

    var today = D.today();
    var open = todo.list().filter(function (t) { return !t.done; });

    var h = '';
    h += '<header class="hello">' +
      '<div class="hello-l">' +
      '<p class="hello-hi">' + greeting() + (p.name ? '，' + esc(p.name) : '') + '</p>' +
      '<p class="hello-date">' + D.md(today) + '　星期' + D.weekday(today) + '</p>' +
      '</div>' +
      '<span class="avatar">' + (p.name ? esc(p.name.slice(0, 1)) : '你') + '</span>' +
      '</header>';

    /* 待办 */
    h += '<section class="card">' +
      '<div class="card-hd"><span class="card-t">今天要做</span>' +
      '<a class="card-more" href="#/t/todo">全部</a></div>' +
      '<ul class="rows rows-flat" id="hmTodos">' +
      (open.length
        ? open.slice(0, 3).map(function (t) {
          return '<li class="row" data-tid="' + esc(t.id) + '">' +
            '<button class="row-ck" type="button" data-ck aria-label="勾选">' +
            '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 6.8"/></svg></button>' +
            '<span class="row-t">' + esc(t.text) + '</span></li>';
        }).join('')
        : '<li class="hm-none">今天没有待办，' +
        '<button type="button" class="linky" data-focus-quick>记一件？</button></li>') +
      '</ul>' +
      '<form class="quick" id="hmQuick" autocomplete="off">' +
      '<input id="hmQuickIn" type="text" placeholder="加一件要做的事" maxlength="80" enterkeyhint="done">' +
      '<button type="submit" aria-label="添加">＋</button>' +
      '</form>' +
      '</section>';

    /* 日子 */
    var past = day.longestPast();
    var next = day.next();

    if (past || next) {
      h += '<section class="card love">' +
        '<div class="love-row">' +
        (past ? '<button class="love-cell" type="button" data-go="#/t/day">' +
          '<span class="love-l">' + esc(past.item.title) + '</span>' +
          '<span class="love-n">' + past.info.days + '</span>' +
          '<span class="love-u">天</span></button>' : '') +
        (past && next ? '<span class="love-div"></span>' : '') +
        (next ? '<button class="love-cell" type="button" data-go="#/t/day">' +
          '<span class="love-l">距离' + esc(next.item.title) + '</span>' +
          '<span class="love-n">' + next.info.days + '</span>' +
          '<span class="love-u">天后</span></button>' : '') +
        '</div>' +
        '</section>';
    } else {
      h += '<button class="invite" type="button" data-go="#/t/day">' +
        '<span>📅</span> 加一个值得期待的日子，比如生日' + SVG.go + '</button>';
    }

    /* 三小格 */
    var cy = cycle.stats();
    var cyTxt = cy ? (cy.toNext >= 0 ? cy.toNext + ' 天' : '推迟 ' + Math.abs(cy.toNext) + ' 天') : '—';
    var hbTotal = habit.total();
    var out = bill.monthOut();

    h += '<div class="trio">' +
      '<button class="tile-sm" type="button" data-go="#/t/habit">' +
      '<span class="ts-l">打卡</span>' +
      '<span class="ts-n">' + (hbTotal ? habit.todayDone() + '/' + hbTotal : '—') + '</span>' +
      '<span class="ts-s">今天完成</span></button>' +
      '<button class="tile-sm" type="button" data-go="#/t/bill">' +
      '<span class="ts-l">本月花销</span>' +
      '<span class="ts-n">' + (out ? '¥' + bill.money(out) : '¥0') + '</span>' +
      '<span class="ts-s">' + D.month(D.today()).replace('-', '/') + '</span></button>' +
      '<button class="tile-sm" type="button" data-go="#/t/cycle">' +
      '<span class="ts-l">经期</span>' +
      '<span class="ts-n ts-sm">' + cyTxt + '</span>' +
      '<span class="ts-s">' + (cy ? '周期第 ' + cy.dayN + ' 天' : '未记录') + '</span></button>' +
      '</div>';

    /* 日记 */
    var de = diary.todayEntry();
    h += '<button class="dbar" type="button" data-go="#/t/diary">' +
      '<span class="dbar-ic">' + (de ? (de.mood ? ['', '😞', '😐', '🙂', '😊', '🤩'][de.mood] : '📖') : '✍️') + '</span>' +
      '<span class="dbar-t">' + (de ? '今天写过了' : '今天还没写日记') +
      '<em>' + (de ? (de.text || '').slice(0, 18) || '（只有照片）' : '随手记一句，以后翻起来很有意思') + '</em>' +
      '</span>' +
      SVG.go + '</button>';

    h += '<p class="foot">数据都在这台手机上，不会传出去<br>换手机前记得在「我」里备份一下</p>';

    return h;
  }

  function bindHome(view) {
    var todo = App.get('todo');

    view.onclick = function (e) {
      var ck = e.target.closest('[data-ck]');
      if (ck) {
        var li = ck.closest('.row[data-tid]');
        todo.toggle(li.getAttribute('data-tid'));
        render(true);
        return;
      }
      var fq = e.target.closest('[data-focus-quick]');
      if (fq) {
        var inp = $('#hmQuickIn');
        if (inp) inp.focus();
      }
    };

    var form = $('#hmQuick');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var inp = $('#hmQuickIn');
        var v = inp.value.trim();
        if (!v) return;
        todo.add(v);
        render(true);
      });
    }
  }

  /* ================= 工具 ================= */

  function toolsHtml() {
    var h = '<header class="hello"><div class="hello-l">' +
      '<p class="hello-hi">全部工具</p>' +
      '<p class="hello-date">都在这儿了，想到就会用到</p>' +
      '</div></header>';

    h += '<div class="grid">';
    App.modules().forEach(function (m) {
      h += '<button class="tt" type="button" data-go="#/t/' + esc(m.id) + '" style="--tc:' + m.color + '">' +
        '<span class="tt-ic">' + m.icon + '</span>' +
        '<span class="tt-n">' + esc(m.name) + '</span>' +
        '<span class="tt-s">' + esc(App.stat(m.id)) + '</span>' +
        '</button>';
    });

    h += '<a class="tt" href="./cook/" style="--tc:var(--c-cook)">' +
      '<span class="tt-ic"><svg viewBox="0 0 24 24" fill="none">' +
      '<path d="M4 11h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8z"/>' +
      '<path d="M8.5 7.5c0-1 1-1.2 1-2.2M12 7.5c0-1 1-1.2 1-2.2"/></svg></span>' +
      '<span class="tt-n">做菜</span>' +
      '<span class="tt-s">吃什么 + 买菜清单</span>' +
      '</a>';

    h += '</div>';

    h += '<p class="foot">都是本地小工具，没有账号，没有广告</p>';
    return h;
  }

  /* ================= 我 ================= */

  function meHtml() {
    var p = profile();

    var used = 0;
    App.Store.keys().forEach(function (k) {
      used += (localStorage.getItem(k) || '').length;
    });
    var kb = Math.max(1, Math.round(used / 1024));

    var h = '<header class="hello"><div class="hello-l">' +
      '<p class="hello-hi">我</p>' +
      '<p class="hello-date">设置和数据都在这儿</p>' +
      '</div></header>';

    h += '<div class="card">' +
      '<label class="fl">怎么称呼你</label>' +
      '<input class="field" id="meName" type="text" maxlength="8" placeholder="写个名字，首页会问你早安" value="' + esc(p.name || '') + '">' +
      '</div>';

    h += '<div class="card">' +
      '<div class="card-hd"><span class="card-t">数据</span>' +
      '<span class="card-more card-plain">已用 ' + kb + ' KB</span></div>' +
      '<button class="lrow" type="button" id="meExport">' +
      '<span class="lrow-t">备份到文件<em>导出一个 json，换手机时用得上</em></span>' + SVG.go + '</button>' +
      '<button class="lrow" type="button" id="meImport">' +
      '<span class="lrow-t">从备份恢复<em>会覆盖当前所有记录</em></span>' + SVG.go + '</button>' +
      '<button class="lrow lrow-danger" type="button" id="meClear">' +
      '<span class="lrow-t">清空所有数据<em>删掉就找不回来了，先备份</em></span>' + SVG.go + '</button>' +
      '<input type="file" id="meFile" accept="application/json,.json" hidden>' +
      '</div>';

    h += '<div class="card">' +
      '<div class="card-hd"><span class="card-t">关于</span></div>' +
      '<a class="lrow" href="./cook/">' +
      '<span class="lrow-t">做菜<em>吃什么 + 自动生成买菜清单</em></span>' + SVG.go + '</a>' +
      '<p class="about">小日子 v1 · 纯本地的小工具集合<br>' +
      '所有内容只存在这台手机的浏览器里，不上传任何服务器。<br>' +
      '清理浏览器数据或换手机前，记得先备份。</p>' +
      '</div>';

    return h;
  }

  function bindMe(view) {
    var nameEl = $('#meName', view);
    if (nameEl) {
      nameEl.addEventListener('input', function () {
        var p = profile();
        p.name = nameEl.value.trim().slice(0, 8);
        saveProfile(p);
      });
    }

    var ex = $('#meExport', view);
    if (ex) {
      ex.addEventListener('click', function () {
        var data = App.Store.exportAll();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '小日子备份-' + D.today() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        App.toast('备份文件已下载');
      });
    }

    var im = $('#meImport', view);
    var file = $('#meFile', view);
    if (im && file) {
      im.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var obj;
          try {
            obj = JSON.parse(reader.result);
          } catch (err) {
            App.toast('这个文件读不出来');
            return;
          }
          App.confirm('恢复备份会覆盖现在的记录，确定吗？', '恢复').then(function (ok) {
            if (!ok) return;
            try {
              App.Store.importAll(obj);
              App.toast('恢复完成');
              setTimeout(function () { location.reload(); }, 700);
            } catch (err) {
              App.toast(err.message || '恢复失败');
            }
          });
        };
        reader.readAsText(f);
      });
    }

    var cl = $('#meClear', view);
    if (cl) {
      cl.addEventListener('click', function () {
        App.confirm('真的清空所有记录？删了就找不回来了。', '清空').then(function (ok) {
          if (!ok) return;
          App.confirm('最后确认一次：全部删除？', '全部删除').then(function (ok2) {
            if (!ok2) return;
            App.Store.clearAll();
            App.toast('已清空');
            setTimeout(function () { location.reload(); }, 600);
          });
        });
      });
    }
  }

  /* ================= 启动 ================= */

  function boot() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-back]');
      if (b) {
        e.preventDefault();
        location.hash = shellRoute;
        return;
      }
      var g = e.target.closest('[data-go]');
      if (g) {
        e.preventDefault();
        location.hash = g.getAttribute('data-go');
      }
    });

    window.addEventListener('hashchange', function () { render(); });
    render();

    /* 模块内部改完数据后喊一声，外壳按需重绘（工具页自己会重绘，不打断输入）
       保持滚动位置，否则勾一条待办页面就跳回顶部 */
    App.onRefresh = function () {
      if (current.name !== 'tool') render(true);
    };
    App.reload = function () { render(); };

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
