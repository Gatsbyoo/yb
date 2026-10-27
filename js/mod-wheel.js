/* 转盘 · 决定不了就交给它 */
(function () {
  'use strict';

  var KEY = 'wheel';
  var App = window.App;
  var esc = App.esc;

  var COLORS = ['#E4735A', '#D89A3E', '#5F8E72', '#6E8FB8', '#B4789B', '#4F7F8B', '#C08552', '#8B7BB5'];
  var PRESETS = {
    '吃什么': ['火锅', '烤肉', '面条', '炒菜', '外卖', '煮个汤'],
    '谁来洗碗': ['我洗', '你洗', '一起洗', '明天再说'],
    '看什么': ['电影', '纪录片', '综艺', '剧集', '不看，聊天']
  };

  function load() {
    var v = App.Store.get(KEY, null);
    if (!v || !Array.isArray(v.options)) v = { options: PRESETS['吃什么'].slice() };
    return v;
  }
  function save(v) { App.Store.set(KEY, v); }

  function polar(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function drawWheel(opts) {
    var cx = 150, cy = 150, r = 132;
    var n = opts.length;
    var seg = 360 / n;
    var parts = [];

    for (var i = 0; i < n; i++) {
      var a1 = i * seg, a2 = a1 + seg;
      var p1 = polar(cx, cy, r, a1);
      var p2 = polar(cx, cy, r, a2);
      var large = seg > 180 ? 1 : 0;
      var d = 'M' + cx + ' ' + cy + ' L' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) + ' Z';
      parts.push('<path d="' + d + '" fill="' + COLORS[i % COLORS.length] + '" stroke="#FFFDF8" stroke-width="2"/>');
    }

    var fs = n <= 4 ? 19 : n <= 6 ? 16 : n <= 8 ? 14 : 12;

    for (var j = 0; j < n; j++) {
      var mid = j * seg + seg / 2;
      var p = polar(cx, cy, r * 0.63, mid);
      var label = opts[j].length > 5 ? opts[j].slice(0, 5) : opts[j];
      parts.push('<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" ' +
        'text-anchor="middle" dominant-baseline="middle" ' +
        'font-size="' + fs + '" font-weight="600" fill="#FFFDF8" ' +
        'style="pointer-events:none">' + esc(label) + '</text>');
    }

    return '<svg viewBox="0 0 300 300" class="wheel-svg" aria-hidden="true">' +
      '<circle cx="150" cy="150" r="140" fill="#FFFFFF"/>' +
      '<g id="wheelRot">' + parts.join('') + '</g>' +
      '<circle cx="150" cy="150" r="131" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="1"/>' +
      '</svg>' +
      '<div class="wheel-pin"><svg viewBox="0 0 24 24"><path d="M12 20L4.5 6.5h15L12 20z"/></svg></div>';
  }

  App.module({
    id: 'wheel',
    name: '转盘',
    sub: '决定不了就交给它',
    color: 'var(--c-wheel)',
    icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.2"/><path d="M12 12V3.8M12 12l7.1 4.1M12 12L4.9 16.1"/></svg>',

    stat: function () {
      return load().options.length + ' 个选项';
    },

    render: function (root) {
      var data = load();
      var rot = 0;
      var spinning = false;

      root.innerHTML =
        '<div class="pad">' +
        '<div class="wheel-box" id="whBox">' + drawWheel(data.options) + '</div>' +
        '<div class="wheel-result" id="whResult">转一下试试</div>' +
        '<button class="btn btn-primary btn-big" type="button" id="whSpin">转！</button>' +
        '<div class="sect"><span class="sect-t">选项</span>' +
        '<button class="sect-act" type="button" data-edit>修改</button></div>' +
        '<div class="chipwrap" id="whOpts">' +
        data.options.map(function (o, i) {
          return '<span class="chip chip-static"><i style="background:' + COLORS[i % COLORS.length] + '"></i>' + esc(o) + '</span>';
        }).join('') +
        '</div>' +
        '<p class="hint hint-foot">点「修改」可以改选项，一行一个。</p>' +
        '</div>';

      var resultEl = App.$('#whResult', root);
      var g = App.$('#wheelRot', root);
      var seg = 360 / data.options.length;

      App.$('#whSpin', root).addEventListener('click', function () {
        if (spinning || data.options.length < 2) {
          if (data.options.length < 2) App.toast('至少要有两个选项');
          return;
        }
        spinning = true;
        resultEl.textContent = '…';
        resultEl.classList.remove('is-on');

        var i = Math.floor(Math.random() * data.options.length);
        var center = i * seg + seg / 2;
        var jitter = (Math.random() - 0.5) * seg * 0.5;
        var turns = 5 + Math.floor(Math.random() * 3);

        /* 让第 i 格的中心停在顶端的指针下：转过的角度 ≡ -center (mod 360) */
        var base = rot - (rot % 360);
        var finalRot = base + turns * 360 + (360 - center) + jitter;
        rot = finalRot;

        g.style.transition = 'transform 3.2s cubic-bezier(.17,.85,.13,1)';
        g.style.transformOrigin = '150px 150px';
        g.style.transform = 'rotate(' + finalRot + 'deg)';

        setTimeout(function () {
          spinning = false;
          resultEl.textContent = data.options[i];
          resultEl.classList.add('is-on');
        }, 3300);
      });

      root.addEventListener('click', function (e) {
        if (!e.target.closest('[data-edit]')) return;
        App.sheet({
          title: '修改选项',
          body: '<textarea class="ed-text" id="whText" rows="6" ' +
            'placeholder="一行一个">' + esc(data.options.join('\n')) + '</textarea>' +
            '<p class="hint">最少 2 个，最多 8 个。</p>',
          okText: '保存',
          cancelText: '取消',
          onOk: function (body) {
            var opts = App.$('#whText', body).value
              .split('\n')
              .map(function (s) { return s.trim(); })
              .filter(Boolean)
              .slice(0, 8);
            if (opts.length < 2) { App.toast('至少要有两个选项'); return false; }
            save({ options: opts });
            App.reload();
          }
        });
      });
    }
  });
})();
