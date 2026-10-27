/* 经期 · 记一次开始日，自动算周期和下次时间
   数据只存在这台手机本地，不上传任何地方。
   结果是按历史推断的，只作参考，不作医学建议。 */
(function () {
  'use strict';

  var KEY = 'cycle';
  var App = window.App;
  var esc = App.esc, D = App.D;

  function load() { return App.Store.get(KEY, []); }
  function save(v) { App.Store.set(KEY, v); }

  function stats() {
    var list = load().map(function (x) { return x.start; }).sort();
    if (!list.length) return null;

    var gaps = [];
    for (var i = 1; i < list.length; i++) {
      var d = D.diff(list[i - 1], list[i]);
      if (d >= 15 && d <= 60) gaps.push(d);   // 明显异常的值不参与平均
    }
    var recent = gaps.slice(-6);
    var avg = recent.length
      ? Math.round(recent.reduce(function (a, b) { return a + b; }, 0) / recent.length)
      : 28;

    var last = list[list.length - 1];
    var today = D.today();
    var dayN = D.diff(last, today) + 1;
    var next = D.addDays(last, avg);
    var toNext = D.diff(today, next);

    return {
      starts: list, avg: avg, last: last, dayN: dayN,
      next: next, toNext: toNext, count: list.length
    };
  }

  function openForm(onDone) {
    App.sheet({
      title: '记一次开始日',
      body:
        '<input class="field" id="cyDate" type="date" value="' + D.today() + '">' +
        '<p class="hint">点开日历改成实际那天的日期。</p>',
      okText: '记下',
      cancelText: '取消',
      onOk: function (body) {
        var d = App.$('#cyDate', body).value;
        if (!d) { App.toast('选个日期'); return false; }
        var list = load();
        if (list.some(function (x) { return x.start === d; })) {
          App.toast('这天已经记过了');
          return false;
        }
        list.push({ id: App.uid(), start: d });
        save(list);
        if (onDone) onDone();
      }
    });
  }

  App.module({
    id: 'cycle',
    name: '经期',
    sub: '算周期，心里有底',
    color: 'var(--c-cycle)',
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.8c3.2 4.4 5 7.4 5 10a5 5 0 0 1-10 0c0-2.6 1.8-5.6 5-10z"/><path d="M12 17.4a3.4 3.4 0 0 1-3.4-3.4" stroke-linecap="round"/></svg>',

    stat: function () {
      var s = stats();
      if (!s) return '还没记录';
      if (s.toNext >= 0) return '下次还有 ' + s.toNext + ' 天';
      return '已推迟 ' + Math.abs(s.toNext) + ' 天';
    },

    stats: stats,

    render: function (root) {
      root.innerHTML =
        '<div class="pad">' +
        '<div id="cyBody" class="fill"></div>' +
        '<div class="dock"><button class="btn btn-primary" type="button" id="cyAdd">＋ 记一次</button></div>' +
        '</div>';

      var body = App.$('#cyBody', root);

      function paint() {
        var s = stats();

        if (!s) {
          body.innerHTML =
            '<div class="blank">' +
            '<div class="blank-ic">🌸</div>' +
            '<p class="blank-t">还没有记录</p>' +
            '<p class="blank-d">每次开始那天点一下「记一次」，<br>记够两次就能算出你的周期</p>' +
            '</div>';
          return;
        }

        var pct = Math.min(100, Math.max(4, Math.round(s.dayN / s.avg * 100)));
        var late = s.toNext < 0;

        var html = '';

        html += '<div class="cycard">' +
          '<div class="cy-l">' + (late ? '已经推迟' : '距离下次') + '</div>' +
          '<div class="cy-n">' + Math.abs(s.toNext) + '<small> 天</small></div>' +
          '<div class="cy-sub">预计 ' + D.md(s.next) + '　' + D.wk(s.next) + '</div>' +
          '<div class="cy-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="cy-foot">今天是周期第 <b>' + s.dayN + '</b> 天</div>' +
          '</div>';

        html += '<div class="twocol">' +
          '<div class="mini"><div class="mini-n">' + s.avg + '<small> 天</small></div><div class="mini-l">平均周期</div></div>' +
          '<div class="mini"><div class="mini-n">' + s.count + '<small> 次</small></div><div class="mini-l">已记录</div></div>' +
          '</div>';

        if (s.count < 2) {
          html += '<p class="hint">再记一次开始日，就能算出自己的平均周期了。</p>';
        }

        html += '<div class="sect"><span class="sect-t">最近记录</span></div>';
        html += '<ul class="rows rows-card">';
        s.starts.slice().reverse().slice(0, 6).forEach(function (d, i, arr) {
          var prev = s.starts.slice().reverse()[i + 1];
          var gap = prev ? D.diff(prev, d) : 0;
          html += '<li class="row" data-date="' + esc(d) + '">' +
            '<span class="row-t">' + D.md(d) +
            '<em class="row-note">' + d.slice(0, 4) + ' 年　' + D.wk(d) + '</em></span>' +
            '<span class="row-days">' + (gap ? gap + ' 天间隔' : '首次') + '</span>' +
            '</li>';
        });
        html += '</ul>';

        html += '<p class="hint hint-foot">数据只存在这台手机上。预测按你的历史推算，仅供参考，不作医学建议。</p>';

        body.innerHTML = html;
      }

      root.addEventListener('click', function (e) {
        if (e.target.closest('#cyAdd')) {
          openForm(function () { paint(); App.refresh(); });
          return;
        }
        var li = e.target.closest('.row[data-date]');
        if (!li) return;
        var d = li.getAttribute('data-date');
        App.confirm('删除 ' + D.md(d) + ' 这次记录？', '删除').then(function (ok) {
          if (!ok) return;
          save(load().filter(function (x) { return x.start !== d; }));
          paint();
          App.refresh();
        });
      });

      paint();
    }
  });
})();
