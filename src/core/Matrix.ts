// 移植 lib/matrix.h 与 lib/matrix.c。
//
// 点是行向量 | x y 1 |，右乘
//
//   | m[0] m[1] 0 |
//   | m[2] m[3] 0 |
//   | m[4] m[5] 1 |
//
// 因此 x' = x*m[0] + y*m[2] + m[4]，y' = x*m[1] + y*m[3] + m[5]。
// C 把 m[0..3] 存成 10.10 定点（1024 = 1），m[4..5] 存成屏幕单位
// （spritepack.h 的 SCREEN_SCALE = 16，即 1 像素）。这里的数是逻辑像素。
// fromRaw 一次性除掉这两个比例，之后的乘法不再除以 1024。
// 旋转用 Math.sin / Math.cos。C 用 icost 查表：EJMAT_R_FACTOR（4096）是一整圈，1024 是 90°。

// [m0, m1, m2, m3, tx, ty]，与 struct matrix 的 int m[6] 同序。
export type MatrixData = readonly [number, number, number, number, number, number];

// 绘制用的缩放、旋转、平移。scale 同时覆盖 sx 和 sy，与 ejoy2d/matrix.lua 一致。
export interface Srt { x?: number; y?: number; sx?: number; sy?: number; scale?: number; rot?: number }
export type Point = readonly [number, number];

export class Matrix {
  // matrix_identity。C 写入 {1024,0,0,1024,0,0}，这里对应 {1,0,0,1,0,0}。
  constructor(readonly m: MatrixData = [1, 0, 0, 1, 0, 0]) {}

  // 资源里的原始矩阵：线性分量除以 1024，平移除以 16。
  // {1024,0,0,1024,-800,800} 得到 {1,0,0,1,-50,50}。
  static fromRaw(m: MatrixData) {
    return new Matrix([m[0] / 1024, m[1] / 1024, m[2] / 1024, m[3] / 1024, m[4] / 16, m[5] / 16]);
  }

  // 顺序是缩放、旋转、平移，与 matrix_srt 相同。线性部分对应 matrix_sr；
  // matrix_rs（先旋转再缩放）没有移植。rot 是角度。C 先乘 4096/360，再交给 icost。
  static fromSrt({ x = 0, y = 0, sx = 1, sy = 1, scale, rot = 0 }: Srt = {}) {
    const angle = rot * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    sx = scale ?? sx;
    sy = scale ?? sy;
    return new Matrix([sx * c, sx * s, -sy * s, sy * c, x, y]);
  }

  // matrix_mul(result, this, other)，省去定点除法。other 作用在当前矩阵之后。
  // lmatrix.c 的 lmul 是相反的相乘顺序，这里不提供。返回新矩阵；Lua 的 matrix:mul 写回接收者。
  mul(other: Matrix) {
    const [a, b, c, d, x, y] = this.m;
    const [e, f, g, h, u, v] = other.m;
    return new Matrix([
      a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h,
      x * e + y * g + u, x * f + y * h + v,
    ]);
  }

  // matrix.h 里的 | x y 1 | * m。sprite.c 的 set_scissor 和 poly_aabb 用同一公式，并额外除以 1024。
  transform(x: number, y: number): Point {
    const m = this.m;
    return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
  }

  // 右乘，效果与原地调用 matrix_scale、matrix_rot、matrix_srt 相同。
  scale(sx: number, sy = sx) { return this.mul(Matrix.fromSrt({ sx, sy })); }
  rot(degrees: number) { return this.mul(Matrix.fromSrt({ rot: degrees })); }
  trans(x: number, y: number) { return this.mul(Matrix.fromSrt({ x, y })); }
  srt(value: Srt) { return this.mul(Matrix.fromSrt(value)); }

  // matrix_inverse 的一般分支。行列式为 0 时返回 null；C 返回 1。
  // C 对纯缩放（m[1] 与 m[2] 为 0）和纯旋转（m[0] 与 m[3] 为 0）有捷径，浮点路径都走这个公式。
  inverse(): Matrix | null {
    const [a, b, c, d, x, y] = this.m;
    const det = a * d - b * c;
    if (det === 0) return null;
    return new Matrix([d / det, -b / det, -c / det, a / det,
      (y * c - x * d) / det, (x * b - y * a) / det]);
  }
}

// [minX, minY, maxX, maxY]，角点顺序与 poly_aabb 的 aabb[4] 相同。
export type Rect = readonly [number, number, number, number];

// 变换后各角点的最小、最大坐标。poly_aabb 随后还会除以 SCREEN_SCALE；这里的点已经是像素。
export function bounds(points: readonly Point[]): Rect {
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}

// set_scissor 为 panel 取的四个角：(0,0)、(w,0)、(w,h)、(0,h)。C 会先乘 SCREEN_SCALE。
export function rectPoints(width: number, height: number): Point[] {
  return [[0, 0], [width, 0], [width, height], [0, height]];
}

// 命中测试。sprite.c 的 label 和 panel 在远端是半开区间（x < width）。
// test_quad 把远端也算进去（x <= maxx）。
export function contains(rect: Rect, x: number, y: number) {
  return x >= rect[0] && y >= rect[1] && x < rect[2] && y < rect[3];
}

// scissor.c 的 intersection，这里用对角点而不是 x、y、width、height。
// 不相交时收成空矩形。C 可能留下负的宽高。
export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]);
  return [x, y, Math.max(x, Math.min(a[2], b[2])), Math.max(y, Math.min(a[3], b[3]))];
}
