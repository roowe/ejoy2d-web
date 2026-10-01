// 移植 lib/screen.c。
//
// width、height 是逻辑分辨率，默认 1024×768，对应 screen_init 的 w、h。
// 它们与 CSS 尺寸、devicePixelRatio 无关。C 另存 SCREEN.scale，用它把逻辑像素乘成帧缓冲像素，
// 并在 screen_init 里把视口设为 w*scale、h*scale。这里不保存 scale，裁剪时另传 canvas 的后备存储尺寸。
//
// screen_trans 把仍是像素×16 的坐标乘成左上 (0,0)、右下 (2,-2)。
// shader.lua 的 sprite_vs 再加 (-1,+1)，得到标准 NDC。
// ndc 在 CPU 上一次完成这两步，输入已经是逻辑像素。
// screen_is_visible 和 screen_is_poly_invisible 判断的是前一种中间坐标，没有移植。
import type { Point, Rect } from './Matrix';

export class Screen {
  constructor(readonly width = 1024, readonly height = 768) {}

  // 左上 (-1,+1)，右下 (+1,-1)。BatchBuffer 用结果填顶点，着色器不再加偏移。
  ndc(x: number, y: number): Point { return [2 * x / this.width - 1, 1 - 2 * y / this.height]; }

  // 把浏览器客户区坐标换回逻辑像素。C 的输入进入引擎时已经是屏幕像素，没有这一步。
  pointer(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Point {
    return [(clientX - rect.left) * this.width / rect.width, (clientY - rect.top) * this.height / rect.height];
  }

  // screen_scissor。rect 是逻辑像素的 [minX, minY, maxX, maxY]，原点在左上，y 向下。
  // OpenGL 裁剪原点在左下，所以 y 用 height - maxY。pixelWidth、pixelHeight 代替 SCREEN.scale。
  // 返回 [x, y, width, height]，直接传给 gl.scissor。空矩形或完全落在屏外时宽高为 0；
  // C 在 w<=0 或 h<=0 时把宽高清零。边缘用 floor 和 ceil，避免小数坐标漏掉边界像素。
  scissor(rect: Rect, pixelWidth: number, pixelHeight: number): Rect {
    if (rect[2] <= rect[0] || rect[3] <= rect[1]) return [0, 0, 0, 0];
    const x0 = Math.max(0, Math.floor(rect[0] * pixelWidth / this.width));
    const y0 = Math.max(0, Math.floor((this.height - rect[3]) * pixelHeight / this.height));
    const x1 = Math.min(pixelWidth, Math.ceil(rect[2] * pixelWidth / this.width));
    const y1 = Math.min(pixelHeight, Math.ceil((this.height - rect[1]) * pixelHeight / this.height));
    return [Math.min(pixelWidth, x0), Math.min(pixelHeight, y0), Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
  }
}
