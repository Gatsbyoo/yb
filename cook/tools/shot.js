/* 开发自检工具：用 CDP 精确控制移动视口并截图
   用法：
     1) 起静态服务器：python -m http.server 8765
     2) 截图：node tools/shot.js
     3) 需要验证图片是否被裁切：MARK=1 node tools/shot.js（会在视口最右/最下画标记线）
   产出在 _shots/，仅供开发检查，不参与构建 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_shots');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const PORT = 9344;

const W = +(process.env.W || 390);
const H = +(process.env.H || 844);
const DSF = +(process.env.DSF || 2);
const MARK = !!process.env.MARK;

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const DEMO_LIST = JSON.stringify([
  { key: '蔬菜|番茄', name: '番茄', amount: '2 个', extra: [], cat: '蔬菜', checked: false },
  { key: '蔬菜|西兰花', name: '西兰花', amount: '1 颗', extra: [], cat: '蔬菜', checked: true },
  { key: '蔬菜|小葱', name: '小葱', amount: '1 根', extra: [], cat: '蔬菜', checked: false },
  { key: '肉蛋|鸡蛋', name: '鸡蛋', amount: '3 个', extra: ['2 个'], cat: '肉蛋', checked: false },
  { key: '肉蛋|猪里脊', name: '猪里脊', amount: '200 g', extra: [], cat: '肉蛋', checked: false },
  { key: '主食|挂面', name: '挂面', amount: '2 人份', extra: [], cat: '主食', checked: false },
  { key: '其他|内酯豆腐', name: '内酯豆腐', amount: '1 盒', extra: [], cat: '其他', checked: true },
  { key: '调料|生抽', name: '生抽', amount: '1 勺', extra: [], cat: '调料', checked: false }
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
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
    } catch (e) { /* 等一会儿 */ }
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
    console.log('✓ ' + name + '.png  ' + buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20));
  }

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    // 开发时绕过 service worker，否则截到的是缓存里的旧代码
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: DSF, mobile: true
    });

    // 关闭动效，保证截图定格
    const KILL = "var s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);";

    async function nav(seed) {
      await send('Page.navigate', { url: BASE + '/cook/index.html' });
      await sleep(900);
      if (seed) {
        await js(seed);
        await send('Page.reload', {});
        await sleep(900);
      }
      await js(KILL);
      if (MARK) {
        await js("var d=document.createElement('div');d.style.cssText='position:fixed;top:0;right:0;width:1px;height:100%;background:#FF00FF;z-index:9999';document.body.appendChild(d);" +
          "var e=document.createElement('div');e.style.cssText='position:fixed;left:0;bottom:0;width:100%;height:1px;background:#00BFFF;z-index:9999';document.body.appendChild(e);");
      }
    }

    // 1 首页
    await nav(null);
    await shot('1-home');

    // 2 菜谱
    await js("document.querySelector('[data-view=\"recipes\"]').click()");
    await sleep(300);
    await shot('2-recipes');

    // 3 清单（带演示数据）
    await nav('localStorage.setItem("yb.list.v1",' + JSON.stringify(DEMO_LIST) + ');');
    await js("document.querySelector('[data-view=\"list\"]').click()");
    await sleep(300);
    await shot('3-list');
    const metrics = await js("JSON.stringify({w:innerWidth,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})");
    console.log('  视口/文档：' + metrics);

    // 3b 清单滚到底（检查常驻按钮是否被标签栏压住）
    await js("window.scrollTo(0, document.documentElement.scrollHeight)");
    await sleep(350);
    await shot('3b-list-bottom');
    await js("window.scrollTo(0, 0)");

    // 4 菜谱详情抽屉
    await nav(null);
    await js("document.querySelector('[data-view=\"recipes\"]').click()");
    await sleep(200);
    await js("document.querySelector('.ritem').click()");
    await sleep(400);
    await shot('4-sheet');

    // 5 添加菜谱
    await nav(null);
    await js("document.querySelector('[data-view=\"recipes\"]').click()");
    await sleep(200);
    await js("document.getElementById('btnAdd').click()");
    await sleep(400);
    await shot('5-add');

    // 6 空格单空状态
    await nav('localStorage.removeItem("yb.list.v1");');
    await js("document.querySelector('[data-view=\"list\"]').click()");
    await sleep(300);
    await shot('6-list-empty');

  } catch (e) {
    console.error('失败：' + e.message);
  } finally {
    ws.close();
    child.kill();
    setTimeout(() => process.exit(0), 300);
  }
})();
