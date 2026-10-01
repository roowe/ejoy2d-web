// Port of lib/ejoy2dgame.c. Browser suspension discards backlog instead of blocking on catch-up.
export interface GameCallbacks {
  update(): void;
  drawFrame(): void;
}

export class FixedClock {
  private accumulated = 0;
  constructor(readonly step = 1 / 30) {}
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
  private readonly onVisibility = () => {
    this.lastTime = null;
    this.clock.reset();
  };
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
  step() {
    this.paused = true;
    this.callbacks.update();
    this.ticks++;
    this.callbacks.drawFrame();
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.request);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.lastTime = null;
  }
}
