// Port of lib/screen.c; logical pixels are independent of CSS size and devicePixelRatio.
import type { Point, Rect } from './Matrix';

export class Screen {
  constructor(readonly width = 1024, readonly height = 768) {}

  ndc(x: number, y: number): Point { return [2 * x / this.width - 1, 1 - 2 * y / this.height]; }

  pointer(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Point {
    return [(clientX - rect.left) * this.width / rect.width, (clientY - rect.top) * this.height / rect.height];
  }

  scissor(rect: Rect, pixelWidth: number, pixelHeight: number): Rect {
    if (rect[2] <= rect[0] || rect[3] <= rect[1]) return [0, 0, 0, 0];
    const x0 = Math.max(0, Math.floor(rect[0] * pixelWidth / this.width));
    const y0 = Math.max(0, Math.floor((this.height - rect[3]) * pixelHeight / this.height));
    const x1 = Math.min(pixelWidth, Math.ceil(rect[2] * pixelWidth / this.width));
    const y1 = Math.min(pixelHeight, Math.ceil((this.height - rect[1]) * pixelHeight / this.height));
    return [Math.min(pixelWidth, x0), Math.min(pixelHeight, y0), Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
  }
}
