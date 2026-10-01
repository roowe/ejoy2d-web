// Port of lib/sprite.c color_mul/color_add and lib/renderbuffer.c RGBA packing.
export const WHITE = 0xffffffff;
export type Rgba = readonly [number, number, number, number];

export function rgba(color: number): Rgba {
  return [(color >>> 16) & 255, (color >>> 8) & 255, color & 255, color >>> 24];
}

export function colorMul(a: number, b: number) {
  let result = 0;
  for (const shift of [0, 8, 16, 24]) {
    result |=
      Math.floor((((a >>> shift) & 255) * ((b >>> shift) & 255)) / 255) <<
      shift;
  }
  return result >>> 0;
}

export function colorAdd(a: number, b: number) {
  let result = 0;
  for (const shift of [0, 8, 16]) {
    result |=
      Math.min(255, ((a >>> shift) & 255) + ((b >>> shift) & 255)) << shift;
  }
  return result >>> 0;
}
