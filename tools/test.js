/* 端到端功能自测
   不是看截图「像不像对」，而是真的点一遍，检查 localStorage 里的数据变没变。
   用法：python -m http.server 8765 && node tools/test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_shots');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const PORT = 9348;

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;

function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '   → ' + detail : '')); }
}

const child = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-proxy-server',
  '--proxy-bypass-list=*',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(OUT, 'cdp-test'),
  'about:blank'
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = list.find((t) => t.type === 'page');
      if (p && p.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch (e) { /* 等端口 */ }
    await sleep(250);
  }
  throw new Error('连不上调试端口');
}

(async function main() {
  const ws = new WebSocket(await target());
  let id = 0;
  const pending = new Map();

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
    }
  });

  const send = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  const js = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error('JS 出错：' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    }
    return r.result.value;
  };

  const text = (sel) => js('(document.querySelector(' + JSON.stringify(sel) + ')||{}).textContent||""');
  const store = (key) => js('JSON.parse(localStorage.getItem("xrz.v1.' + key + '")||"null")');

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true
    });

    /* 收集运行时报错 */
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(String(e.message))});' +
        'window.addEventListener("unhandledrejection",function(e){window.__errs.push("rej:"+e.reason)});'
    });

    async function go(hash) {
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(100);
      await send('Page.navigate', { url: BASE + '/index.html' + (hash || '#/') });
      await sleep(750);
    }

    /* ---------- 从零开始 ---------- */
    console.log('\n【首页与待办】');
    await go('#/');
    await js('Object.keys(localStorage).filter(function(k){return k.indexOf("xrz.")===0}).forEach(function(k){localStorage.removeItem(k)})');
    await js('location.reload()');
    await sleep(800);

    check('首页出现问候语', (await text('.hello-hi')).length > 0);
    check('空待办有引导文案', (await text('#hmTodos')).indexOf('今天没有待办') >= 0);

    /* 快捷添加 */
    await js('document.getElementById("hmQuickIn").value="买牛奶";' +
      'document.getElementById("hmQuick").dispatchEvent(new Event("submit",{cancelable:true}))');
    await sleep(300);
    let todos = await store('todo');
    check('首页快捷添加写入数据', !!todos && todos.length === 1 && todos[0].text === '买牛奶',
      JSON.stringify(todos));
    check('添加后列表显示出来', (await text('#hmTodos')).indexOf('买牛奶') >= 0);

    /* 勾选：这里最容易出重复绑定 bug（点一次变成勾了又取消） */
    await js('document.querySelector("#hmTodos [data-ck]").click()');
    await sleep(300);
    todos = await store('todo');
    check('点一次只勾一次（无重复绑定）', todos[0].done === true, 'done=' + todos[0].done);
    check('勾完从今天列表消失', (await text('#hmTodos')).indexOf('买牛奶') < 0);

    /* ---------- 工具宫格 ---------- */
    console.log('\n【工具宫格】');
    await go('#/tools');
    const tiles = await js('document.querySelectorAll(".tt").length');
    check('工具入口 8 个（7 个工具 + 做菜）', tiles === 8, '实际 ' + tiles);
    check('宫格显示实时摘要', (await text('.tt:nth-child(1) .tt-s')).indexOf('没做') >= 0 ||
      (await text('.tt:nth-child(1) .tt-s')).indexOf('做完') >= 0);

    /* ---------- 记账 ---------- */
    console.log('\n【记账】');
    await go('#/t/bill');
    check('空账本显示空状态', (await text('.blank')).indexOf('还没有账') >= 0);

    await js('document.getElementById("blAdd").click()');
    await sleep(400);
    check('记一笔弹层打开', await js('!!document.querySelector(".sheet-wrap")'));

    await js('document.getElementById("blAmt").value="88.8";' +
      'document.querySelector("[data-cat=\\"购物\\"]").click();' +
      'document.getElementById("blNote").value="测试";' +
      'document.querySelector(".sheet [data-ok]").click()');
    await sleep(400);

    const bills = await store('bill');
    check('账单写入数据', !!bills && bills.length === 1 && Math.abs(bills[0].amt - 88.8) < 0.001,
      JSON.stringify(bills));
    check('分类记录正确', bills[0].cat === '购物', bills[0].cat);
    check('弹层已关闭', !(await js('!!document.querySelector(".sheet-wrap")')));
    check('本月总额更新', (await text('.sum-n')).indexOf('88.8') >= 0, await text('.sum-n'));

    /* 切换月份 */
    await js('document.querySelector("[data-nav=\\"-1\\"]").click()');
    await sleep(250);
    check('上个月是空的', (await text('.blank')).indexOf('还没有账') >= 0);
    await js('document.querySelector("[data-nav=\\"1\\"]").click()');
    await sleep(250);

    /* 金额为 0 时不该存 */
    await js('document.getElementById("blAdd").click()');
    await sleep(300);
    await js('document.querySelector(".sheet [data-ok]").click()');
    await sleep(300);
    check('金额为空时拒绝保存', (await store('bill')).length === 1);
    await js('document.querySelector(".sheet [data-cancel]").click()');
    await sleep(300);

    /* ---------- 纪念日 ---------- */
    console.log('\n【纪念日】');
    await go('#/t/day');
    await js('document.getElementById("dyAdd").click()');
    await sleep(350);
    await js('document.getElementById("dyTitle").value="测试纪念日";' +
      'document.getElementById("dyDate").value="2020-05-20";' +
      'document.querySelector(".sheet [data-ok]").click()');
    await sleep(400);
    const days = await store('day');
    check('日子写入数据', !!days && days.length === 1 && days[0].title === '测试纪念日',
      JSON.stringify(days));
    check('已过的日子显示「已经走过」', (await text('#dyBody')).indexOf('已经走过') >= 0);

    /* ---------- 打卡 ---------- */
    console.log('\n【打卡】');
    await go('#/t/habit');
    await js('document.getElementById("hbAdd").click()');
    await sleep(350);
    await js('document.getElementById("hbName").value="喝够水";' +
      'document.querySelector(".sheet [data-ok]").click()');
    await sleep(400);
    check('习惯写入数据', (await store('habit')).length === 1);

    await js('document.querySelector("[data-check]").click()');
    await sleep(300);
    let habits = await store('habit');
    const todayKey = await js('App.D.today()');
    check('打卡记录到今天', !!habits[0].log[todayKey], JSON.stringify(habits[0].log));
    check('连续天数变 1 天', (await text('.hcard-s')).indexOf('连续 1 天') >= 0, await text('.hcard-s'));

    await js('document.querySelector("[data-check]").click()');
    await sleep(300);
    habits = await store('habit');
    check('再点一次可以取消打卡', !habits[0].log[todayKey]);

    /* ---------- 经期 ---------- */
    console.log('\n【经期】');
    await go('#/t/cycle');
    check('空状态提示', (await text('.blank')).indexOf('还没有记录') >= 0);
    await js('document.getElementById("cyAdd").click()');
    await sleep(350);
    await js('document.querySelector(".sheet [data-ok]").click()');
    await sleep(400);
    check('经期写入数据', (await store('cycle')).length === 1);
    check('显示周期第 1 天', (await text('.cy-foot')).indexOf('第 1 天') >= 0, await text('.cy-foot'));

    /* 同一天不能重复记 */
    await js('document.getElementById("cyAdd").click()');
    await sleep(300);
    await js('document.querySelector(".sheet [data-ok]").click()');
    await sleep(300);
    check('同一天不会重复记录', (await store('cycle')).length === 1);

    /* ---------- 日记 ---------- */
    console.log('\n【日记】');
    await go('#/t/diary');
    await js('document.querySelector("[data-mood=\\"4\\"]").click();' +
      'document.getElementById("dwText").value="今天测试一下";' +
      'document.getElementById("dwSave").click()');
    await sleep(400);
    const diaries = await store('diary');
    check('日记写入数据', !!diaries && diaries.length === 1 && diaries[0].mood === 4,
      JSON.stringify(diaries));
    check('日记出现在历史网格', (await js('document.querySelectorAll(".dcell").length')) === 1);

    /* ---------- 转盘 ---------- */
    console.log('\n【转盘】');
    await go('#/t/wheel');
    check('转盘有默认选项', (await text('.chipwrap')).indexOf('火锅') >= 0);
    await js('document.getElementById("whSpin").click()');
    await sleep(3700);
    const res = await text('#whResult');
    check('转出结果', res !== '…' && res.length > 0, res);
    check('结果来自选项列表', (await text('.chipwrap')).indexOf(res) >= 0);

    /* ---------- 设置 ---------- */
    console.log('\n【我】');
    await go('#/me');
    await js('var n=document.getElementById("meName");n.value="小美";' +
      'n.dispatchEvent(new Event("input"))');
    await sleep(200);
    check('名字已保存', (await js('JSON.parse(localStorage.getItem("xrz.v1.profile")).name')) === '小美');

    await go('#/');
    check('首页问候带上了名字', (await text('.hello-hi')).indexOf('小美') >= 0, await text('.hello-hi'));

    /* 导出数据完整性 */
    const exported = await js('JSON.stringify(Object.keys(App.Store.exportAll().data))');
    check('备份包含全部模块', ['todo', 'bill', 'day', 'habit', 'cycle', 'diary', 'profile']
      .every((k) => exported.indexOf(k) >= 0), exported);

    /* ---------- 弹层与路由 ---------- */
    console.log('\n【交互健壮性】');
    await go('#/t/bill');
    await js('document.getElementById("blAdd").click()');
    await sleep(300);
    await js('location.hash="#/"');
    await sleep(400);
    check('切页时弹层自动收掉', !(await js('!!document.querySelector(".sheet-wrap")')));
    check('切页后回到首页', (await js('location.hash')) === '#/');

    /* 横向溢出 */
    const overflow = await js('document.documentElement.scrollWidth > window.innerWidth');
    check('没有横向溢出', !overflow);

    /* 深色模式下也不溢出 */
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await go('#/');
    check('深色模式无横向溢出', !(await js('document.documentElement.scrollWidth > window.innerWidth')));

    /* 运行时报错 */
    const errs = await js('JSON.stringify(window.__errs||[])');
    check('全程无 JS 报错', errs === '[]', errs);

  } catch (e) {
    console.error('\n测试中断：' + e.message);
    fail++;
  } finally {
    console.log('\n──────────────');
    console.log(pass + ' 项通过，' + fail + ' 项失败');
    ws.close();
    child.kill();
    setTimeout(() => process.exit(fail ? 1 : 0), 300);
  }
})();
