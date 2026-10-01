// Port of ejoy2d/spritepack.lua and lib/spritepack.c. Validate once at the JSON boundary.
import { Matrix, type MatrixData, type Point } from '../core/Matrix';
import { WHITE } from '../core/Color';
import { ANCHOR_ID, type SpriteData, type Part } from './types';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected resource object');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected resource array');
  return value;
}
function number(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected finite resource number');
  return value;
}
function integer(value: unknown) {
  const n = number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error('Expected nonnegative resource integer');
  return n;
}
function string(value: unknown) {
  if (typeof value !== 'string') throw new Error('Expected resource string');
  return value;
}
function positive(value: unknown) {
  const n = number(value);
  if (n <= 0) throw new Error('Expected positive resource dimension');
  return n;
}
function boolean(value: unknown) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error('Expected resource boolean');
  return value;
}
function color(value: unknown) {
  const n = integer(value);
  if (n > 0xffffffff) throw new Error('Resource color exceeds 32 bits');
  return n;
}
function points(value: unknown, divisor: number): Point[] {
  const values = array(value).map(number);
  if (values.length !== 8) throw new Error('Picture quad needs exactly four points');
  return Array.from({ length: 4 }, (_, i) => [values[2 * i] / divisor, values[2 * i + 1] / divisor]);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export class SpritePack {
  readonly textureCount: number;
  readonly exports: Readonly<Record<string, number>>;
  private readonly objects = new Map<number, SpriteData>();

  constructor(input: unknown) {
    const source = record(input);
    this.textureCount = integer(source.textureCount);
    const exports: Record<string, number> = Object.create(null);
    for (const [name, id] of Object.entries(record(source.exports))) exports[name] = integer(id);
    this.exports = Object.freeze(exports);
    for (const value of array(source.objects)) {
      const o = record(value), id = integer(o.id);
      if (id >= ANCHOR_ID || this.objects.has(id)) throw new Error(`Invalid or duplicate sprite id: ${id}`);
      let data: SpriteData;
      switch (o.type) {
        case 'picture': data = { type: o.type, id, quads: array(o.quads).map(value => {
          const q = record(value), texture = integer(q.tex) - 1;
          if (texture < 0 || texture >= this.textureCount) throw new Error('Picture texture index out of range');
          return { texture, src: points(q.src, 1), screen: points(q.screen, 16) };
        }) }; break;
        case 'animation': {
          const components = array(o.components).map(value => {
            const c = record(value);
            const name = c.name === undefined ? null : string(c.name);
            if (c.id === undefined && name === null) throw new Error('Anchor requires a name');
            return { id: c.id === undefined ? ANCHOR_ID : integer(c.id), name };
          });
          const names = components.flatMap(c => c.name === null ? [] : [c.name]);
          if (new Set(names).size !== names.length) throw new Error('Duplicate component name');
          const actions = array(o.actions).map(value => {
            const a = record(value);
            const frames = array(a.frames).map(value => ({ parts: array(record(value).parts).map(value => {
              const p = typeof value === 'number' ? { index: value } : record(value);
              const index = integer(p.index);
              if (index >= components.length) throw new Error('Frame component index out of range');
              let matrix = new Matrix();
              if (p.mat !== undefined) {
                const m = array(p.mat).map(number);
                if (m.length !== 6) throw new Error('Resource matrix needs six components');
                matrix = Matrix.fromRaw(m as unknown as MatrixData);
              }
              return { index, matrix, color: p.color === undefined ? WHITE : color(p.color),
                add: p.add === undefined ? 0 : color(p.add), touch: boolean(p.touch) } satisfies Part;
            }) }));
            if (!frames.length) throw new Error('Animation action cannot have zero frames');
            return { name: string(a.name), frames };
          });
          if (!actions.length) throw new Error('Animation needs at least one action');
          if (new Set(actions.map(a => a.name)).size !== actions.length) throw new Error('Duplicate action name');
          data = { type: o.type, id, components, actions }; break;
        }
        case 'label': {
          const align = integer(o.align);
          if (align > 2) throw new Error('Label align must be 0, 1, or 2');
          data = { type: o.type, id, width: positive(o.width), height: positive(o.height),
            size: positive(o.size), align, color: color(o.color) }; break;
        }
        case 'pannel': data = { type: o.type, id, width: positive(o.width), height: positive(o.height), scissor: boolean(o.scissor) }; break;
        default: throw new Error(`Unsupported sprite type: ${String(o.type)}`);
      }
      this.objects.set(id, freeze(data));
    }
    for (const id of Object.values(this.exports)) this.get(id);
    const visited = new Set<number>(), visiting = new Set<number>();
    const visit = (id: number) => {
      if (id === ANCHOR_ID || visited.has(id)) return;
      if (visiting.has(id)) throw new Error('Cyclic sprite component reference');
      visiting.add(id);
      const data = this.get(id);
      if (data.type === 'animation') for (const c of data.components) visit(c.id);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of this.objects.keys()) visit(id);
  }

  get(idOrName: number | string): SpriteData {
    const id = typeof idOrName === 'string' ? this.exports[idOrName] : idOrName;
    const data = this.objects.get(id);
    if (!data) throw new Error(`Unknown sprite: ${idOrName}`);
    return data;
  }
  get size() { return this.objects.size; }
}
