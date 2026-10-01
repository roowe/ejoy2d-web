// Port of lib/sprite.c and lib/lsprite.c: hierarchy, frame propagation, draw/test/aabb and mount.
import { Matrix, bounds, contains, rectPoints, type Point, type Rect, type Srt } from '../core/Matrix';
import { colorAdd, colorMul, WHITE } from '../core/Color';
import type { Program } from '../core/shaders';
import { SpritePack } from './SpritePack';
import { ANCHOR_ID, type SpriteData, type Animation, type LabelData, type Picture, type Frame } from './types';

export interface SpritePainter {
  picture(pack: SpritePack, data: Picture, matrix: Matrix, color: number, additive: number, program: Program): void;
  label(data: LabelData, text: string, matrix: Matrix, color: number, additive: number): void;
  pushClip(rect: Rect): void;
  popClip(): void;
}
interface Transform { matrix: Matrix; color: number; additive: number; program: Program }
interface Hit { sprite: Sprite; captured: boolean }
const identity = new Matrix();

export class Sprite {
  parent: Sprite | null = null;
  name: string | null = null;
  matrix = new Matrix();
  color = WHITE;
  additive = 0;
  program: Program | null = null;
  visible = true;
  message = false;
  scissor = false;
  text = '';
  worldMatrix = new Matrix();
  private readonly children: (Sprite | null)[] = [];
  private currentFrame = 0;
  private currentAction = 0;
  private readonly multimount: boolean;

  private constructor(readonly pack: SpritePack | null, readonly data: SpriteData, multimount = false) {
    this.multimount = multimount;
    if (data.type === 'anchor') this.visible = false;
    if (data.type === 'pannel') this.scissor = data.scissor;
    if (data.type === 'animation') {
      for (const component of data.components) {
        const child = component.id === ANCHOR_ID
          ? new Sprite(null, { type: 'anchor', id: ANCHOR_ID })
          : Sprite.create(pack!, component.id);
        child.parent = this;
        child.name = component.name;
        this.children.push(child);
      }
      for (const part of data.actions[0].frames[0].parts) {
        if (part.touch) this.children[part.index]!.message = true;
      }
    }
  }

  static create(pack: SpritePack, idOrName: number | string) { return new Sprite(pack, pack.get(idOrName)); }

  static label(options: { width: number; height: number; size?: number; align?: number; color?: number; text?: string }) {
    const { width, height, size = 20, align = 0, color = WHITE, text = '' } = options;
    if (![width, height, size].every(n => Number.isFinite(n) && n > 0) || ![0, 1, 2].includes(align)) {
      throw new Error('Invalid label dimensions or alignment');
    }
    const sprite = new Sprite(null, Object.freeze({ type: 'label', id: -1, width, height, size, align, color }));
    sprite.text = text;
    return sprite;
  }

  static proxy() {
    const data: Animation = { type: 'animation', id: -1, components: [{ id: ANCHOR_ID, name: 'proxy' }],
      actions: [{ name: '', frames: [{ parts: [{ index: 0, matrix: identity, color: WHITE, add: 0, touch: false }] }] }] };
    return new Sprite(null, data, true);
  }

  get type() { return this.data.type; }
  get id() { return this.data.id; }
  get frame() { return this.currentFrame; }
  set frame(value: number) {
    if (!Number.isSafeInteger(value)) throw new Error('Frame must be a safe integer');
    if (this.data.type !== 'animation') return;
    this.currentFrame = value;
    this.data.components.forEach((component, i) => {
      if (component.name === null && component.id !== ANCHOR_ID) {
        const child = this.children[i];
        if (child?.type === 'animation') child.frame = value;
      }
    });
  }
  get frameCount() { return this.data.type === 'animation' ? this.data.actions[this.currentAction].frames.length : 0; }
  get action() { return this.data.type === 'animation' ? this.data.actions[this.currentAction].name : ''; }
  set action(name: string) {
    if (this.data.type !== 'animation') throw new Error('Only animations have actions');
    const index = this.data.actions.findIndex(a => a.name === name);
    if (index < 0) throw new Error(`Unknown action: ${name}`);
    this.currentAction = index;
    this.currentFrame = 0;
  }

  private get activeFrame(): Frame {
    const animation = this.data as Animation;
    const frames = animation.actions[this.currentAction].frames;
    return frames[((this.currentFrame % frames.length) + frames.length) % frames.length];
  }

  getChild(name: string): Sprite | null {
    if (this.data.type !== 'animation') return null;
    const index = this.data.components.findIndex(c => c.name === name);
    return index < 0 ? null : this.children[index];
  }
  fetch(name: string): Sprite {
    const child = this.getChild(name);
    if (!child) throw new Error(`Missing sprite child: ${name}`);
    return child;
  }
  private reaches(target: Sprite): boolean {
    return this === target || this.children.some(child => child?.reaches(target));
  }

  mount(name: string, child: Sprite | null) {
    if (this.data.type !== 'animation') throw new Error('Only animations have mount slots');
    const index = this.data.components.findIndex(c => c.name === name);
    if (index < 0) throw new Error(`Unknown mount slot: ${name}`);
    const old = this.children[index];
    if (old === child) return;
    if (child?.reaches(this)) throw new Error('Mount would create a sprite cycle');
    // Lua mount automatically detaches a normal child from its previous slot; proxies retain no parent.
    if (child?.parent) {
      const previous = child.parent;
      previous.children[previous.children.indexOf(child)] = null;
      child.parent = null;
      child.name = null;
    }
    if (old && !old.multimount) { old.parent = null; old.name = null; }
    this.children[index] = child;
    if (child) {
      if (!child.multimount) { child.parent = this; child.name = name; }
      if (old?.type === 'anchor') child.message = old.message;
    }
  }

