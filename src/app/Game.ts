// 移植 lib/ejoy2dgame.c 的 ejoy2d_game_update 和 ejoy2d_game_drawframe。
//
// 原版用 real_time、logic_time 追帧。LOGIC_FRAME 默认 30，每次逻辑帧给 logic_time 加 1/30。
// logic_time 为 0 的第一次 update 忽略传入时间，把 real_time 设成 1/LOGIC_FRAME，因此必跑一帧。
// 之后 real_time += time，while (logic_time < real_time) 调用 EJOY2D_UPDATE。
// 窗口框架每帧先 update 再 drawframe。ejoy2d_game_start 只取出 Lua 回调，不是这个循环。
//
// 这里把差值收进 FixedClock。首个 requestAnimationFrame 的间隔是 0，逻辑从下一帧才开始。
// 原版不截断 time，长时间挂起会在一次 update 里补完全部缺帧。
// 浏览器把单次间隔夹到 0.25 秒；暂停或标签页隐藏时清掉累加器，不再补帧。
// Lua、触摸、手势、消息，以及 EJOY2D_PAUSE / EJOY2D_RESUME 不在这里。
// 暂停只停逻辑，绘制仍跟显示器。fps、ticks 和 step 是实验室用的。
export interface GameCallbacks {
  // EJOY2D_UPDATE 与 EJOY2D_DRAWFRAME。drawFrame 每渲染帧一次，update 只在逻辑步上。
  update(): void;
  drawFrame(): void;
}

// step 对应 1/LOGIC_FRAME。advance 返回这一拍补了几次逻辑帧。
export class FixedClock {
  private accumulated = 0;
  constructor(readonly step = 1 / 30) {}
  // 负间隔当成 0。超过 0.25 秒的部分丢掉，挂起后再回来大约只补七八帧。
  // 1e-10 让浮点残差不会卡在 step 下方少跑一帧，也不会反过来多跑一帧。
  advance(dt: number, update: () => void) {
    this.accumulated += Math.min(Math.max(dt, 0), 0.25);
    let count = 0;
    while (this.accumulated + 1e-10 >= this.step) {
      update();
      this.accumulated -= this.step;
      count++;
    }
    return count;
  }
  // 暂停和重新可见时丢掉还没消费的间隔。
  reset() {
    this.accumulated = 0;
  }
}

export class Game {
  private readonly clock = new FixedClock();
  private request = 0;
  private lastTime: number | null = null;
  private running = false;
  private isPaused = false;
  fps = 0;
  ticks = 0;
  constructor(private readonly callbacks: GameCallbacks) {}
  get paused() {
    return this.isPaused;
  }
  // 原版 ejoy2d_game_pause 调用 Lua 的 EJOY2D_PAUSE。这里只冻结逻辑时钟。
  set paused(value: boolean) {
    this.isPaused = value;
    this.clock.reset();
  }
  start() {
    if (this.running) return;
    this.running = true;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.request = requestAnimationFrame(this.tick);
  }
  // 切走再回来的那段间隔不能拿去追帧。lastTime 清空后，下一拍 dt 为 0。
  private readonly onVisibility = () => {
    this.lastTime = null;
    this.clock.reset();
  };
  // 每帧都 drawFrame。shader_flush 在 Renderer.end，不在这里。
  // 暂停或 document.hidden 时跳过 update。fps 平滑的是渲染间隔，不是 30 Hz 逻辑帧。
  private readonly tick = (time: number) => {
    if (!this.running) return;
    const dt = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (dt > 0) this.fps = this.fps ? this.fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;
    if (!this.paused && !document.hidden)
      this.clock.advance(dt, () => {
        this.callbacks.update();
        this.ticks++;
      });
    this.callbacks.drawFrame();
    this.request = requestAnimationFrame(this.tick);
  };
  // 实验室单步：先暂停，再跑一帧逻辑并画出来。原版没有这个入口。
  step() {
    this.paused = true;
    this.callbacks.update();
    this.ticks++;
    this.callbacks.drawFrame();
  }
  // 停掉动画帧回调。shader、纹理和字库由 Renderer.dispose 释放。
  stop() {
    this.running = false;
    cancelAnimationFrame(this.request);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.lastTime = null;
  }
}
