/* 开发自检：用 CDP 精确控制移动视口，把每屏都截下来看
   用法：
     1) python -m http.server 8765
     2) node tools/shot.js
     3) MARK=1 node tools/shot.js   → 在视口右边/下边画标记线，验证图片没被裁
   产出在 _shots/，不进构建 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_shots');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const PORT = 9347;

const W = +(process.env.W || 390);
const H = +(process.env.H || 844);
const DSF = +(process.env.DSF || 2);
const MARK = !!process.env.MARK;

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

/* ---------- 造一份像真实用了一个月的假数据 ---------- */

const NOW = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const add = (n) => { const d = new Date(NOW); d.setDate(d.getDate() + n); return ymd(d); };
const thisMonth = ymd(NOW).slice(0, 7);

const PHOTO = 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#CBDCEA"/><stop offset="1" stop-color="#EBD8C3"/></linearGradient></defs>' +
  '<rect width="320" height="220" fill="url(#g)"/>' +
  '<circle cx="240" cy="66" r="30" fill="#FBF0C9"/>' +
  '<path d="M0 176l74-56 58 44 62-50 126 74v32H0z" fill="#93A9B8" opacity=".8"/></svg>'
);

const SEED = {
  'xrz.v1.profile': JSON.stringify({ name: '宝宝' }),

  'xrz.v1.todo': JSON.stringify([
    { id: 't1', text: '把冬天的被子拿出来晒一下', done: false, created: add(0) },
    { id: 't2', text: '给猫买化毛膏', done: false, created: add(0) },
    { id: 't3', text: '预约下周三的牙医', done: false, created: add(-1) },
    { id: 't4', text: '取快递（丰巢 3 号柜）', done: true, created: add(-1), doneAt: add(0) }
  ]),

  'xrz.v1.bill': JSON.stringify([
    { id: 'b1', type: 'out', amt: 38.5, cat: '餐饮', note: '楼下小馆', date: add(0), ts: 5 },
    { id: 'b2', type: 'out', amt: 12, cat: '交通', note: '打车', date: add(0), ts: 4 },
    { id: 'b3', type: 'out', amt: 156.8, cat: '买菜', note: '盒马', date: add(-1), ts: 3 },
    { id: 'b4', type: 'out', amt: 299, cat: '购物', note: '那双鞋', date: add(-2), ts: 2 },
    { id: 'b5', type: 'out', amt: 45, cat: '日用', note: '洗衣液', date: add(-3), ts: 1 },
    { id: 'b6', type: 'in', amt: 1200, cat: '红包', note: '妈妈给的', date: thisMonth + '-05', ts: 0 }
  ]),

  'xrz.v1.day': JSON.stringify([
    { id: 'd1', title: '在一起', date: '2023-08-14', yearly: false },
    { id: 'd2', title: '生日', date: '1998-03-08', yearly: true },
    { id: 'd3', title: '去大理', date: add(23), yearly: false },
    { id: 'd4', title: '结婚纪念日', date: '2025-05-20', yearly: true }
  ]),

  'xrz.v1.diary': JSON.stringify([
    { date: add(0), mood: 4, text: '下班路上看到桂花开了，很香。买了两斤橘子回家。', photo: '', ts: 3 },
    { date: add(-1), mood: 3, text: '今天有点累，但把拖了很久的报销交了。', photo: PHOTO, ts: 2 },
    { date: add(-3), mood: 5, text: '去看了海，风很大，头发全乱了，但是很开心。', photo: '', ts: 1 }
  ]),

  'xrz.v1.habit': JSON.stringify([
    {
      id: 'h1', name: '喝够 8 杯水', created: add(-30), log: (function () {
        const o = {};
        [0, -1, -2, -3, -5, -6, -7, -9, -10, -12, -13, -14].forEach((n) => { o[add(n)] = true; });
        return o;
      })()
    },
    {
      id: 'h2', name: '十一点前睡', created: add(-20), log: (function () {
        const o = {};
        [0, -2, -3, -8, -9, -15].forEach((n) => { o[add(n)] = true; });
        return o;
      })()
    }
  ]),

  'xrz.v1.cycle': JSON.stringify([
    { id: 'c1', start: add(-92) },
    { id: 'c2', start: add(-64) },
    { id: 'c3', start: add(-36) },
    { id: 'c4', start: add(-7) }
  ]),

  'xrz.v1.wheel': JSON.stringify({ options: ['火锅', '烤肉', '面条', '炒菜', '外卖', '煮个汤'] })
};

