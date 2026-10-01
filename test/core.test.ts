import { describe, expect, it } from 'vitest';
import { Matrix, intersect } from '../src/core/Matrix';
import { colorAdd, colorMul, rgba } from '../src/core/Color';
import { parsePpm, combinePpm } from '../src/core/PpmLoader';
import { Screen } from '../src/core/Screen';
import { ScissorStack } from '../src/core/ScissorStack';
import { FixedClock } from '../src/app/Game';
import { wrapText } from '../src/text/Label';

describe('original matrix units and row-vector composition', () => {
  it('normalizes translation separately from the linear coefficients', () => {
    expect(Matrix.fromRaw([1024, 0, 0, 1024, -800, 800]).m).toEqual([1, 0, 0, 1, -50, 50]);
  });
  it('applies local, part, then parent; these operations do not commute', () => {
    const local = Matrix.fromSrt({ x: 10 }), parent = Matrix.fromSrt({ scale: 2 });
    expect(local.mul(parent).transform(0, 0)).toEqual([20, 0]);
    expect(parent.mul(local).transform(0, 0)).toEqual([10, 0]);
    const rotated = local.mul(Matrix.fromSrt({ rot: 90 })).transform(0, 0);
    expect(rotated[0]).toBeCloseTo(0, 10); expect(rotated[1]).toBeCloseTo(10, 10);
  });
  it('applies SRT to existing translation, then adds the outer translation', () => {
    const p = Matrix.fromSrt({ x: 10 }).srt({ scale: 2, rot: 90, x: 50, y: 60 }).transform(0, 0);
    expect(p[0]).toBeCloseTo(50); expect(p[1]).toBeCloseTo(80);
  });
  it.each([{ sx: 2, sy: -3, x: 4, y: 8 }, { rot: 90, x: 50 }, { sx: 0.8, sy: 2, rot: 37, y: -10 }])('inverts %o', srt => {
    const matrix = Matrix.fromSrt(srt), p = matrix.inverse()!.transform(...matrix.transform(21, -17));
    expect(p[0]).toBeCloseTo(21, 10); expect(p[1]).toBeCloseTo(-17, 10);
  });
  it('returns null for a singular matrix so hit testing can reject it', () => {
    expect(Matrix.fromSrt({ sx: 0 }).inverse()).toBeNull();
  });
  it('agrees with the 45-degree C LUT within one fixed-point unit', () => {
    const m = Matrix.fromSrt({ rot: 45 }).m;
    expect(Math.abs(m[0] - 724 / 1024)).toBeLessThan(1 / 1024);
    expect(Math.abs(m[1] - 724 / 1024)).toBeLessThan(1 / 1024);
  });
});

describe('ARGB color semantics', () => {
  it('packs attributes in RGBA order even for unsigned high alpha', () => {
    expect(rgba(0x80abcdef)).toEqual([0xab, 0xcd, 0xef, 0x80]);
  });
  it('multiplies all channels with integer truncation', () => {
    expect(colorMul(0xffffffff, 0x80804020)).toBe(0x80804020);
    expect(colorMul(0x80808080, 0x80808080)).toBe(0x40404040);
  });
  it('saturates additive RGB without affecting alpha', () => {
    expect(colorAdd(0x00ff8040, 0x0080ff40)).toBe(0x00ffff80);
  });
});

const ppm = (header: string, bytes: number[]) => new Uint8Array([...new TextEncoder().encode(header), ...bytes]);
describe('PPM binary boundary', () => {
  it('accepts comments and CRLF without eating whitespace-valued raster bytes', () => {
    const image = parsePpm(ppm('P6\r\n# sample\r\n1 1\r\n255\r\n', [10, 32, 35]));
    expect([...image.pixels]).toEqual([10, 32, 35]);
  });
  it('combines RGB and alpha as original bytes, without double premultiplication', () => {
    const rgb = parsePpm(ppm('P6\n1 1\n255\n', [100, 50, 20]));
    const alpha = parsePpm(ppm('P5\n1 1\n255\n', [128]));
    expect([...combinePpm(rgb, alpha).pixels]).toEqual([100, 50, 20, 128]);
    expect([...combinePpm(rgb, null).pixels]).toEqual([100, 50, 20, 255]);
    expect([...combinePpm(null, alpha).pixels]).toEqual([128, 128, 128, 128]);
  });
  it('rejects truncated rasters, unsupported depths and mismatched files', () => {
    expect(() => parsePpm(ppm('P6\n1 1\n255\n', [0]))).toThrow('Truncated');
    expect(() => parsePpm(ppm('P6\n1 1\n15\n', [0, 0, 0]))).toThrow('maxval');
    expect(() => combinePpm(parsePpm(ppm('P6\n1 1\n255\n', [0, 0, 0])), parsePpm(ppm('P5\n2 1\n255\n', [0, 0])))).toThrow('dimensions');
  });
});

describe('screen and clip coordinates', () => {
  const screen = new Screen();
  it('maps logical endpoints to NDC once', () => {
    expect(screen.ndc(0, 0)).toEqual([-1, 1]);
    expect(screen.ndc(1024, 768)).toEqual([1, -1]);
  });
  it('maps CSS pointers independently from backing-store density', () => {
    expect(screen.pointer(300, 220, { left: 100, top: 70, width: 400, height: 300 })).toEqual([512, 384]);
  });
  it('flips scissor Y and scales into physical pixels', () => {
    expect(screen.scissor([10, 20, 110, 70], 2048, 1536)).toEqual([20, 1396, 200, 100]);
    expect(screen.scissor([0.5, 0.5, 0.5, 10], 1024, 768)).toEqual([0, 0, 0, 0]);
  });
  it('intersects nested clips and restores the enclosing rectangle', () => {
    const stack = new ScissorStack();
    stack.push([0, 0, 100, 100]); stack.push([50, 30, 150, 90]);
    expect(stack.current).toEqual([50, 30, 100, 90]);
    expect(stack.pop()).toEqual([0, 0, 100, 100]);
    expect(stack.pop()).toBeNull();
    expect(() => stack.pop()).toThrow('Unbalanced');
    expect(intersect([0, 0, 10, 10], [20, 20, 30, 30])).toEqual([20, 20, 20, 20]);
  });
});

it('updates exactly 30 times across 60 render frames and bounds catch-up after suspension', () => {
  const clock = new FixedClock(); let updates = 0;
  for (let i = 0; i < 60; i++) clock.advance(1 / 60, () => updates++);
  expect(updates).toBe(30);
  expect(clock.advance(600, () => updates++)).toBeLessThanOrEqual(8);
});

it('wraps Unicode code points and preserves explicit blank lines', () => {
  expect(wrapText('你好世界\n\nA😀B', 2, value => [...value].length)).toEqual(['你好', '世界', '', 'A😀', 'B']);
});
