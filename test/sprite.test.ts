import { describe, expect, it } from 'vitest';
import sample from '../public/assets/sample.json';
import { SpritePack } from '../src/sprite/SpritePack';
import { Sprite, type SpritePainter } from '../src/sprite/Sprite';
import { Matrix, type Rect } from '../src/core/Matrix';
import type { Picture, LabelData } from '../src/sprite/types';
import type { Program } from '../src/core/shaders';

const samplePack = new SpritePack(sample);
const picture = (id: number) => ({ type: 'picture', id, quads: [{ tex: 1, src: [0, 0, 10, 0, 10, 10, 0, 10], screen: [0, 0, 160, 0, 160, 160, 0, 160] }] });
const panel = { type: 'pannel', id: 1, width: 5, height: 5, scissor: false };
function pack(objects: unknown[], root = 10) { return new SpritePack({ textureCount: 1, exports: { root }, objects }); }
function animation(id: number, components: unknown[], parts: unknown[]) {
  return { type: 'animation', id, components, actions: [{ name: '', frames: [{ parts }] }] };
}
function hitPack() {
  return pack([picture(0), panel, animation(10, [{ id: 1, name: 'panel' }, { id: 0, name: 'image' }], [{ index: 0, touch: true }, 1])]);
}
class RecordingPainter implements SpritePainter {
  calls: { type: string; matrix?: Matrix; id?: number; color?: number; additive?: number; rect?: Rect; program?: Program }[] = [];
  picture(_pack: SpritePack, data: Picture, matrix: Matrix, color: number, additive: number, program: Program) {
    this.calls.push({ type: 'picture', id: data.id, matrix, color, additive, program });
  }
  label(_data: LabelData, _text: string, matrix: Matrix, color: number, additive: number) {
    this.calls.push({ type: 'label', matrix, color, additive });
  }
  pushClip(rect: Rect) { this.calls.push({ type: 'push', rect }); }
  popClip() { this.calls.push({ type: 'pop' }); }
}

