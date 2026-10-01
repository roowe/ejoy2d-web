// Browser demo entry; original examples live in src/examples/scenes.ts.
import './style.css';
import { Renderer } from './core/Renderer';
import { loadPackage } from './sprite/PackageLoader';
import { Game } from './app/Game';
import { Input } from './app/Input';
import { demos, Scene, type DemoId, type SceneOptions } from './examples/scenes';

function element<T extends HTMLElement>(id: string, type: { new(): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing application element: ${id}`);
  return node;
}

const app = element('app', HTMLDivElement);
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./"><span class="brand-mark">e.</span><span>ejoy2d<span class="brand-web"> / web</span></span></a>
    <span class="top-caption">一个小型 2D 引擎，逐层拆开看。</span>
    <span class="engine-badge"><i></i> WEBGL2 LAB <span>0.1</span></span>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div class="section-label">EXPERIMENTS <span>09</span></div>
      <nav aria-label="示例选择">${demos.map(d => `<button class="demo-link" data-demo="${d.id}"><span class="demo-tag">${d.tag}</span><span>${d.title}</span><span class="demo-arrow">↗</span></button>`).join('')}</nav>
      <div class="sidebar-note"><div class="small-orbit">↳</div><strong>从像素到场景</strong><p>裸 WebGL2 · TypeScript<br>对照 cloudwu/ejoy2d 学习</p><span class="tiny-label">M0 — M7 / MVP</span></div>
    </aside>
    <main>
      <div class="scene-heading"><div><div class="eyebrow" id="milestone">LOADING</div><h1 id="scene-title">载入实验室</h1></div><span class="scene-number" id="scene-number">01</span></div>
      <p id="description" class="description">正在读取资源包与贴图…</p>
      <section class="stage-card" aria-label="渲染预览">
        <div class="stage-toolbar"><span><i class="live-dot"></i><span id="play-state">运行中</span></span><span class="resolution">1024 × 768 <span>逻辑像素</span></span><button id="reset" title="重置当前示例">↺ 重置</button></div>
        <div class="canvas-wrap"><canvas id="stage" width="1024" height="768" aria-label="ejoy2d WebGL2 场景"></canvas><div class="canvas-coordinate" id="pointer">x — &nbsp; y —</div><div id="loading">载入 sample 资源…</div></div>
        <div class="transport"><button id="pause" class="play-button">暂停</button><button id="step" title="推进一个逻辑帧">单步 +1</button><label for="frame">FRAME <output id="frame-value">000</output></label><input id="frame" type="range" min="0" max="359" value="0" aria-label="动画帧" /></div>
        <div class="metrics"><div><span>RENDER</span><strong id="fps">—<small> fps</small></strong></div><div><span>LOGIC</span><strong>30<small> Hz</small></strong></div><div><span>DRAW CALLS</span><strong id="drawcalls">0</strong></div><div><span>QUADS</span><strong id="quads">0</strong></div></div>
      </section>
      <section class="source-card"><span class="source-icon">{ }</span><div><span class="section-label">SOURCE REFERENCE</span><p id="source">—</p></div><span class="source-note">原版语义 · 浏览器实现</span></section>
      <div id="error" role="alert" hidden></div>
    </main>
    <aside class="inspector" aria-label="场景参数">
      <div class="section-label">INSPECTOR <span>调试面板</span></div>
      <section class="control-group"><h2>场景变换</h2>
        <label for="zoom">缩放 <output id="zoom-value">1.20×</output></label><input id="zoom" type="range" min="0.3" max="4" step="0.05" value="1.2" />
        <label for="rotation">旋转 <output id="rotation-value">0°</output></label><input id="rotation" type="range" min="-180" max="180" step="1" value="0" />
        <label for="alpha">透明度 <output id="alpha-value">100%</output></label><input id="alpha" type="range" min="0" max="1" step="0.01" value="1" />
        <label class="check-row"><input id="bounds" type="checkbox" /><span>显示 AABB</span><span class="key-tag">BOX</span></label>
      </section>
      <section class="control-group"><h2>颜色与文字</h2><label for="additive">加色 <span class="muted">additive</span></label><select id="additive"><option value="0">无加色</option><option value="4205568">暖黄 +</option><option value="16448">青色 +</option><option value="4194368">洋红 +</option></select>
        <label for="text">文本内容</label><textarea id="text" rows="3" maxlength="300">Hello World</textarea><p class="control-hint">用于位图文本与挂点示例，支持换行。</p>
        <label class="check-row"><input id="mounted" type="checkbox" /><span>直接挂载文字</span></label><p class="control-hint">ex05：比较 mount 与 worldMatrix。</p>
      </section>
      <section class="control-group runtime"><h2>运行时状态</h2><dl><dt>命中对象</dt><dd id="hit">Ready</dd><dt>裁剪</dt><dd id="clip">OFF</dd><dt>resource 帧</dt><dd id="resource-frame">—</dd><dt>资源对象</dt><dd id="object-count">—</dd></dl><div class="status-note" id="status-note">正在初始化 WebGL2</div></section>
    </aside>
  </div>
  <footer><span>LEARN THE ENGINE. FOLLOW THE DATA.</span><span>资源包 → sprite 树 → 四边形合批</span></footer>`;

const canvas = element('stage', HTMLCanvasElement);
const pause = element('pause', HTMLButtonElement);
const seek = element('frame', HTMLInputElement);
const options: SceneOptions = { zoom: 1.2, rotation: 0, alpha: 1, additive: 0, bounds: false, mounted: false, text: 'Hello World' };

async function start() {
  const renderer = new Renderer(canvas);
  const pack = await loadPackage(renderer, 'sample');
  let scene = new Scene('ex01', pack);
  const render = () => {
    scene.draw(renderer, options);
    element('fps', HTMLElement).innerHTML = `${Math.round(game.fps)}<small> fps</small>`;
    element('drawcalls', HTMLElement).textContent = String(renderer.stats.drawCalls);
    element('quads', HTMLElement).textContent = String(renderer.stats.quads);
    const frame = scene.turret?.frame ?? scene.frame;
    element('frame-value', HTMLOutputElement).value = String(frame).padStart(3, '0');
    seek.value = String(((frame % 360) + 360) % 360);
    element('hit', HTMLElement).textContent = scene.status;
    element('clip', HTMLElement).textContent = scene.mine?.fetch('panel').scissor ? 'ON' : 'OFF';
    element('resource-frame', HTMLElement).textContent = scene.mine ? String(scene.mine.fetch('resource').frame) : '—';
    element('play-state', HTMLElement).textContent = game.paused ? '已暂停' : '运行中';
    pause.textContent = game.paused ? '播放' : '暂停';
    canvas.dataset.demo = scene.id;
  };
  const game = new Game({ update: () => scene.update(), drawFrame: render });
  const input = new Input(canvas, renderer.screen, (phase, x, y) => {
    element('pointer', HTMLElement).textContent = `x ${Math.round(x)}   y ${Math.round(y)}`;
    scene.touch(phase, x, y, options);
  });
  function select(id: DemoId) {
    scene = new Scene(id, pack);
    const demo = demos.find(d => d.id === id)!;
    element('scene-title', HTMLElement).textContent = demo.title;
    element('scene-number', HTMLElement).textContent = demo.tag;
    element('description', HTMLElement).textContent = demo.description;
    element('milestone', HTMLElement).textContent = `${demo.milestone} / ${demo.id.toUpperCase()}`;
    element('source', HTMLElement).textContent = demo.source;
    options.zoom = id === 'ex02' ? 1 : 1.2;
    options.rotation = 0; options.alpha = 1; options.additive = 0; options.mounted = false;
    options.text = id === 'ex05' ? 'Hello' : 'Hello World';
    element('zoom', HTMLInputElement).value = String(options.zoom);
    element('rotation', HTMLInputElement).value = '0';
    element('alpha', HTMLInputElement).value = '1';
    element('additive', HTMLSelectElement).value = '0';
    element('mounted', HTMLInputElement).checked = false;
    element('mounted', HTMLInputElement).disabled = id !== 'ex05';
    element('text', HTMLTextAreaElement).value = options.text;
    element('text', HTMLTextAreaElement).disabled = id !== 'ex03' && id !== 'ex05';
    element('zoom-value', HTMLOutputElement).value = `${options.zoom.toFixed(2)}×`;
    element('rotation-value', HTMLOutputElement).value = '0°';
    element('alpha-value', HTMLOutputElement).value = '100%';
    document.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach(button => {
      const active = button.dataset.demo === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const url = new URL(location.href); url.searchParams.set('demo', id); history.replaceState(null, '', url);
    render();
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-demo]')) {
    button.addEventListener('click', () => select(button.dataset.demo as DemoId));
  }
  pause.addEventListener('click', () => { game.paused = !game.paused; render(); });
  element('step', HTMLButtonElement).addEventListener('click', () => game.step());
  element('reset', HTMLButtonElement).addEventListener('click', () => select(scene.id));
  seek.addEventListener('input', () => { game.paused = true; scene.seek(Number(seek.value)); render(); });
  for (const name of ['zoom', 'rotation', 'alpha'] as const) {
    element(name, HTMLInputElement).addEventListener('input', event => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      options[name] = value;
      const suffix = name === 'zoom' ? `${value.toFixed(2)}×` : name === 'rotation' ? `${value}°` : `${Math.round(value * 100)}%`;
      element(`${name}-value`, HTMLOutputElement).value = suffix;
    });
  }
  element('additive', HTMLSelectElement).addEventListener('change', event => { options.additive = Number((event.currentTarget as HTMLSelectElement).value); });
  element('text', HTMLTextAreaElement).addEventListener('input', event => { options.text = (event.currentTarget as HTMLTextAreaElement).value; });
  for (const name of ['bounds', 'mounted'] as const) {
    element(name, HTMLInputElement).addEventListener('change', event => { options[name] = (event.currentTarget as HTMLInputElement).checked; });
  }
  element('object-count', HTMLElement).textContent = `${pack.size} / sample`;
  element('status-note', HTMLElement).textContent = 'WebGL2 已连接 · 资源就绪';
  element('loading', HTMLElement).hidden = true;
  const requested = new URLSearchParams(location.search).get('demo');
  game.paused = new URLSearchParams(location.search).has('paused');
  select(demos.find(d => d.id === requested)?.id ?? 'ex01');
  // Deliberate learning API: inspect the real scene, not a separate test model.
  window.ejoy2d = { renderer, game, options, get scene() { return scene; }, select, render };
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); game.stop(); showError('WebGL2 上下文已丢失，请刷新页面重新创建场景。');
  });
  window.addEventListener('pagehide', () => { game.stop(); input.dispose(); renderer.dispose(); }, { once: true });
  game.start();
}

function showError(error: unknown) {
  const panel = element('error', HTMLElement);
  panel.hidden = false;
  panel.textContent = error instanceof Error ? error.message : String(error);
  element('loading', HTMLElement).hidden = true;
  element('status-note', HTMLElement).textContent = '初始化失败';
}
void start().catch(showError);

declare global {
  interface Window {
    ejoy2d: { renderer: Renderer; game: Game; options: SceneOptions; readonly scene: Scene; select(id: DemoId): void; render(): void };
  }
}
