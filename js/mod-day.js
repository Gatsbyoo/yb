/* 纪念日 · 值得期待的日子，和已经走过的日子 */
(function () {
  'use strict';

  var KEY = 'day';
  var App = window.App;
  var esc = App.esc, D = App.D;

  function load() { return App.Store.get(KEY, []); }
  function save(v) { App.Store.set(KEY, v); }

  /* 算出某个日子离今天多少天：每年重复的取最近一次未来 */
  function info(item) {
    var today = D.today();
    if (item.yearly) {
      var t = D.parse(item.date);
      var y = +today.slice(0, 4);
      var next = y + '-' + D.pad(t.getMonth() + 1) + '-' + D.pad(t.getDate());
      if (D.diff(today, next) < 0) {
        next = (y + 1) + '-' + D.pad(t.getMonth() + 1) + '-' + D.pad(t.getDate());
      }
      return { future: true, days: D.diff(today, next), on: next };
    }
    var n = D.diff(today, item.date);
    return { future: n >= 0, days: Math.abs(n), on: item.date };
  }

  function all() {
    return load().map(function (it) {
      return { item: it, info: info(it) };
    });
  }

  /* 首页要用：最近的一个未来日子 */
  function next() {
    var list = all().filter(function (x) { return x.info.future; });
    if (!list.length) return null;
    list.sort(function (a, b) { return a.info.days - b.info.days; });
    return list[0];
  }

  /* 首页要用：天数最长的那条「已经过」的日子（通常就是在一起） */
  function longestPast() {
    var list = all().filter(function (x) { return !x.info.future; });
    if (!list.length) return null;
    list.sort(function (a, b) { return b.info.days - a.info.days; });
    return list[0];
  }

  function openForm(onDone) {
    App.sheet({
      title: '添加一个日子',
      body:
        '<input class="field" id="dyTitle" type="text" placeholder="比如：在一起 / 生日 / 结婚纪念日" maxlength="20">' +
        '<input class="field" id="dyDate" type="date" value="' + D.today() + '">' +
        '<label class="check"><input type="checkbox" id="dyYear"><span>每年都过（生日、纪念日选这个）</span></label>',
      okText: '保存',
      cancelText: '取消',
      onMount: function (body) {
        setTimeout(function () { App.$('#dyTitle', body).focus(); }, 260);
      },
      onOk: function (body) {
        var title = App.$('#dyTitle', body).value.trim();
        if (!title) { App.toast('给它起个名字'); return false; }
        var list = load();
        list.push({
          id: App.uid(),
          title: title,
          date: App.$('#dyDate', body).value || D.today(),
          yearly: App.$('#dyYear', body).checked
        });
        save(list);
        if (onDone) onDone();
      }
    });
  }

  App.module({
    id: 'day',
    name: '纪念日',
    sub: '还有几天，过了几天',
    color: 'var(--c-day)',
    icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 13.6c1.4-1.6 3.4.2 1.9 1.7L12 17l-1.9-1.7c-1.5-1.5.5-3.3 1.9-1.7z" fill="currentColor" stroke="none"/></svg>',

    stat: function () {
      var n = next();
      if (!n) return '还没添加日子';
      return n.item.title + ' ' + n.info.days + ' 天后';
    },

    next: next,
    longestPast: longestPast,

    render: function (root) {
      root.innerHTML =
        '<div class="pad">' +
        '<div id="dyBody" class="fill"></div>' +
        '<div class="dock"><button class="btn btn-primary" type="button" id="dyAdd">＋ 加一个日子</button></div>' +
        '</div>';

      var body = App.$('#dyBody', root);

      function paint() {
        var rows = all();
        var future = rows.filter(function (x) { return x.info.future; })
          .sort(function (a, b) { return a.info.days - b.info.days; });
        var past = rows.filter(function (x) { return !x.info.future; })
          .sort(function (a, b) { return b.info.days - a.info.days; });

        if (!rows.length) {
          body.innerHTML =
            '<div class="blank">' +
            '<div class="blank-ic">📅</div>' +
            '<p class="blank-t">还没有日子</p>' +
            '<p class="blank-d">生日、在一起的日子、下次旅行，<br>加进来就能看到还有几天</p>' +
            '</div>';
          return;
        }

        var html = '';

        if (future.length) {
          html += '<div class="hero-day">' +
            '<div class="hero-day-t">' + esc(future[0].item.title) + '</div>' +
            '<div class="hero-day-n">' + future[0].info.days + '</div>' +
            '<div class="hero-day-u">天后　·　' + D.md(future[0].info.on) + ' ' + D.wk(future[0].info.on) + '</div>' +
            '</div>';
        }

        if (future.length > 1) {
          html += '<ul class="rows rows-card">';
          future.slice(1).forEach(function (x) {
            html += rowHtml(x, true);
          });
          html += '</ul>';
        }

        if (past.length) {
          html += '<div class="sect"><span class="sect-t">已经走过</span></div>';
          html += '<ul class="rows rows-card">';
          past.forEach(function (x) { html += rowHtml(x, false); });
          html += '</ul>';
        }

        body.innerHTML = html;
      }

      function rowHtml(x, countdown) {
        return '<li class="row" data-id="' + esc(x.item.id) + '">' +
          '<span class="row-t">' + esc(x.item.title) +
          '<em class="row-note">' + D.md(x.item.date) + (x.item.yearly ? '　每年' : '') + '</em>' +
          '</span>' +
          '<span class="row-days">' + (countdown ? '<b>' + x.info.days + '</b> 天' : '<b>' + x.info.days + '</b> 天前') +
          '</span>' +
          '</li>';
      }

      root.addEventListener('click', function (e) {
        if (e.target.closest('#dyAdd')) {
          openForm(function () { paint(); App.refresh(); });
          return;
        }
        var li = e.target.closest('.row[data-id]');
        if (!li) return;
        var id = li.getAttribute('data-id');
        var item = load().filter(function (d) { return d.id === id; })[0];
        if (!item) return;
        var inf = info(item);

        App.sheet({
          title: item.title,
          body: '<div class="detail">' +
            '<div class="detail-amt">' + inf.days + '<small> 天</small></div>' +
            '<div class="detail-meta">' + (inf.future ? '距离 ' + D.md(inf.on) : '从 ' + D.md(item.date) + ' 起') +
            (item.yearly ? '　每年重复' : '') + '</div>' +
            '</div>',
          okText: '删除',
          cancelText: '关闭',
          onOk: function () {
            save(load().filter(function (d) { return d.id !== id; }));
            paint();
            App.refresh();
          }
        });
      });

      paint();
    }
  });
})();
