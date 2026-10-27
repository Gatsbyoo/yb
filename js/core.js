/* 小日子 · 核心层
   存储、日期、DOM 小工具、通用 UI（底部抽屉 / 轻提示 / 确认框）
   除本文件外，其它模块只依赖 App.* 暴露出来的东西 */
(function () {
  'use strict';

  var PREFIX = 'xrz.v1.';

  /* ================= DOM ================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ================= 存储 =================
     全部挂在 localStorage 的 xrz.v1.* 前缀下，方便整体导出 / 清空 */

  var Store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(PREFIX + key);
        if (raw == null || raw === '') return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, val) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(val));
        return true;
      } catch (e) {
        // 配额满了（多半是日记照片太多）
        toast('存不下了，去「我」里清理一下照片？');
        return false;
      }
    },
    keys: function () {
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k);
      }
      return out;
    },
    exportAll: function () {
      var data = { app: 'xiaorizi', version: 1, exportedAt: new Date().toISOString(), data: {} };
      Store.keys().forEach(function (k) {
        data.data[k.slice(PREFIX.length)] = localStorage.getItem(k);
      });
      return data;
    },
    importAll: function (obj) {
      if (!obj || obj.app !== 'xiaorizi' || !obj.data) throw new Error('不是小日子的备份文件');
      Object.keys(obj.data).forEach(function (k) {
        localStorage.setItem(PREFIX + k, obj.data[k]);
      });
    },
    clearAll: function () {
      Store.keys().forEach(function (k) { localStorage.removeItem(k); });
    }
  };

  /* ================= 日期 ================= */

  var D = {
    pad: function (n) { return (n < 10 ? '0' : '') + n; },

    /* Date -> 'YYYY-MM-DD' */
    key: function (d) {
      return d.getFullYear() + '-' + D.pad(d.getMonth() + 1) + '-' + D.pad(d.getDate());
    },

    today: function () { return D.key(new Date()); },

    /* 'YYYY-MM-DD' -> Date（本地零点，避免时区偏移） */
    parse: function (s) {
      var p = String(s).split('-');
      return new Date(+p[0], (+p[1]) - 1, +p[2]);
    },

    addDays: function (s, n) {
      var d = D.parse(s);
      d.setDate(d.getDate() + n);
      return D.key(d);
    },

    /* b - a，单位天 */
    diff: function (a, b) {
      var da = D.parse(a), db = D.parse(b);
      return Math.round((db - da) / 86400000);
    },

    weekday: function (s) {
      return '日一二三四五六'.charAt(D.parse(s).getDay());
    },

    /* '周' + 星期几，展示用 */
    wk: function (s) { return '周' + D.weekday(s); },

    /* '2026-10-27' -> '10月27日' */
    md: function (s) {
      var d = D.parse(s);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },

    /* 相对今天的人话：今天 / 昨天 / 后天 / 3 天后 / 5 天前 */
    rel: function (s) {
      var n = D.diff(D.today(), s);
      if (n === 0) return '今天';
      if (n === 1) return '明天';
      if (n === 2) return '后天';
      if (n === -1) return '昨天';
      if (n === -2) return '前天';
      return n > 0 ? n + ' 天后' : Math.abs(n) + ' 天前';
    },

    month: function (s) { return String(s).slice(0, 7); },

    /* 本月的第一天 */
    monthFirst: function (s) { return D.month(s) + '-01'; }
  };

  /* ================= 轻提示 ================= */

  var toastTimer = null;

  function toast(msg) {
    var node = $('#toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'toast';
      node.className = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = msg;
    node.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('is-on');
    }, 2000);
  }

  /* ================= 底部抽屉 =================
     统一的弹层：标题 + 内容 + 主次按钮，带背景遮罩和进出动画 */

  var sheetStack = [];

  function openSheet(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';

    var head = opts.title
      ? '<div class="sheet-hd">' +
        '<span class="sheet-title">' + esc(opts.title) + '</span>' +
        '<button class="sheet-x" type="button" data-x aria-label="关闭">' +
        '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></button>' +
        '</div>'
      : '';

    var foot = '';
    if (opts.okText || opts.cancelText) {
      foot = '<div class="sheet-ft">' +
        (opts.cancelText ? '<button class="btn btn-line" type="button" data-cancel>' + esc(opts.cancelText) + '</button>' : '') +
        (opts.okText ? '<button class="btn btn-primary" type="button" data-ok>' + esc(opts.okText) + '</button>' : '') +
        '</div>';
    }

    wrap.innerHTML =
      '<div class="sheet-mask" data-x></div>' +
      '<div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-grip"></div>' +
      head +
      '<div class="sheet-bd"></div>' +
      foot +
      '</div>';

    var body = $('.sheet-bd', wrap);
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    document.body.appendChild(wrap);
    document.body.classList.add('is-locked');

    requestAnimationFrame(function () { wrap.classList.add('is-on'); });

    function close() {
      wrap.classList.remove('is-on');
      document.body.classList.remove('is-locked');
      sheetStack = sheetStack.filter(function (s) { return s !== close; });
      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }, 240);
      if (opts.onClose) opts.onClose();
    }

    sheetStack.push(close);

    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]') || e.target.closest('[data-cancel]')) {
        e.preventDefault();
        close();
        return;
      }
      if (e.target.closest('[data-ok]')) {
        e.preventDefault();
        if (opts.onOk) {
          var keep = opts.onOk(body, close);
          if (keep === false) return;
        }
        close();
      }
    });

    if (opts.onMount) opts.onMount(body, close);
    App.lastSheet = close;
    return close;
  }

  function confirmBox(msg, okText) {
    return new Promise(function (resolve) {
      openSheet({
        title: '',
        body: '<p class="confirm-msg">' + esc(msg) + '</p>',
        cancelText: '再想想',
        okText: okText || '确定',
        onOk: function () { resolve(true); },
        onClose: function () { resolve(false); }
      });
    });
  }

  /* 路由切换时必须把弹层收掉，否则安卓返回键退到别的页面后
     弹层还盖在最上面，点哪都没反应 */
  function closeSheets() {
    sheetStack.slice().forEach(function (fn) { fn(); });
  }

  /* ================= 模块注册 ================= */

  var modules = [];
  var byId = {};

  function module(def) {
    modules.push(def);
    byId[def.id] = def;
    return def;
  }

  /* ================= 导出 ================= */

  var App = {
    $: $, $$: $$, esc: esc, uid: uid,
    Store: Store, D: D,
    toast: toast, sheet: openSheet, confirm: confirmBox, closeSheets: closeSheets,
    module: module,
    modules: function () { return modules; },
    get: function (id) { return byId[id]; },
    /* 让模块之间能互相取数（首页要读各模块的统计） */
    stat: function (id) {
      var m = byId[id];
      if (!m || !m.stat) return '';
      try { return m.stat(); } catch (e) { return ''; }
    },
    /* 全局重绘：任何模块改了数据都可以喊一声 */
    refresh: function () {
      if (App.onRefresh) App.onRefresh();
    }
  };

  window.App = App;
})();
