import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/?paused=1');
  await expect(page.locator('#status-note')).toContainText('资源就绪');
});

test('all examples render real geometry with no page or WebGL errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('docs/screenshots', { recursive: true });
  for (const id of ['clear', 'ex02', 'matrix', 'ex01', 'ex03', 'ex04', 'ex05', 'ex06', 'color']) {
    await page.locator(`[data-demo="${id}"]`).click();
    await expect(page.locator('#stage')).toHaveAttribute('data-demo', id);
    const snapshot = await page.evaluate(() => {
      const { renderer, game } = window.ejoy2d;
      game.paused = true;
      window.ejoy2d.render();
      const gl = renderer.gl;
      const pixels = new Uint8Array(renderer.canvas.width * renderer.canvas.height * 4);
      gl.readPixels(0, 0, renderer.canvas.width, renderer.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let changed = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] !== 128 || pixels[i + 1] !== 128 || pixels[i + 2] !== 128) changed++;
      return { ...renderer.stats, changed, error: gl.getError() };
    });
    expect(snapshot.error).toBe(0);
    if (id === 'clear') expect(snapshot.changed).toBe(0);
    else { expect(snapshot.quads).toBeGreaterThan(0); expect(snapshot.changed).toBeGreaterThan(100); }
    if (id === 'ex02' || id === 'ex06' || id === 'color') expect(snapshot.drawCalls).toBe(1);
    if (['clear', 'ex01', 'ex02', 'matrix', 'ex03', 'ex04', 'ex05', 'ex06'].includes(id)) {
      await page.locator('#stage').screenshot({ path: `docs/screenshots/${id}.png` });
    }
  }
  expect(errors).toEqual([]);
  await page.locator('[data-demo="ex01"]').click();
  await page.screenshot({ path: 'docs/screenshots/lab-desktop.png', fullPage: true });
});

test('pause, single-step and seeking preserve the independently controlled resource frame', async ({ page }) => {
  await page.locator('#step').click();
  expect(await page.evaluate(() => window.ejoy2d.scene.turret!.frame)).toBe(3);
  await expect(page.locator('#resource-frame')).toHaveText('70');
  await page.locator('#frame').fill('70');
  expect(await page.evaluate(() => window.ejoy2d.scene.turret!.frame)).toBe(70);
  await expect(page.locator('#resource-frame')).toHaveText('70');
  await expect(page.locator('#pause')).toHaveText('播放');
  await page.locator('#pause').click();
  await expect.poll(() => page.evaluate(() => window.ejoy2d.scene.turret!.frame)).toBeGreaterThan(70);
  await page.locator('#pause').click();
});

test('pointer coordinates capture panel through non-message pictures and update label text', async ({ page }) => {
  await page.locator('[data-demo="ex04"]').click();
  const box = await page.locator('#stage').boundingBox();
  if (!box) throw new Error('Missing canvas box');
  const click = (x: number, y: number) => page.mouse.click(box.x + x * box.width / 1024, box.y + y * box.height / 768);
  await click(490, 360);
  await expect(page.locator('#hit')).toHaveText('Set scissor');
  await expect(page.locator('#clip')).toHaveText('ON');
  await click(490, 360);
  await expect(page.locator('#hit')).toHaveText('Clear scissor');
  await click(480, 440);
  await expect(page.locator('#hit')).toHaveText('label touched');
  await click(40, 40);
  await expect(page.locator('#hit')).toHaveText('Not Hit');
});