describe('actual sample package', () => {
  it('contains original exports, IDs, picture dimensions and normalized matrix pool references', () => {
    expect(samplePack.size).toBe(41);
    expect(samplePack.exports).toEqual({ cannon: 26, mine: 38 });
    expect(Sprite.create(samplePack, 25).aabb()).toEqual([-59.875, -36.25, 57.375, 53.75]);
    const turret = samplePack.get(19);
    if (turret.type !== 'animation') throw new Error('Expected animation');
    const pooled = turret.actions[0].frames.find(f => f.parts.some(p => p.matrix.m[4] === 136 / 16));
    expect(pooled).toBeDefined();
    expect(Object.isFrozen(turret.actions[0].frames[0].parts[0].matrix.m)).toBe(true);
  });
  it('instantiates turret and an invisible anchor immediately', () => {
    const gun = Sprite.create(samplePack, 'cannon');
    expect(gun.fetch('turret').id).toBe(19);
    expect(gun.fetch('turret').fetch('anchor').visible).toBe(false);
  });
  it('propagates mine frame to unnamed animation while resource stays at 70', () => {
    const mine = Sprite.create(samplePack, 'mine');
    mine.fetch('resource').frame = 70;
    const before = new RecordingPainter(); mine.draw(before);
    mine.frame = 12;
    const after = new RecordingPainter(); mine.draw(after);
    // Unnamed component id=33 now selects picture id=32 instead of id=29.
    expect(before.calls.some(c => c.id === 29)).toBe(true);
    expect(after.calls.some(c => c.id === 32)).toBe(true);
    expect(mine.fetch('resource').frame).toBe(70);
  });
  it('keeps per-instance transforms and frames independent', () => {
    const a = Sprite.create(samplePack, 'cannon'), b = Sprite.create(samplePack, 'cannon');
    a.fetch('turret').frame = 50; a.ps(10, 20);
    expect(b.fetch('turret').frame).toBe(0); expect(b.matrix.m).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('resource validation', () => {
  it('rejects duplicate IDs and broken references', () => {
    expect(() => pack([picture(0), picture(0)], 0)).toThrow('duplicate');
    expect(() => pack([animation(10, [{ id: 9 }], [0])])).toThrow('Unknown sprite');
    expect(() => pack([picture(0), animation(10, [{ id: 0 }], [1])])).toThrow('index');
  });
  it('rejects cycles, empty actions and malformed matrices before instantiation', () => {
    expect(() => pack([animation(10, [{ id: 10 }], [0])])).toThrow('Cyclic');
    expect(() => pack([{ type: 'animation', id: 10, components: [], actions: [] }])).toThrow('action');
    expect(() => pack([picture(0), animation(10, [{ id: 0 }], [{ index: 0, mat: [1] }])])).toThrow('six');
  });
});

it('switches named actions, stores unwrapped frame values and wraps negative indices', () => {
  const resource = pack([picture(0), picture(1), { type: 'animation', id: 10, components: [{ id: 0 }, { id: 1 }], actions: [
    { name: 'idle', frames: [{ parts: [0] }] }, { name: 'run', frames: [{ parts: [0] }, { parts: [1] }] },
  ] }]);
  const sprite = Sprite.create(resource, 'root');
  sprite.frame = 12; sprite.action = 'run'; expect(sprite.frame).toBe(0);
  sprite.frame = -1;
  const output = new RecordingPainter(); sprite.draw(output);
  expect(output.calls[0].id).toBe(1); expect(sprite.frame).toBe(-1); expect(sprite.frameCount).toBe(2);
  expect(() => { sprite.action = 'missing'; }).toThrow('Unknown action');
});

it('composes own transform, frame part and parent with inherited color/additive', () => {
  const resource = pack([picture(0), animation(10, [{ id: 0, name: 'image' }], [{ index: 0, mat: [1024, 0, 0, 1024, 80, 0], color: 0x80808080, add: 0x000001 }])]);
  const root = Sprite.create(resource, 10).ps(2);
  root.color = 0x80808080; root.additive = 0x0000ff;
  root.fetch('image').ps(10, 0);
  const painter = new RecordingPainter(); root.draw(painter, { x: 100 });
  expect(painter.calls[0].matrix!.transform(0, 0)).toEqual([130, 0]);
  expect(painter.calls[0].color).toBe(0x40404040); expect(painter.calls[0].additive).toBe(0x0000ff);
});

describe('message capture and panel clipping', () => {
  it('lets a non-capturing foreground picture pass the hit to panel', () => {
    const root = Sprite.create(hitPack(), 10);
    expect(root.test(2, 2)).toBe(root.fetch('panel'));
    expect(root.test(8, 8)).toBe(root);
    expect(root.test(11, 11)).toBeNull();
    root.fetch('image').message = true;
    expect(root.test(2, 2)).toBe(root.fetch('image'));
  });
  it('rejects content outside the panel, including on edges and with CSS-independent SRT', () => {
    const root = Sprite.create(hitPack(), 10);
    root.fetch('panel').scissor = true;
    expect(root.test(8, 8)).toBeNull();
    expect(root.test(5, 5)).toBeNull();
    expect(root.test(104, 54, { scale: 2, x: 100, y: 50 })).toBe(root.fetch('panel'));
    root.sr(0, 1); expect(root.test(0, 2)).toBeNull();
  });
  it('returns the capturing ancestor, or the entry root for uncaptured geometry', () => {
    const resource = pack([picture(0), animation(2, [{ id: 0 }], [0]), animation(10, [{ id: 2, name: 'group' }], [0])]);
    const root = Sprite.create(resource, 10);
    expect(root.test(2, 2)).toBe(root);
    root.fetch('group').message = true;
    expect(root.test(2, 2)).toBe(root.fetch('group'));
    root.fetch('group').visible = false; expect(root.test(2, 2)).toBeNull();
  });
  it('keeps a clip until the owning animation ends, then restores it for siblings', () => {
    const resource = pack([picture(0), { ...panel, scissor: true },
      animation(2, [{ id: 1 }, { id: 0 }], [0, 1]),
      animation(10, [{ id: 0 }, { id: 2 }, { id: 0 }], [0, 1, 2])]);
    const root = Sprite.create(resource, 10), painter = new RecordingPainter();
    root.draw(painter);
    expect(painter.calls.map(c => c.type)).toEqual(['picture', 'push', 'picture', 'pop', 'picture']);
    expect(painter.calls[1].rect).toEqual([0, 0, 5, 5]);
  });
  it('preserves the original AABB stop-at-panel rule', () => {
    const root = Sprite.create(hitPack(), 10);
    expect(root.aabb()).toEqual([0, 0, 10, 10]);
    root.fetch('panel').scissor = true;
    expect(root.aabb()).toEqual([0, 0, 5, 5]);
  });
});

describe('mount, proxy and anchors', () => {
  it('shares one proxy while normal children detach from their previous slot', () => {
    const a = Sprite.create(samplePack, 'cannon'), b = Sprite.create(samplePack, 'cannon');
    const turret = a.fetch('turret'), proxy = Sprite.proxy();
    proxy.mount('proxy', turret); expect(a.getChild('turret')).toBeNull();
    a.mount('turret', proxy); b.mount('turret', proxy);
    expect(proxy.parent).toBeNull(); expect(proxy.name).toBeNull();
    expect(a.fetch('turret')).toBe(b.fetch('turret'));
    expect(turret.parent).toBe(proxy);
    expect(() => proxy.mount('proxy', a)).toThrow('cycle');
  });
  it('updates anchor world matrix including outer SRT; mounted label lands at the same transform', () => {
    const gun = Sprite.create(samplePack, 'cannon').ps(-100, 0, 0.5);
    const turret = gun.fetch('turret'), anchor = turret.fetch('anchor'); anchor.visible = true;
    turret.frame = 32;
    const srt = { x: 512, y: 384, scale: 1.2, rot: 20 };
    gun.draw(new RecordingPainter(), srt);
    const expected = anchor.worldMatrix.m;
    const label = Sprite.label({ width: 100, height: 100, text: 'Hello' });
    anchor.message = true;
    turret.mount('anchor', label);
    const painter = new RecordingPainter(); gun.draw(painter, srt);
    expect(painter.calls.find(c => c.type === 'label')!.matrix!.m).toEqual(expected);
    expect(label.message).toBe(true);
  });
});