  ps(scale: number): this;
  ps(x: number, y: number, scale?: number): this;
  ps(x: number, y?: number, scale?: number) {
    const [a, b, c, d, tx, ty] = this.matrix.m;
    if (y === undefined) this.matrix = new Matrix([x, 0, 0, x, tx, ty]);
    else if (scale === undefined) this.matrix = new Matrix([a, b, c, d, x, y]);
    else this.matrix = new Matrix([scale, 0, 0, scale, x, y]);
    return this;
  }
  sr(rot: number): this;
  sr(sx: number, sy: number, rot?: number): this;
  sr(sx: number, sy?: number, rot = 0) {
    const [, , , , x, y] = this.matrix.m;
    this.matrix = sy === undefined ? Matrix.fromSrt({ x, y, rot: sx }) : Matrix.fromSrt({ x, y, sx, sy, rot });
    return this;
  }

  draw(painter: SpritePainter, srt: Srt = {}) {
    this.drawNode(painter, { matrix: identity, color: WHITE, additive: 0, program: 'normal' }, Matrix.fromSrt(srt));
  }
  private drawNode(painter: SpritePainter, parent: Transform, srt: Matrix) {
    if (!this.visible) return;
    const current: Transform = {
      matrix: this.matrix.mul(parent.matrix), color: colorMul(this.color, parent.color),
      additive: colorAdd(this.additive, parent.additive), program: this.program ?? parent.program,
    };
    const world = current.matrix.mul(srt);
    const data = this.data;
    switch (data.type) {
      case 'picture': painter.picture(this.pack!, data, world, current.color, current.additive, current.program); return;
      case 'label': if (this.text) painter.label(data, this.text, world, colorMul(current.color, data.color), current.additive); return;
      case 'anchor': this.worldMatrix = world; return;
      case 'pannel': return;
      case 'animation': {
        let clips = 0;
        for (const part of this.activeFrame.parts) {
          const child = this.children[part.index];
          if (!child?.visible) continue;
          const transform: Transform = { matrix: part.matrix.mul(current.matrix), color: colorMul(part.color, current.color),
            additive: colorAdd(part.add, current.additive), program: current.program };
          if (child.data.type === 'pannel' && child.scissor) {
            const clipWorld = child.matrix.mul(transform.matrix).mul(srt);
            painter.pushClip(bounds(rectPoints(child.data.width, child.data.height).map(p => clipWorld.transform(...p))));
            clips++;
          } else child.drawNode(painter, transform, srt);
        }
        while (clips-- > 0) painter.popClip();
      }
    }
  }

  test(x: number, y: number, srt: Srt = {}): Sprite | null {
    const hit = this.hitNode(identity, Matrix.fromSrt(srt), x, y);
    return hit ? hit.captured ? hit.sprite : this : null;
  }
  private hitNode(parent: Matrix, srt: Matrix, x: number, y: number): Hit | null {
    if (!this.visible) return null;
    const current = this.matrix.mul(parent);
    if (this.data.type === 'animation') {
      const parts = this.activeFrame.parts;
      let candidate: Hit | null = null;
      let start = parts.length - 1;
      while (start >= 0) {
        let clip = -1;
        for (let i = start; i >= 0; i--) {
          const child = this.children[parts[i].index];
          if (child?.visible && child.type === 'pannel' && child.scissor) { clip = i; break; }
        }
        if (clip >= 0) {
          const part = parts[clip], panel = this.children[part.index]!;
          if (!panel.hitNode(part.matrix.mul(current), srt, x, y)) { start = clip - 1; continue; }
        }
        const end = Math.max(clip, 0);
        for (let i = start; i >= end; i--) {
          const part = parts[i];
          const hit = this.children[part.index]?.hitNode(part.matrix.mul(current), srt, x, y);
          if (hit?.captured) return hit;
          if (hit) candidate = hit;
        }
        start = end - 1;
      }
      if (candidate && this.message) return { sprite: this, captured: true };
      return candidate;
    }
    const inverse = current.mul(srt).inverse();
    if (!inverse) return null;
    const point = inverse.transform(x, y);
    const inside = this.localBounds().some(rect => contains(rect, ...point));
    return inside ? { sprite: this, captured: this.message } : null;
  }

  private localBounds(): Rect[] {
    const data = this.data;
    if (data.type === 'picture') return data.quads.map(q => bounds(q.screen));
    if (data.type === 'label' || data.type === 'pannel') return [[0, 0, data.width, data.height]];
    return [];
  }

  aabb(srt: Srt = {}): Rect {
    const points: Point[] = [];
    this.collectBounds(identity, Matrix.fromSrt(srt), points);
    return points.length ? bounds(points) : [0, 0, 0, 0];
  }
  private collectBounds(parent: Matrix, srt: Matrix, output: Point[]) {
    if (!this.visible) return;
    const current = this.matrix.mul(parent), world = current.mul(srt);
    const data = this.data;
    if (data.type === 'animation') {
      for (const part of this.activeFrame.parts) {
        const child = this.children[part.index];
        if (!child?.visible) continue;
        child.collectBounds(part.matrix.mul(current), srt, output);
        if (child.type === 'pannel' && child.scissor) break;
      }
    } else if (data.type === 'picture') {
      for (const quad of data.quads) output.push(...quad.screen.map(p => world.transform(...p)));
    } else if (data.type === 'label' || data.type === 'pannel') {
      output.push(...rectPoints(data.width, data.height).map(p => world.transform(...p)));
    }
  }
}
