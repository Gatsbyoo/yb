/* 日记 · 一天一句，心情选一下
   照片会先压到 1000px / JPEG 62%，再存本地，不然 localStorage 很快就满 */
(function () {
  'use strict';

  var KEY = 'diary';
  var App = window.App;
  var esc = App.esc, D = App.D;

  var MOODS = [
    { e: '😞', t: '低落' },
    { e: '😐', t: '一般' },
    { e: '🙂', t: '还行' },
    { e: '😊', t: '开心' },
    { e: '🤩', t: '超棒' }
  ];

  function load() { return App.Store.get(KEY, []); }
  /* 必须把结果返回出去：调用方会用 if (!save(...)) return 来兜住存不下的情况 */
  function save(v) { return App.Store.set(KEY, v); }

  function todayEntry() {
    var t = D.today();
    return load().filter(function (x) { return x.date === t; })[0] || null;
  }

  /* 图片压缩：等比缩到最长边 max，转 JPEG */
  function compress(file, max, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          var k = Math.min(1, max / Math.max(w, h));
          var cw = Math.round(w * k), ch = Math.round(h * k);
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.onerror = function () { reject(new Error('图片读不出来')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('文件读不出来')); };
      reader.readAsDataURL(file);
    });
  }

  App.module({
    id: 'diary',
    name: '日记',
    sub: '一天一句，配张照片',
    color: 'var(--c-diary)',
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 4.5h11.5a2.5 2.5 0 0 1 2.5 2.5v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5z"/><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H19"/><path d="M9 8.5h6"/></svg>',

    stat: function () {
      var t = load();
      if (!t.length) return '还没写';
      return todayEntry() ? '今天写过了' : '今天还没写';
    },

    todayEntry: todayEntry,

    render: function (root) {
      var editing = todayEntry() || { date: D.today(), mood: 0, text: '', photo: '' };

      root.innerHTML =
        '<div class="pad">' +
        '<div class="edcard">' +
        '<div class="ed-top">' +
        '<input class="ed-date" id="dwDate" type="date" value="' + esc(editing.date) + '">' +
        '<span class="ed-rel" id="dwRel"></span>' +
        '</div>' +
        '<div class="moods" id="dwMoods"></div>' +
        '<textarea class="ed-text" id="dwText" rows="4" placeholder="今天怎么样？">' + esc(editing.text) + '</textarea>' +
        '<div class="ed-photo" id="dwPhoto"></div>' +
        '<div class="ed-foot"><button class="btn btn-primary" type="button" id="dwSave">保存</button></div>' +
        '</div>' +
        '<div id="dwList"></div>' +
        '</div>';

      var dateEl = App.$('#dwDate', root);
      var relEl = App.$('#dwRel', root);
      var moodEl = App.$('#dwMoods', root);
      var textEl = App.$('#dwText', root);
      var photoEl = App.$('#dwPhoto', root);
      var listEl = App.$('#dwList', root);

      var state = { mood: editing.mood || 0, photo: editing.photo || '' };

      function paintMoods() {
        moodEl.innerHTML = MOODS.map(function (m, i) {
          return '<button type="button" class="mood' + (state.mood === i + 1 ? ' is-on' : '') +
            '" data-mood="' + (i + 1) + '" aria-label="' + m.t + '">' + m.e + '</button>';
        }).join('');
      }

      function paintPhoto() {
        if (state.photo) {
          photoEl.innerHTML = '<div class="ph"><img src="' + state.photo + '" alt="照片">' +
            '<button type="button" class="ph-x" data-phdel aria-label="去掉照片">✕</button></div>';
        } else {
          photoEl.innerHTML = '<button type="button" class="ph-add" data-phadd>' +
            '<span>📷</span> 加一张照片</button>' +
            '<input type="file" accept="image/*" id="dwFile" hidden>';
        }
      }

      function paintRel() {
        relEl.textContent = D.rel(dateEl.value || D.today());
      }

      function paintList() {
        var all = load().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        if (!all.length) {
          listEl.innerHTML = '';
          return;
        }
        var html = '<div class="sect"><span class="sect-t">以前写的</span>' +
          '<span class="sect-v">' + all.length + ' 篇</span></div>' +
          '<div class="dgrid">';
        all.forEach(function (x) {
          var m = MOODS[(x.mood || 0) - 1];
          html += '<button class="dcell" type="button" data-date="' + esc(x.date) + '">' +
            (x.photo
              ? '<span class="dcell-ph" style=\'background-image:url("' + x.photo + '")\'></span>'
              : '<span class="dcell-ph dcell-no">' + (m ? m.e : '📄') + '</span>') +
            '<span class="dcell-b">' +
            '<span class="dcell-d">' + D.md(x.date) + '</span>' +
            '<span class="dcell-t">' + (m ? m.e + ' ' : '') + esc((x.text || '').slice(0, 40) || '（只有照片）') + '</span>' +
            '</span>' +
            '</button>';
        });
        html += '</div>';
        listEl.innerHTML = html;
      }

      /* 切日期时把那天已有的内容带出来 */
      function loadDate() {
        var d = dateEl.value || D.today();
        var e = load().filter(function (x) { return x.date === d; })[0];
        state.mood = e ? (e.mood || 0) : 0;
        state.photo = e ? (e.photo || '') : '';
        textEl.value = e ? (e.text || '') : '';
        paintMoods();
        paintPhoto();
        paintRel();
      }

      moodEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mood]');
        if (!b) return;
        var v = +b.getAttribute('data-mood');
        state.mood = state.mood === v ? 0 : v;
        paintMoods();
      });

      photoEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-phdel]')) {
          state.photo = '';
          paintPhoto();
          return;
        }
        if (e.target.closest('[data-phadd]')) {
          var f = App.$('#dwFile', photoEl);
          if (f) f.click();
        }
      });

      photoEl.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        App.toast('正在压缩照片…');
        compress(file, 1000, 0.62).then(function (data) {
          state.photo = data;
          paintPhoto();
        }).catch(function () {
          App.toast('这张照片读不出来，换一张试试');
        });
      });

      App.$('#dwSave', root).addEventListener('click', function () {
        var d = dateEl.value || D.today();
        var text = textEl.value.trim();
        if (!text && !state.photo && !state.mood) {
          App.toast('写点什么，或者选个心情');
          return;
        }
        var all = load().filter(function (x) { return x.date !== d; });
        all.push({ date: d, mood: state.mood, text: text, photo: state.photo, ts: Date.now() });
        if (!save(all)) return;
        App.toast('记下了');
        paintList();
        App.refresh();
      });

      dateEl.addEventListener('change', loadDate);

      listEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-date]');
        if (!b) return;
        var d = b.getAttribute('data-date');
        var x = load().filter(function (y) { return y.date === d; })[0];
        if (!x) return;
        var m = MOODS[(x.mood || 0) - 1];

        App.sheet({
          title: D.md(x.date) + '　' + D.wk(x.date),
          body: '<div class="dview">' +
            (x.photo ? '<img class="dview-img" src="' + x.photo + '" alt="">' : '') +
            (m ? '<div class="dview-mood">' + m.e + ' ' + m.t + '</div>' : '') +
            '<p class="dview-t">' + esc(x.text || '') + '</p>' +
            '</div>',
          okText: '删掉这篇',
          cancelText: '关闭',
          onOk: function () {
            save(load().filter(function (y) { return y.date !== d; }));
            paintList();
            if (d === dateEl.value) loadDate();
            App.refresh();
          }
        });
      });

      paintMoods();
      paintPhoto();
      paintRel();
      paintList();
    }
  });
})();
