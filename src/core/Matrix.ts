// Port of lib/matrix.h/.c: row vectors; float coefficients and pixel translations.
export type MatrixData = readonly [number, number, number, number, number, number];
export interface Srt { x?: number; y?: number; sx?: number; sy?: number; scale?: number; rot?: number }
export type Point = readonly [number, number];

export class Matrix {
  constructor(readonly m: MatrixData = [1, 0, 0, 1, 0, 0]) {}

  static fromRaw(m: MatrixData) {
    return new Matrix([m[0] / 1024, m[1] / 1024, m[2] / 1024, m[3] / 1024, m[4] / 16, m[5] / 16]);
  }

  static fromSrt({ x = 0, y = 0, sx = 1, sy = 1, scale, rot = 0 }: Srt = {}) {
    const angle = rot * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    sx = scale ?? sx;
    sy = scale ?? sy;
    return new Matrix([sx * c, sx * s, -sy * s, sy * c, x, y]);
  }

  mul(other: Matrix) {
    const [a, b, c, d, x, y] = this.m;
    const [e, f, g, h, u, v] = other.m;
    return new Matrix([
      a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h,
      x * e + y * g + u, x * f + y * h + v,
    ]);
  }

  transform(x: number, y: number): Point {
    const m = this.m;
    return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
  }

  scale(sx: number, sy = sx) { return this.mul(Matrix.fromSrt({ sx, sy })); }
  rot(degrees: number) { return this.mul(Matrix.fromSrt({ rot: degrees })); }
  trans(x: number, y: number) { return this.mul(Matrix.fromSrt({ x, y })); }
  srt(value: Srt) { return this.mul(Matrix.fromSrt(value)); }

  inverse(): Matrix | null {
    const [a, b, c, d, x, y] = this.m;
    const det = a * d - b * c;
    if (det === 0) return null;
    return new Matrix([d / det, -b / det, -c / det, a / det,
      (y * c - x * d) / det, (x * b - y * a) / det]);
  }
}

export type Rect = readonly [number, number, number, number];

export function bounds(points: readonly Point[]): Rect {
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}

export function rectPoints(width: number, height: number): Point[] {
  return [[0, 0], [width, 0], [width, height], [0, height]];
}

export function contains(rect: Rect, x: number, y: number) {
  return x >= rect[0] && y >= rect[1] && x < rect[2] && y < rect[3];
}

export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]);
  return [x, y, Math.max(x, Math.min(a[2], b[2])), Math.max(y, Math.min(a[3], b[3]))];
}
