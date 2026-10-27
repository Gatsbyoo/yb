/* 开发自检工具：通过 CDP 读取真实布局数据，找出横向溢出、元素越界与 JS 报错
   用法：先起静态服务器，再 node tools/probe.js [url] */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const URL_TARGET = process.argv[2] || 'http://127.0.0.1:8765/cook/index.html';

const PROFILE = path.join(ROOT, '_shots', 'probe-profile');
if (!fs.existsSync(PROFILE)) fs.mkdirSync(PROFILE, { recursive: true });

const child = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=390,900',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('连不上调试端口');
}

const EXPR = `(() => {
  const vw = window.innerWidth;
  const out = {
    viewport: { w: vw, h: window.innerHeight, dpr: window.devicePixelRatio },
    doc: {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight
    },
    overflow: [],
    rects: {}
  };
  const byText = (sel) => Array.from(document.querySelectorAll(sel));

  // 找出所有右边界超出视口的元素
  byText('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > vw + 1.5) {
      out.overflow.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 46),
        text: (el.textContent || '').trim().slice(0, 22),
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
        w: +r.width.toFixed(1)
      });
    }
  });

  const pick = [
    '.hd', '.title', '#chipsHome', '#pick', '#pickEmoji', '#pickName',
    '#pickMeta', '#pickTip', '.actions', '#btnRoll', '#btnGo',
    '.hintline', '.footnote', '.tabbar', '.tab', '.lhead', '.grp', '.li'
  ];
  pick.forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    out.rects[sel] = {
      l: +r.left.toFixed(1), r: +r.right.toFixed(1),
      w: +r.width.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1)
    };
  });

  // 文字是否被挤断（行数异常）
  const tip = document.querySelector('#pickTip');
  if (tip) {
    out.tipInfo = {
      scrollW: tip.scrollWidth, clientW: tip.clientWidth,
      lines: Math.round(tip.getBoundingClientRect().height / parseFloat(getComputedStyle(tip).lineHeight || 20))
    };
  }
  return out;
})()`;

(async function main() {
  const logs = [];
  try {
    const wsUrl = await getTarget();
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();

    const send = (method, params) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });

    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Log.entryAdded') {
        logs.push('[' + msg.params.entry.level + '] ' + msg.params.entry.text);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        logs.push('[exception] ' + (msg.params.exceptionDetails.exception || {}).description);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        logs.push('[console.error] ' + msg.params.args.map((a) => a.value || a.description).join(' '));
      }
    });

    await send('Page.enable');
    await send('Log.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 900, deviceScaleFactor: 2, mobile: true
    });
    await send('Page.navigate', { url: URL_TARGET });
    await sleep(2000);

    const res = await send('Runtime.evaluate', {
      expression: EXPR, returnByValue: true, awaitPromise: false
    });

    console.log(JSON.stringify(res.result.value, null, 2));
    console.log('\n--- 日志 ---');
    console.log(logs.length ? logs.join('\n') : '（无报错）');

    ws.close();
  } catch (e) {
    console.error('探针失败：' + e.message);
  } finally {
    child.kill();
    process.exit(0);
  }
})();
