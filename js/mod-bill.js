/* 记账 · 3 秒记一笔，月底看看到底花哪了 */
(function () {
  'use strict';

  var KEY = 'bill';
  var App = window.App;
  var esc = App.esc, D = App.D;

  var OUT_CATS = [
    { k: '餐饮', e: '🍜' }, { k: '买菜', e: '🥬' }, { k: '日用', e: '🧴' },
    { k: '交通', e: '🚌' }, { k: '购物', e: '🛍️' }, { k: '娱乐', e: '🎬' },
    { k: '医教', e: '💊' }, { k: '人情', e: '🎁' }, { k: '其他', e: '✨' }
  ];
  var IN_CATS = [
    { k: '工资', e: '💰' }, { k: '红包', e: '🧧' }, { k: '其他', e: '✨' }
  ];

  function load() { return App.Store.get(KEY, []); }
  function save(v) { App.Store.set(KEY, v); }

  function money(n) {
    var s = (Math.round(n * 100) / 100).toFixed(2);
    s = s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function emojiOf(cat, type) {
    var list = type === 'in' ? IN_CATS : OUT_CATS;
    for (var i = 0; i < list.length; i++) if (list[i].k === cat) return list[i].e;
    return '✨';
  }

  function monthTotals(list, m) {
    var out = 0, inn = 0;
    list.forEach(function (b) {
      if (D.month(b.date) !== m) return;
      if (b.type === 'in') inn += b.amt; else out += b.amt;
    });
    return { out: out, in: inn };
  }

  /* ---------- 记一笔 ---------- */

  function openForm(onDone) {
    var today = D.today();
    var state = { type: 'out', cat: '餐饮', date: today };

    App.sheet({
      title: '记一笔',
      body:
        '<div class="seg" id="blSeg">' +
        '<button type="button" class="is-on" data-type="out">支出</button>' +
        '<button type="button" data-type="in">收入</button>' +
        '</div>' +
        '<div class="amount">' +
        '<span class="amount-sym">¥</span>' +
        '<input id="blAmt" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off">' +
        '</div>' +
        '<div class="chipwrap" id="blCats"></div>' +
        '<input class="field" id="blNote" type="text" placeholder="备注（可不填）" maxlength="30">' +
        '<input class="field" id="blDate" type="date" value="' + today + '">',
      okText: '存下',
      cancelText: '算了',
      onMount: function (body, close) {
        var cats = App.$('#blCats', body);
        var seg = App.$('#blSeg', body);

        function paintCats() {
          var list = state.type === 'in' ? IN_CATS : OUT_CATS;
          if (!list.some(function (c) { return c.k === state.cat; })) state.cat = list[0].k;
          cats.innerHTML = list.map(function (c) {
            return '<button type="button" class="chip' + (c.k === state.cat ? ' is-on' : '') +
              '" data-cat="' + c.k + '"><span>' + c.e + '</span>' + c.k + '</button>';
          }).join('');
        }

        paintCats();
        setTimeout(function () { App.$('#blAmt', body).focus(); }, 260);

        seg.addEventListener('click', function (e) {
          var b = e.target.closest('[data-type]');
          if (!b) return;
          state.type = b.getAttribute('data-type');
          App.$$('[data-type]', seg).forEach(function (x) {
            x.classList.toggle('is-on', x.getAttribute('data-type') === state.type);
          });
          paintCats();
        });

        cats.addEventListener('click', function (e) {
          var b = e.target.closest('[data-cat]');
          if (!b) return;
          state.cat = b.getAttribute('data-cat');
          paintCats();
        });

        App.$('#blDate', body).addEventListener('change', function (e) {
          state.date = e.target.value || today;
        });

        /* 回车直接存 */
        App.$('#blAmt', body).addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var ok = App.$('.sheet [data-ok]');
            if (ok) ok.click();
          }
        });
      },
      onOk: function (body) {
        var amt = parseFloat(String(App.$('#blAmt', body).value).replace(/[^\d.]/g, ''));
        if (!amt || amt <= 0) {
          App.toast('先填个金额');
          return false;
        }
        var list = load();
        list.push({
          id: App.uid(),
          type: state.type,
          amt: Math.round(amt * 100) / 100,
          cat: state.cat,
          note: App.$('#blNote', body).value.trim(),
          date: App.$('#blDate', body).value || D.today(),
          ts: Date.now()
        });
        save(list);
        if (onDone) onDone();
      }
    });
  }

  /* ---------- 模块 ---------- */

  App.module({
    id: 'bill',
    name: '记账',
    sub: '花哪儿了，心里有数',
    color: 'var(--c-bill)',
    icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18"/><circle cx="17" cy="15" r="1.3" fill="currentColor" stroke="none"/></svg>',

    stat: function () {
      var t = monthTotals(load(), D.month(D.today()));
      if (!t.out && !t.in) return '这个月还没记账';
      return '本月花了 ¥' + money(t.out);
    },

    /* 首页要用 */
    monthOut: function () {
      return monthTotals(load(), D.month(D.today())).out;
    },
    money: money,

    render: function (root) {
      var month = D.month(D.today());

      root.innerHTML =
        '<div class="pad">' +
        '<div class="mbar">' +
        '<button type="button" class="mbar-b" data-nav="-1" aria-label="上个月">' +
        '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
        '<span class="mbar-t" id="blMonth"></span>' +
        '<button type="button" class="mbar-b" data-nav="1" aria-label="下个月">' +
        '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' +
        '</div>' +
        '<div id="blBody" class="fill"></div>' +
        '<div class="dock"><button class="btn btn-primary" type="button" id="blAdd">＋ 记一笔</button></div>' +
        '</div>';

      var body = App.$('#blBody', root);
      var label = App.$('#blMonth', root);

      function paint() {
        var list = load();
        var t = monthTotals(list, month);
        var inMonth = list.filter(function (b) { return D.month(b.date) === month; });

        label.textContent = month.replace('-', ' 年 ') + ' 月';

        var html = '';

        html += '<div class="sum">' +
          '<div class="sum-l">这个月支出</div>' +
          '<div class="sum-n"><span class="sum-sym">¥</span>' + money(t.out) + '</div>' +
          (t.in ? '<div class="sum-sub">收入 ¥' + money(t.in) + '　结余 ¥' + money(t.in - t.out) + '</div>' : '') +
          '</div>';

        if (!inMonth.length) {
          html += '<div class="blank">' +
            '<div class="blank-ic">🧾</div>' +
            '<p class="blank-t">这个月还没有账</p>' +
            '<p class="blank-d">花完钱顺手记一笔，<br>月底就知道钱去哪了</p>' +
            '</div>';
          body.innerHTML = html;
          return;
        }

        /* 分类占比 */
        var byCat = {};
        inMonth.forEach(function (b) {
          if (b.type === 'in') return;
          byCat[b.cat] = (byCat[b.cat] || 0) + b.amt;
        });
        var cats = Object.keys(byCat).map(function (k) { return { k: k, v: byCat[k] }; })
          .sort(function (a, b) { return b.v - a.v; })
          .slice(0, 5);

        if (cats.length && t.out > 0) {
          html += '<div class="card bars">';
          cats.forEach(function (c) {
            var pct = Math.round(c.v / t.out * 100);
            html += '<div class="bar">' +
              '<div class="bar-top"><span>' + emojiOf(c.k, 'out') + ' ' + esc(c.k) + '</span>' +
              '<span class="bar-v">¥' + money(c.v) + '</span></div>' +
              '<div class="bar-track"><i style="width:' + Math.max(pct, 3) + '%"></i></div>' +
              '</div>';
          });
          html += '</div>';
        }

        /* 按日期分组 */
        var days = {};
        inMonth.forEach(function (b) {
          (days[b.date] = days[b.date] || []).push(b);
        });
        var dates = Object.keys(days).sort().reverse();

        dates.forEach(function (d) {
          var items = days[d].sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
          var dayOut = items.reduce(function (s, b) { return b.type === 'out' ? s + b.amt : s; }, 0);

          html += '<div class="sect">' +
            '<span class="sect-t">' + D.md(d) + '　' + D.wk(d) + '</span>' +
            '<span class="sect-v">' + (dayOut ? '−¥' + money(dayOut) : '') + '</span>' +
            '</div>';

          html += '<ul class="rows rows-card">';
          items.forEach(function (b) {
            html += '<li class="row" data-id="' + esc(b.id) + '">' +
              '<span class="row-emo">' + emojiOf(b.cat, b.type) + '</span>' +
              '<span class="row-t">' + esc(b.cat) +
              (b.note ? '<em class="row-note">' + esc(b.note) + '</em>' : '') +
              '</span>' +
              '<span class="row-amt' + (b.type === 'in' ? ' is-in' : '') + '">' +
              (b.type === 'in' ? '+' : '−') + money(b.amt) +
              '</span>' +
              '</li>';
          });
          html += '</ul>';
        });

        body.innerHTML = html;
      }

      root.addEventListener('click', function (e) {
        var nav = e.target.closest('[data-nav]');
        if (nav) {
          var p = month.split('-');
          var d = new Date(+p[0], (+p[1]) - 1 + (+nav.getAttribute('data-nav')), 1);
          month = d.getFullYear() + '-' + D.pad(d.getMonth() + 1);
          paint();
          return;
        }

        if (e.target.closest('#blAdd')) {
          openForm(function () { paint(); App.refresh(); });
          return;
        }

        var li = e.target.closest('.row[data-id]');
        if (li) {
          var id = li.getAttribute('data-id');
          var item = load().filter(function (b) { return b.id === id; })[0];
          if (!item) return;

          App.sheet({
            title: item.cat + (item.note ? ' · ' + item.note : ''),
            body: '<div class="detail">' +
              '<div class="detail-amt' + (item.type === 'in' ? ' is-in' : '') + '">' +
              (item.type === 'in' ? '+' : '−') + '¥' + money(item.amt) + '</div>' +
              '<div class="detail-meta">' + D.md(item.date) + '　' + D.wk(item.date) + '</div>' +
              '</div>',
            okText: '删除这笔',
            cancelText: '关闭',
            onOk: function () {
              save(load().filter(function (b) { return b.id !== id; }));
              paint();
              App.refresh();
            }
          });
        }
      });

      paint();
    }
  });
})();
