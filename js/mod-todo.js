/* 待办 · 想到就记一笔 */
(function () {
  'use strict';

  var KEY = 'todo';
  var App = window.App;
  var esc = App.esc, D = App.D;

  function load() { return App.Store.get(KEY, []); }
  function save(v) { App.Store.set(KEY, v); }

  function leftCount() {
    return load().filter(function (t) { return !t.done; }).length;
  }

  App.module({
    id: 'todo',
    name: '待办',
    sub: '想到就记一笔',
    color: 'var(--c-todo)',
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h10M4 12h7M4 17h9"/><path d="M15.5 16.5l2.2 2.2 4.3-4.6"/></svg>',

    stat: function () {
      var n = leftCount();
      return n ? n + ' 件事没做' : '都做完了';
    },

    /* 首页要用 */
    list: load,
    left: leftCount,
    add: function (text) {
      var all = load();
      all.unshift({ id: App.uid(), text: text, done: false, created: D.today() });
      save(all);
    },
    toggle: function (id) {
      var all = load();
      var it = all.filter(function (t) { return t.id === id; })[0];
      if (!it) return;
      it.done = !it.done;
      it.doneAt = it.done ? D.today() : null;
      save(all);
    },

    render: function (root) {
      root.innerHTML =
        '<div class="pad">' +
        '<form class="addbar" id="tdAdd" autocomplete="off">' +
        '<input id="tdInput" type="text" placeholder="要做什么？" maxlength="80" enterkeyhint="done">' +
        '<button type="submit" aria-label="添加">＋</button>' +
        '</form>' +
        '<div id="tdBody" class="fill"></div>' +
        '</div>';

      var input = App.$('#tdInput', root);
      var body = App.$('#tdBody', root);

      function paint() {
        var all = load();
        var open = all.filter(function (t) { return !t.done; });
        var done = all.filter(function (t) { return t.done; });

        var html = '';

        if (!all.length) {
          html =
            '<div class="blank">' +
            '<div class="blank-ic">📝</div>' +
            '<p class="blank-t">还没有待办</p>' +
            '<p class="blank-d">想到什么随手记下来，<br>做完打个勾就消失</p>' +
            '</div>';
          body.innerHTML = html;
          return;
        }

        if (open.length) {
          html += '<ul class="rows">';
          open.forEach(function (t) {
            html += rowHtml(t, false);
          });
          html += '</ul>';
        } else {
          html += '<div class="allclear">' +
            '<span>🎉</span> 全部做完了，去歇会儿' +
            '</div>';
        }

        if (done.length) {
          html += '<div class="sect">' +
            '<span class="sect-t">已完成</span>' +
            '<button class="sect-act" type="button" data-clear>' + done.length + ' 项 · 清空</button>' +
            '</div>';
          html += '<ul class="rows">';
          done.forEach(function (t) {
            html += rowHtml(t, true);
          });
          html += '</ul>';
        }

        body.innerHTML = html;
      }

      function rowHtml(t, done) {
        return '<li class="row' + (done ? ' is-done' : '') + '" data-id="' + esc(t.id) + '">' +
          '<button class="row-ck" type="button" data-toggle aria-label="勾选">' +
          '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 6.8"/></svg>' +
          '</button>' +
          '<span class="row-t">' + esc(t.text) + '</span>' +
          '<button class="row-x" type="button" data-del aria-label="删除">' +
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
          '</li>';
      }

      root.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = input.value.trim();
        if (!v) return;
        var all = load();
        all.unshift({ id: App.uid(), text: v, done: false, created: D.today() });
        save(all);
        input.value = '';
        paint();
        App.refresh();
      });

      root.addEventListener('click', function (e) {
        var li = e.target.closest('.row');
        if (!li) {
          if (e.target.closest('[data-clear]')) {
            App.confirm('清空所有已完成的待办？', '清空').then(function (ok) {
              if (!ok) return;
              save(load().filter(function (t) { return !t.done; }));
              paint();
              App.refresh();
            });
          }
          return;
        }
        var id = li.getAttribute('data-id');
        var all = load();
        var item = all.filter(function (t) { return t.id === id; })[0];
        if (!item) return;

        if (e.target.closest('[data-toggle]')) {
          item.done = !item.done;
          item.doneAt = item.done ? D.today() : null;
          save(all);
          paint();
          App.refresh();
        } else if (e.target.closest('[data-del]')) {
          save(all.filter(function (t) { return t.id !== id; }));
          paint();
          App.refresh();
        }
      });

      paint();
    }
  });
})();