test('anchor matrix and mounted label produce the same pixels across an animated transform', async ({ page }) => {
  await page.locator('[data-demo="ex05"]').click();
  await page.locator('#frame').fill('32');
  await page.locator('#rotation').fill('25');
  const compare = await page.evaluate(() => {
    const lab = window.ejoy2d;
    const capture = () => {
      lab.render();
      const { gl, canvas } = lab.renderer;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    lab.options.mounted = false; const separate = capture();
    lab.options.mounted = true; const mounted = capture();
    let differences = 0;
    for (let i = 0; i < separate.length; i++) if (separate[i] !== mounted[i]) differences++;
    return { differences, parent: lab.scene.label!.parent?.name };
  });
  expect(compare.differences).toBe(0);
  expect(compare.parent).toBe('turret');
});

test('GPU verifies alpha, nested scissor, empty intersections and the 1024-quad boundary', async ({ page }) => {
  const result = await page.evaluate(() => {
    const r = window.ejoy2d.renderer, gl = r.gl;
    const read = (x: number, y: number) => {
      const rgba = new Uint8Array(4);
      gl.readPixels(Math.floor(x * r.canvas.width / 1024), r.canvas.height - 1 - Math.floor(y * r.canvas.height / 768), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return Array.from(rgba).slice(0, 3);
    };
    r.begin(0xff000000);
    r.fillRect([0, 0, 100, 100], 0x80ffffff);
    r.fillRect([100, 0, 200, 100], 0x00ffffff);
    r.end();
    const alpha = read(50, 50), transparent = read(150, 50);
    r.begin(0xff000000);
    r.pushClip([0, 0, 100, 100]);
    r.fillRect([0, 0, 200, 200], 0xffff0000);
    r.pushClip([50, 50, 150, 150]);
    r.fillRect([0, 0, 200, 200], 0xff00ff00);
    r.popClip();
    r.pushClip([200, 200, 250, 250]);
    r.fillRect([0, 0, 300, 300], 0xffffffff);
    r.popClip(); r.popClip();
    r.fillRect([200, 0, 250, 50], 0xff0000ff);
    r.end();
    const clips = [read(25, 25), read(75, 75), read(125, 125), read(225, 25)];
    r.begin(0xff000000);
    for (let i = 0; i < 1025; i++) r.fillRect([0, 0, 10, 10], 0xffffffff);
    r.end();
    return { alpha, transparent, clips, calls: r.stats.drawCalls, quads: r.stats.quads, error: gl.getError() };
  });
  expect(result.alpha).toEqual([128, 128, 128]);
  expect(result.transparent).toEqual([0, 0, 0]);
  expect(result.clips).toEqual([[255, 0, 0], [0, 255, 0], [0, 0, 0], [0, 0, 255]]);
  expect(result.calls).toBe(2); expect(result.quads).toBe(1025); expect(result.error).toBe(0);
});

test('mobile layout keeps the canvas and controls inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#stage')).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  await page.screenshot({ path: 'docs/screenshots/lab-mobile.png', fullPage: true });
});

test('texture, program and blend transitions flush queued geometry before changing GPU state', async ({ page }) => {
  const result = await page.evaluate(() => {
    const r = window.ejoy2d.renderer, gl = r.gl;
    const white = r.createTexture({ width: 1, height: 1, pixels: new Uint8Array([255, 255, 255, 255]) });
    const red = r.createTexture({ width: 1, height: 1, pixels: new Uint8Array([255, 0, 0, 255]) });
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const positions = (x: number): [number, number][] => [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100]];
    r.begin(0xff000000);
    r.drawQuad(white, positions(0), uv, 0xffffffff);
    r.drawQuad(red, positions(100), uv, 0xffffffff);
    r.drawQuad(red, positions(200), uv, 0xffffffff, 0, 'gray');
    r.blend(gl.ONE, gl.ONE);
    r.drawQuad(white, positions(300), uv, 0x80ffffff);
    r.drawQuad(white, positions(300), uv, 0x80ffffff);
    r.blend(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    r.drawQuad(white, positions(400), uv, 0x00ffffff, 0x00402000);
    r.end();
    const colors = [50, 150, 250, 350, 450].map(x => {
      const p = new Uint8Array(4);
      gl.readPixels(Math.floor(x * r.canvas.width / 1024), r.canvas.height - 1 - Math.floor(50 * r.canvas.height / 768), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return Array.from(p).slice(0, 3);
    });
    return { colors, calls: r.stats.drawCalls, error: gl.getError() };
  });
  expect(result.colors).toEqual([[255, 255, 255], [255, 0, 0], [76, 76, 76], [255, 255, 255], [64, 32, 0]]);
  expect(result.calls).toBe(5); expect(result.error).toBe(0);
});
