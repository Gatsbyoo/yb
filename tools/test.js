/* 开发自检工具：端到端跑一遍主流程，确认交互真的可用
   用法：起静态服务器后 node tools/test.js */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const PORT = 9355;
const OUT = path.join(ROOT, '_shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(OUT, 'test-profile'),
  'about:blank'
], { stdio: 'ignore' });

const SCRIPT = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const out = [];
  const ls = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  const check = (name, ok, extra) => out.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' → ' + extra : ''));

  // --- 1 首页挑菜 → 就它了 ---
  const name = $('#pickName').textContent.trim();
  check('首页有推荐菜', name.length > 1, name);

  $('#btnGo').click();
  await sleep(120);
  check('切到清单页', $('#view-list').classList.contains('active'));
  const list1 = ls('yb.list.v1') || [];
  check('清单已生成', list1.length > 0, list1.length + ' 样');
  check('调料默认不入清单', list1.every(i => i.cat !== '调料'));
  check('标签栏角标显示', !$('#badge').hidden, $('#badge').textContent);

  // --- 2 勾选 / 清空已买 ---
  const firstKey = $('.li').getAttribute('data-key');
  $('.li').click();
  await sleep(80);
  const afterToggle = (ls('yb.list.v1') || []).filter(i => i.checked).length;
  check('勾选生效', afterToggle === 1, afterToggle + ' 项已勾');
  check('进度条有宽度', parseFloat($('#barFill').style.width) > 0, $('#barFill').style.width);

  $('#btnClearDone').click();
  await sleep(80);
  const afterClear = ls('yb.list.v1') || [];
  check('清掉已买生效', afterClear.length === list1.length - 1, list1.length + ' → ' + afterClear.length);
  check('已买的不含被勾项', afterClear.every(i => !i.checked));

  // --- 3 菜谱详情 → 加食材 ---
  $$('.tab')[1].click();
  await sleep(120);
  const before = (ls('yb.list.v1') || []).length;
  $('.ritem').click();
  await sleep(200);
  check('详情抽屉打开', $('#sheet').classList.contains('open'));
  const footBtn = $('#sheetFoot [data-act="addmain"]');
  check('主按钮是「加 N 样食材」', !!footBtn && /加 \\d+ 样食材/.test(footBtn.textContent), footBtn && footBtn.textContent);

  footBtn.click();
  await sleep(120);
  const after = (ls('yb.list.v1') || []).length;
  check('加食材生效', after > before, before + ' → ' + after);

  $('#sheetClose').click();
  await sleep(200);
  check('抽屉可关闭', !$('#sheet').classList.contains('open'));

  // --- 4 搜索与筛选 ---
  const q = $('#q');
  q.value = '番茄';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(120);
  const searchHits = $$('.ritem').length;
  check('搜索有结果', searchHits > 0, searchHits + ' 条');

  q.value = '';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(80);
  const soupChip = $$('#chipsRecipes .chip').find(c => c.textContent.indexOf('汤') > -1);
  soupChip.click();
  await sleep(120);
  const soupNames = $$('.ritem .ritem-name').map(n => n.textContent);
  check('汤筛选只剩汤', soupNames.length > 0 && soupNames.length < 32, soupNames.join('/'));

  // --- 5 添加自己的菜 ---
  $('#btnAdd').click();
  await sleep(200);
  $('#fName').value = '妈妈的红烧鱼';
  $('#fTime').value = '40';
  $('#fIng').value = '草鱼 1 条\\n姜 3 片\\n生抽 2 勺';
  $('#fSteps').value = '鱼煎两面金黄\\n加调料焖 15 分钟';
  $('#sheetFoot [data-act="save"]').click();
  await sleep(200);
  const custom = ls('yb.custom.v1') || [];
  check('自定义菜已保存', custom.length === 1, custom.length + ' 道');
  if (custom.length) {
    const c = custom[0];
    check('食材分类猜对', c.ing[0][2] === '肉蛋' && c.ing[1][2] === '蔬菜' && c.ing[2][2] === '调料',
      c.ing.map(i => i[0] + ':' + i[2]).join(','));
  }
  check('抽屉已关闭', !$('#sheet').classList.contains('open'));

  // --- 6 空状态 ---
  localStorage.removeItem('yb.list.v1');
  return out;
})()`;

(async function main() {
  const started = Date.now();
  try {
    let wsUrl = null;
    for (let i = 0; i < 40 && !wsUrl; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
        const p = list.find((t) => t.type === 'page');
        if (p && p.webSocketDebuggerUrl) wsUrl = p.webSocketDebuggerUrl;
      } catch (e) { /* 等待 */ }
      if (!wsUrl) await sleep(250);
    }
    if (!wsUrl) throw new Error('连不上调试端口');

    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const errors = [];

    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });

    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
        return;
      }
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
      }
    });

    const send = (method, params) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });

    const js = async (expr, awaitPromise) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    await send('Page.navigate', { url: BASE + '/index.html' });
    await sleep(900);
    await js('localStorage.clear()');
    await send('Page.reload', {});
    await sleep(900);

    const results = await js(SCRIPT, true);
    console.log(results.join('\n'));

    const failed = results.filter((r) => r.indexOf('FAIL') === 0);
    console.log('\n--- 结果 ---');
    console.log('通过 ' + (results.length - failed.length) + ' / ' + results.length);
    if (errors.length) {
      console.log('\n--- 运行时错误 ---');
      console.log(errors.join('\n'));
    } else {
      console.log('运行时错误：无');
    }
    console.log('耗时 ' + ((Date.now() - started) / 1000).toFixed(1) + 's');

    ws.close();
    process.exitCode = failed.length ? 1 : 0;
  } catch (e) {
    console.error('测试中断：' + e.message);
    process.exitCode = 1;
  } finally {
    child.kill();
    setTimeout(() => process.exit(process.exitCode || 0), 250);
  }
})();
