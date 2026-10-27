/* 打卡 · 想坚持的小事，一天一格 */
(function () {
  'use strict';

  var KEY = 'habit';
  var App = window.App;
  var esc = App.esc, D = App.D;

  function load() { return App.Store.get(KEY, []); }
  function save(v) { App.Store.set(KEY, v); }

  /* 连续天数：从今天往回数，今天没打卡就从昨天开始数 */
  function streak(h) {
    var d = D.today();
    if (!h.log[d]) d = D.addDays(d, -1);
    var n = 0;
    while (h.log[d]) {
      n++;
      d = D.addDays(d, -1);
      if (n > 3650) break;
    }
    return n;
  }

  function todayDone() {
    var t = D.today();
    return load().filter(function (h) { return h.log[t]; }).length;
  }

  function total() { return load().length; }

  function openForm(onDone) {
    App.sheet({
      title: '添加一个习惯',
      body: '<input class="field" id="hbName" type="text" placeholder="比如：喝够 8 杯水 / 早睡 / 读书 20 分钟" maxlength="20">',
      okText: '添加',
      cancelText: '取消',
      onMount: function (body) {
        setTimeout(function () { App.$('#hbName', body).focus(); }, 260);
      },
      onOk: function (body) {
        var name = App.$('#hbName', body).value.trim();
        if (!name) { App.toast('给它起个名字'); return false; }
        var list = load();
        list.push({ id: App.uid(), name: name, log: {}, created: D.today() });
        save(list);
        if (onDone) onDone();
      }
    });
  }

  App.module({
    id: 'habit',
    name: '打卡',
    sub: '一天一格，攒连续天数',
    color: 'var(--c-habit)',
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20.8c-3.4 0-5.9-2.3-5.9-5.6 0-2.9 2.1-5.2 3.6-7.3.5-.7 1.6-.4 1.6.5 0 1.1.3 2 1 2.8.3-1.5 1-2.9 2-4 .5-.6 1.5-.3 1.5.5 0 3 2.1 4.9 2.1 7.5 0 3.3-2.5 5.6-5.9 5.6z"/></svg>',

    stat: function () {
      var t = total();
      if (!t) return '还没加习惯';
      return todayDone() + ' / ' + t + ' 今天完成';
    },

    todayDone: todayDone,
    total: total,

    render: function (root) {
      root.innerHTML =
        '<div class="pad">' +
        '<div id="hbBody" class="fill"></div>' +
        '<div class="dock"><button class="btn btn-primary" type="button" id="hbAdd">＋ 加个习惯</button></div>' +
        '</div>';

      var body = App.$('#hbBody', root);

      function paint() {
        var list = load();

        if (!list.length) {
          body.innerHTML =
            '<div class="blank">' +
            '<div class="blank-ic">🔥</div>' +
            '<p class="blank-t">还没有习惯</p>' +
            '<p class="blank-d">挑一件小事，比如每天喝够水，<br>坚持下来会很有成就感</p>' +
            '</div>';
          return;
        }

        var today = D.today();
        var html = '';

        list.forEach(function (h) {
          var done = !!h.log[today];
          var s = streak(h);

          var cells = '';
          for (var i = 27; i >= 0; i--) {
            var d = D.addDays(today, -i);
            cells += '<i class="hc' + (h.log[d] ? ' is-on' : '') + (d === today ? ' is-today' : '') + '"></i>';
          }

          html += '<div class="hcard" data-id="' + esc(h.id) + '">' +
            '<div class="hcard-top">' +
            '<div class="hcard-l">' +
            '<div class="hcard-n">' + esc(h.name) + '</div>' +
            '<div class="hcard-s">' + (s ? '连续 ' + s + ' 天' : '今天开始') + '</div>' +
            '</div>' +
            '<button class="hbtn' + (done ? ' is-done' : '') + '" type="button" data-check>' +
            (done ? '已打卡' : '打卡') +
            '</button>' +
            '</div>' +
            '<div class="hgrid">' + cells + '</div>' +
            '</div>';
        });

        body.innerHTML = html;
      }

      root.addEventListener('click', function (e) {
        if (e.target.closest('#hbAdd')) {
          openForm(function () { paint(); App.refresh(); });
          return;
        }

        var card = e.target.closest('.hcard[data-id]');
        if (!card) return;
        var id = card.getAttribute('data-id');
        var list = load();
        var h = list.filter(function (x) { return x.id === id; })[0];
        if (!h) return;

        if (e.target.closest('[data-check]')) {
          var t = D.today();
          if (h.log[t]) delete h.log[t];
          else h.log[t] = true;
          save(list);
          paint();
          App.refresh();
          return;
        }

        App.sheet({
          title: h.name,
          body: '<div class="detail">' +
            '<div class="detail-amt">' + streak(h) + '<small> 天连续</small></div>' +
            '<div class="detail-meta">累计打卡 ' + Object.keys(h.log).length + ' 天</div>' +
            '</div>',
          okText: '删除这个习惯',
          cancelText: '关闭',
          onOk: function () {
            save(load().filter(function (x) { return x.id !== id; }));
            paint();
            App.refresh();
          }
        });
      });

      paint();
    }
  });
})();
