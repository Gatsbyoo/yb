/* 今天吃啥 · 应用逻辑
   纯前端 + localStorage，无后端、无登录，离线可用 */
(function () {
  'use strict';

  /* ---------------- 存储 ---------------- */

  var K = {
    list: 'yb.list.v1',
    recent: 'yb.recent.v1',
    custom: 'yb.custom.v1',
    filter: 'yb.filter.v1'
  };

  function load(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? def : JSON.parse(raw);
    } catch (e) { return def; }
  }

  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------------- 状态 ---------------- */

  var S = {
    recipes: [],
    custom: load(K.custom, []),
    list: load(K.list, []),
    recent: load(K.recent, []),
    filter: load(K.filter, 'all'),
    recFilter: 'all',
    query: '',
    current: null
  };

  var FILTERS = [
    { k: 'all', label: '随便' },
    { k: '快手', label: '⚡ 15 分钟内' },
    { k: '素', label: '🥬 素的' },
    { k: '有肉', label: '🍖 有肉' },
    { k: '汤', label: '🥣 汤' },
    { k: '主食', label: '🍚 主食' },
    { k: '辣', label: '🌶 辣的' },
    { k: '清淡', label: '😌 清淡' }
  ];

  var CAT_ORDER = ['蔬菜', '肉蛋', '主食', '其他', '调料'];
  var CAT_ICON = { '蔬菜': '🥬', '肉蛋': '🥩', '主食': '🍚', '其他': '🥛', '调料': '🧂' };

  var SEASON_WORDS = ['酱', '蚝油', '生抽', '老抽', '酱油', '醋', '盐', '糖', '淀粉', '料酒',
    '香油', '花椒', '孜然', '味精', '鸡精', '胡椒', '豆豉', '八角', '桂皮', '干辣椒', '芝麻'];
  var MEAT_WORDS = ['肉', '鸡', '鸭', '鱼', '虾', '排骨', '牛', '猪', '蛋', '培根', '火腿', '腊肠', '鱿鱼'];
  var VEG_WORDS = ['菜', '瓜', '茄', '椒', '葱', '姜', '蒜', '豆', '菇', '萝卜', '番茄', '西红柿',
    '土豆', '洋葱', '芹', '韭', '藕', '笋', '玉米', '山药', '菠菜', '木耳'];
  var STAPLE_WORDS = ['米', '面', '粉', '馒头', '年糕', '饭', '饺子皮', '粉丝'];

  /* ---------------- 小工具 ---------------- */

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buzz(ms) {
    try { if (navigator.vibrate) { navigator.vibrate(ms); } } catch (e) { /* 忽略 */ }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }

  function saveList() { save(K.list, S.list); }

  /* ---------------- 挑菜 ---------------- */

  function pool() {
    var arr = S.recipes;
    if (S.filter !== 'all') {
      arr = arr.filter(function (r) { return r.tags.indexOf(S.filter) > -1; });
    }
    if (arr.length > 6 && S.recent.length) {
      var fresh = arr.filter(function (r) { return S.recent.indexOf(r.id) === -1; });
      if (fresh.length) arr = fresh;
    }
    return arr;
  }

  function nextPick() {
    var arr = pool();
    if (!arr.length) return null;
    var cur = S.current ? S.current.id : null;
    var cands = arr.filter(function (r) { return r.id !== cur; });
    if (!cands.length) cands = arr;
    return cands[Math.floor(Math.random() * cands.length)];
  }

  function renderPick() {
    var r = S.current;
    if (!r) {
      $('#pickEmoji').textContent = '🤔';
      $('#pickName').textContent = '这个分类还没菜';
      $('#pickMeta').innerHTML = '';
      $('#pickTip').textContent = '换个筛选条件，或者去菜谱里加一道。';
      return;
    }
    $('#pickEmoji').textContent = r.emoji || '🍽';
    $('#pickName').textContent = r.name;

    var meta = '<span class="tag">⏱ ' + r.time + ' 分钟</span>';
    (r.tags || []).forEach(function (t) {
      meta += '<span class="tag' + (t === '辣' ? ' hot' : '') + '">' + esc(t) + '</span>';
    });
    meta += '<span class="tag">' + r.ing.length + ' 样食材</span>';
    $('#pickMeta').innerHTML = meta;

    if (r.tip) {
      $('#pickTip').style.display = '';
      $('#pickTip').innerHTML = '<b>小提示</b>　' + esc(r.tip);
    } else {
      $('#pickTip').style.display = 'none';
    }
  }

  function renderHint() {
    var n = S.recent.length;
    $('#homeHint').textContent = n
      ? '已经避开你最近做过的 ' + n + ' 道，不容易连着吃重复'
      : '挑到满意为止，不满意就一直点';
  }

  function roll() {
    var card = $('#pick');
    card.classList.remove('roll-in');
    card.classList.add('roll-out');
    buzz(8);
    setTimeout(function () {
      S.current = nextPick();
      renderPick();
      card.classList.remove('roll-out');
      void card.offsetWidth;
      card.classList.add('roll-in');
    }, 155);
  }

  /* ---------------- 清单 ---------------- */

  function addToList(items, withSeasoning) {
    var added = 0;
    items.forEach(function (it) {
      var name = it[0], amount = it[1], cat = it[2];
      if (cat === '调料' && !withSeasoning) return;

      var key = cat + '|' + name;
      var exist = null;
      for (var i = 0; i < S.list.length; i++) {
        if (S.list[i].key === key) { exist = S.list[i]; break; }
      }

      if (exist) {
        exist.extra = exist.extra || [];
        if (exist.amount !== amount && exist.amount.indexOf(amount) === -1) {
          if (exist.extra.indexOf(amount) === -1) exist.extra.push(amount);
        }
        return;
      }

      S.list.push({
        key: key, name: name, amount: amount, extra: [],
        cat: cat, checked: false
      });
      added++;
    });
    saveList();
    renderList();
    return added;
  }

  function amountText(i) {
    var extra = i.extra && i.extra.length ? ' + ' + i.extra.join(' + ') : '';
    return i.amount + extra;
  }

  function renderList() {
    var total = S.list.length;
    var done = 0;
    S.list.forEach(function (i) { if (i.checked) done++; });

    $('#cntDone').textContent = done;
    $('#cntAll').textContent = total;
    $('#barFill').style.width = total ? (done / total * 100) + '%' : '0%';

    var groups = $('#groups');
    var empty = $('#listEmpty');
    var acts = $('#listActions');

    if (!total) {
      groups.innerHTML = '';
      empty.innerHTML =
        '<div class="empty">' +
        '<div class="empty-ic">🛒</div>' +
        '<p class="empty-t">清单还是空的</p>' +
        '<p class="empty-d">去「吃啥」挑一道，<br>食材会自动加到这里</p>' +
        '<button class="empty-cta" type="button" data-act="pick">去挑一道</button>' +
        '</div>';
      acts.style.display = 'none';
      updateBadge();
      return;
    }

    empty.innerHTML = '';
    acts.style.display = '';

    var html = '';
    CAT_ORDER.forEach(function (cat) {
      var items = S.list.filter(function (i) { return i.cat === cat; });
      if (!items.length) return;

      var doneN = 0;
      items.forEach(function (i) { if (i.checked) doneN++; });

      items.sort(function (a, b) { return (a.checked === b.checked) ? 0 : (a.checked ? 1 : -1); });

      html += '<div class="grp">' +
        '<span class="grp-ic">' + CAT_ICON[cat] + '</span>' +
        '<span>' + cat + '</span>' +
        '<span class="grp-n">' + doneN + '/' + items.length + '</span>' +
        '</div>';

      items.forEach(function (i) {
        html += '<button class="li' + (i.checked ? ' done' : '') + '" type="button" ' +
          'data-key="' + encodeURIComponent(i.key) + '">' +
          '<span class="tick"></span>' +
          '<span class="li-body">' +
          '<span class="li-name">' + esc(i.name) + '</span>' +
          '<span class="li-amt">' + esc(amountText(i)) + '</span>' +
          '</span></button>';
      });
    });

    groups.innerHTML = html;
    updateBadge();
  }

  function updateBadge() {
    var n = 0;
    S.list.forEach(function (i) { if (!i.checked) n++; });
    var b = $('#badge');
    if (n > 0) {
      b.textContent = n > 99 ? '99+' : n;
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  function toggleItem(key) {
    for (var i = 0; i < S.list.length; i++) {
      if (S.list[i].key === key) {
        S.list[i].checked = !S.list[i].checked;
        buzz(6);
        break;
      }
    }
    saveList();
    renderList();
  }

  function clearDone() {
    var before = S.list.length;
    S.list = S.list.filter(function (i) { return !i.checked; });
    if (before === S.list.length) { toast('还没有勾掉的东西'); return; }
    saveList();
    renderList();
    toast('清掉 ' + (before - S.list.length) + ' 样，清爽了');
  }

  function copyList() {
    var items = S.list.filter(function (i) { return !i.checked; });
    if (!items.length) { toast('没有要买的了'); return; }

    var txt = '买菜清单\n' + items.map(function (i) {
      return '· ' + i.name + ' ' + amountText(i);
    }).join('\n');

    function done() { toast('已复制，直接发给他'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, txt.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? '已复制，直接发给他' : '复制没成功，长按清单手动选吧');
    }

    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------------- 菜谱 ---------------- */

  function renderRecipes() {
    var q = S.query.trim();
    var arr = S.recipes.filter(function (r) {
      if (S.recFilter !== 'all' && r.tags.indexOf(S.recFilter) === -1) return false;
      if (!q) return true;
      if (r.name.indexOf(q) > -1) return true;
      return r.ing.some(function (i) { return i[0].indexOf(q) > -1; });
    });

    var el = $('#rlist');
    if (!arr.length) {
      el.innerHTML = '<div class="empty">' +
        '<div class="empty-ic">🔍</div>' +
        '<p class="empty-t">没找到这道菜</p>' +
        '<p class="empty-d">换个词试试，<br>或者自己加一道进来</p></div>';
      return;
    }

    el.innerHTML = arr.map(function (r) {
      var meta = '⏱ ' + r.time + ' 分钟 · ' + (r.tags[0] || '家常') + ' · ' + r.ing.length + ' 样食材';
      return '<button class="ritem" type="button" data-id="' + esc(r.id) + '">' +
        '<span class="ritem-emoji">' + (r.emoji || '🍽') + '</span>' +
        '<span class="ritem-body">' +
        '<span class="ritem-name">' + esc(r.name) + '</span>' +
        '<span class="ritem-meta">' + esc(meta) + '</span>' +
        '</span><span class="ritem-arrow"></span></button>';
    }).join('');
  }

  /* ---------------- 抽屉 ---------------- */

  function openSheet() {
    $('#sheet').classList.add('open');
    $('#sheet').setAttribute('aria-hidden', 'false');
    $('#backdrop').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    $('#sheet').classList.remove('open');
    $('#sheet').setAttribute('aria-hidden', 'true');
    $('#backdrop').classList.remove('show');
    document.body.style.overflow = '';
  }

  function findRecipe(id) {
    for (var i = 0; i < S.recipes.length; i++) {
      if (S.recipes[i].id === id) return S.recipes[i];
    }
    return null;
  }

  function openRecipe(id) {
    var r = findRecipe(id);
    if (!r) return;

    var seasonN = 0;
    r.ing.forEach(function (i) { if (i[2] === '调料') seasonN++; });
    var mainN = r.ing.length - seasonN;

    var body = '<div class="d-hero">' +
      '<div class="d-hero-emoji">' + (r.emoji || '🍽') + '</div>' +
      '<div><h3 class="d-name">' + esc(r.name) + '</h3><div class="d-tags">' +
      '<span class="tag">⏱ ' + r.time + ' 分钟</span>';

    (r.tags || []).forEach(function (t) {
      body += '<span class="tag' + (t === '辣' ? ' hot' : '') + '">' + esc(t) + '</span>';
    });
    body += '</div></div></div>';

    body += '<div class="sec-t">食材 ' + r.ing.length + ' 样</div><div class="ings">';
    r.ing.forEach(function (i) {
      body += '<div class="ing' + (i[2] === '调料' ? ' cook' : '') + '">' +
        '<span class="ing-name">' + esc(i[0]) + '</span>' +
        '<span class="ing-amt">' + esc(i[1]) + '</span></div>';
    });
    body += '</div>';

    body += '<div class="sec-t">做法</div><ol class="steps">';
    (r.steps || []).forEach(function (s) { body += '<li>' + esc(s) + '</li>'; });
    body += '</ol>';

    if (r.tip) {
      body += '<div class="tipbox"><b>小提示</b><br>' + esc(r.tip) + '</div>';
    }

    $('#sheetTitle').textContent = '菜谱';
    $('#sheetBody').innerHTML = body;
    $('#sheetBody').scrollTop = 0;

    var foot = '<button class="btn btn-primary" type="button" data-act="addmain" ' +
      'data-id="' + esc(r.id) + '">加 ' + mainN + ' 样食材</button>';
    if (seasonN) {
      foot += '<button class="btn btn-ghost" type="button" data-act="addall" ' +
        'data-id="' + esc(r.id) + '">连调料一起</button>';
    }
    $('#sheetFoot').innerHTML = foot;

    openSheet();
  }

  /* ---------------- 添加菜谱 ---------------- */

  function guessCat(name) {
    var i;
    for (i = 0; i < SEASON_WORDS.length; i++) if (name.indexOf(SEASON_WORDS[i]) > -1) return '调料';
    for (i = 0; i < MEAT_WORDS.length; i++) if (name.indexOf(MEAT_WORDS[i]) > -1) return '肉蛋';
    for (i = 0; i < VEG_WORDS.length; i++) if (name.indexOf(VEG_WORDS[i]) > -1) return '蔬菜';
    for (i = 0; i < STAPLE_WORDS.length; i++) if (name.indexOf(STAPLE_WORDS[i]) > -1) return '主食';
    return '其他';
  }

  function openAdd() {
    var body = '' +
      '<div class="field"><label for="fName">菜名</label>' +
      '<input id="fName" placeholder="比如 妈妈的番茄牛腩" maxlength="24"></div>' +

      '<div class="field"><label for="fTime">大概要多久（分钟）</label>' +
      '<input id="fTime" type="number" inputmode="numeric" placeholder="30" min="1" max="300"></div>' +

      '<div class="field"><label for="fIng">食材</label>' +
      '<textarea id="fIng" placeholder="每行一样，名称和用量用空格隔开&#10;牛腩 600g&#10;番茄 4个"></textarea>' +
      '<p class="hint">会自动判断分类，让清单按超市货架顺序排好</p></div>' +

      '<div class="field"><label for="fSteps">做法</label>' +
      '<textarea id="fSteps" placeholder="每行一步，越简单越好"></textarea></div>';

    $('#sheetTitle').textContent = '加一道菜';
    $('#sheetBody').innerHTML = body;
    $('#sheetBody').scrollTop = 0;
    $('#sheetFoot').innerHTML =
      '<button class="btn btn-ghost" type="button" data-act="cancel">算了</button>' +
      '<button class="btn btn-primary" type="button" data-act="save">保存</button>';

    openSheet();
    setTimeout(function () { var n = $('#fName'); if (n) n.focus(); }, 340);
  }

  function splitLines(txt) {
    return txt.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function saveNewRecipe() {
    var name = ($('#fName') || {}).value || '';
    name = name.trim();
    if (!name) { toast('先给它起个名字'); return; }

    var rawIng = splitLines(($('#fIng') || {}).value || '');
    if (!rawIng.length) { toast('至少写一样食材'); return; }

    var ing = rawIng.map(function (line) {
      var parts = line.split(/\s+/);
      var n = parts.shift();
      var amt = parts.join(' ') || '适量';
      return [n, amt, guessCat(n)];
    });

    var steps = splitLines(($('#fSteps') || {}).value || '');
    var t = parseInt((($('#fTime') || {}).value || ''), 10);
    if (!t || t < 1 || t > 300) t = 30;

    S.custom.push({
      id: 'c_' + Date.now(),
      name: name,
      emoji: '🍽',
      time: t,
      tags: ['我的'],
      ing: ing,
      steps: steps.length ? steps : ['按自己的做法来。'],
      tip: ''
    });

    save(K.custom, S.custom);
    S.recipes = (window.RECIPES || []).concat(S.custom);

    closeSheet();
    renderRecipes();
    renderSub();
    toast('加好了，「' + name + '」');
  }

  /* ---------------- 视图 ---------------- */

  function switchView(name) {
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = document.getElementById('view-' + name);
    if (target) target.classList.add('active');

    $$('.tab').forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-view') === name);
    });

    if (name === 'list') renderList();
    if (name === 'recipes') renderRecipes();
    window.scrollTo(0, 0);
  }

  function renderSub() {
    $('#homeSub').textContent = S.recipes.length + ' 道家常菜，挑一道给你';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return '这么晚还没睡';
    if (h < 10) return '早上好';
    if (h < 14) return '中午好';
    if (h < 17) return '下午好';
    if (h < 21) return '晚上好';
    return '夜宵时间';
  }

  function buildChips(sel, kind) {
    var cur = kind === 'home' ? S.filter : S.recFilter;
    var el = $(sel);
    el.innerHTML = FILTERS.map(function (f) {
      return '<button class="chip' + (f.k === cur ? ' on' : '') + '" type="button" ' +
        'data-k="' + f.k + '">' + f.label + '</button>';
    }).join('');
  }

  /* ---------------- 事件 ---------------- */

  function bind() {
    // 标签栏
    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        switchView(t.getAttribute('data-view'));
      });
    });

    // 首页
    $('#btnRoll').addEventListener('click', roll);
    $('#btnGo').addEventListener('click', function () {
      if (!S.current) { toast('先挑一道菜'); return; }
      var added = addToList(S.current.ing, false);
      S.recent.push(S.current.id);
      if (S.recent.length > 12) S.recent = S.recent.slice(-12);
      save(K.recent, S.recent);
      renderHint();
      buzz(14);
      switchView('list');
      toast(added ? '已加入 ' + added + ' 样食材' : '这些食材清单里都有了');
    });

    $('#chipsHome').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      S.filter = c.getAttribute('data-k');
      save(K.filter, S.filter);
      buildChips('#chipsHome', 'home');
      S.current = nextPick();
      renderPick();
    });

    // 菜谱
    $('#chipsRecipes').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      S.recFilter = c.getAttribute('data-k');
      buildChips('#chipsRecipes', 'rec');
      renderRecipes();
    });

    $('#q').addEventListener('input', function () {
      S.query = this.value;
      renderRecipes();
    });

    $('#rlist').addEventListener('click', function (e) {
      var item = e.target.closest('.ritem');
      if (!item) return;
      openRecipe(item.getAttribute('data-id'));
    });

    $('#btnAdd').addEventListener('click', openAdd);

    // 清单
    $('#groups').addEventListener('click', function (e) {
      var item = e.target.closest('.li');
      if (!item) return;
      toggleItem(decodeURIComponent(item.getAttribute('data-key')));
    });

    $('#btnClearDone').addEventListener('click', clearDone);
    $('#btnCopy').addEventListener('click', copyList);

    $('#listEmpty').addEventListener('click', function (e) {
      if (e.target.closest('[data-act="pick"]')) switchView('home');
    });

    // 抽屉
    $('#sheetClose').addEventListener('click', closeSheet);
    $('#backdrop').addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
    });

    $('#sheetFoot').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');

      if (act === 'cancel') { closeSheet(); return; }
      if (act === 'save') { saveNewRecipe(); return; }

      var r = findRecipe(btn.getAttribute('data-id'));
      if (!r) return;

      var added = addToList(r.ing, act === 'addall');
      buzz(12);
      toast(added ? '已加入 ' + added + ' 样食材' : '这些食材清单里都有了');
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    S.recipes = (window.RECIPES || []).concat(S.custom);
    S.list.forEach(function (i) { if (!i.extra) i.extra = []; });

    $('#greet').textContent = greeting();
    renderSub();
    buildChips('#chipsHome', 'home');
    buildChips('#chipsRecipes', 'rec');

    S.current = nextPick();
    renderPick();
    renderHint();
    renderRecipes();
    renderList();

    bind();

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* 离线能力降级但不报错 */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
