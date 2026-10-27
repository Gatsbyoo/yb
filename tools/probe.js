/* 布局探针：直接量真实尺寸，不靠肉眼判断
   用法：node tools/probe.js "http://127.0.0.1:8765/index.html#/t/todo" ".pad,#tdBody,.blank" */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const OUT = path.join(__dirname, '..', '_shots');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9353;
const URL_TARGET = process.argv[2] || 'http://127.0.0.1:8765/index.html#/';
const SELS = (process.argv[3] || '.view,.toolbody,.pad,.blank').split(',');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-proxy-server', '--proxy-bypass-list=*',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'cdp-probe'), 'about:blank'], { stdio: 'ignore' });

(async function () {
  let wsUrl;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = list.find((t) => t.type === 'page');
      if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
    } catch (e) { /* 等端口 */ }
    await sleep(250);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  });
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'ERR: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_TARGET });
  await sleep(900);

  const expr = 'JSON.stringify(' + JSON.stringify(SELS) + '.map(function(s){' +
    'var e=document.querySelector(s);if(!e)return {sel:s,missing:true};' +
    'var r=e.getBoundingClientRect();var c=getComputedStyle(e);' +
    'return {sel:s,top:Math.round(r.top),h:Math.round(r.height),w:Math.round(r.width),' +
    'display:c.display,flex:c.flex,dir:c.flexDirection,justify:c.justifyContent};}))';

  const out = await js(expr);
  try {
    JSON.parse(out).forEach((x) => console.log(JSON.stringify(x)));
  } catch (e) {
    console.log(out);
  }

  const doc = await js('JSON.stringify({vw:innerWidth,vh:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})');
  console.log('文档: ' + doc);
  const errs = await js('JSON.stringify(window.__errs||[])');
  console.log('错误: ' + errs);

  ws.close(); child.kill();
  setTimeout(() => process.exit(0), 300);
})();