const SEED_JS = 'try{' + Object.keys(SEED).map(function (k) {
  return 'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(SEED[k]) + ');';
}).join('') + '}catch(e){}';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  /* 这台机器开着系统代理，必须让浏览器直连本地，否则截图截到的是代理错误页 */
  '--no-proxy-server',
  '--proxy-bypass-list=*',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(OUT, 'cdp-profile'),
  'about:blank'
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = list.find((t) => t.type === 'page');
      if (p && p.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch (e) { /* 等端口起来 */ }
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
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('JS 出错: ' + JSON.stringify(r.exceptionDetails.text));
    return r.result.value;
  };

  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buf = Buffer.from(r.data, 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    const m = await js('JSON.stringify({w:innerWidth,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})');
    console.log('✓ ' + name + '.png  ' + buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20) + '  ' + m);
  }

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: DSF, mobile: true
    });

    const KILL = "var s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);";

    async function go(hash) {
      /* 只改 hash 不会重新加载页面，会带着上一屏的弹层，所以先清空再进 */
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(120);
      await send('Page.navigate', { url: BASE + '/index.html' + (hash || '#/') });
      await sleep(900);
      await js(KILL);
      if (MARK) {
        await js("var d=document.createElement('div');d.style.cssText='position:fixed;top:0;right:0;width:1px;height:100%;background:#FF00FF;z-index:9999';document.body.appendChild(d);" +
          "var e=document.createElement('div');e.style.cssText='position:fixed;left:0;bottom:0;width:100%;height:1px;background:#00BFFF;z-index:9999';document.body.appendChild(e);");
      }
    }

    /* 先灌数据，再逐屏看 */
    await send('Page.navigate', { url: BASE + '/index.html' });
    await sleep(700);
    await js(SEED_JS);

    const pages = [
      ['1-home', '#/'],
      ['2-tools', '#/tools'],
      ['3-todo', '#/t/todo'],
      ['4-bill', '#/t/bill'],
      ['5-day', '#/t/day'],
      ['6-habit', '#/t/habit'],
      ['7-cycle', '#/t/cycle'],
      ['8-diary', '#/t/diary'],
      ['9-wheel', '#/t/wheel'],
      ['10-me', '#/me']
    ];

    for (const [name, hash] of pages) {
      await go(hash);
      await shot(name);
    }

    /* 记账表单抽屉 */
    await go('#/t/bill');
    await js("document.getElementById('blAdd').click()");
    await sleep(500);
    await shot('11-sheet-bill');

    /* 空状态：清掉待办和打卡 */
    await js("localStorage.removeItem('xrz.v1.todo');localStorage.removeItem('xrz.v1.habit');");
    await go('#/t/todo');
    await shot('12-todo-empty');

    /* 窄屏 */
    await send('Emulation.setDeviceMetricsOverride', {
      width: 360, height: 780, deviceScaleFactor: DSF, mobile: true
    });
    await go('#/');
    await shot('13-home-360');

    /* 深色：把数据补回去，否则首页是空的 */
    await js(SEED_JS);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: DSF, mobile: true
    });
    await go('#/');
    await shot('14-home-dark');
    await go('#/t/bill');
    await shot('15-bill-dark');
    await go('#/t/diary');
    await shot('16-diary-dark');

    const errs = await js("JSON.stringify(window.__errs||[])");
    console.log('页面错误：' + errs);

  } catch (e) {
    console.error('失败：' + e.message);
  } finally {
    ws.close();
    child.kill();
    setTimeout(() => process.exit(0), 300);
  }
})();
