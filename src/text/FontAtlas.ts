// MVP substitute for lib/dfont.c: each laid-out text run has a cached Canvas texture.
// Color is applied by the sprite shader; cache eviction only runs after a frame is flushed.
import { Texture } from "../core/Texture";
import type { LabelData } from "../sprite/types";
import { wrapText } from "./Label";

export class FontAtlas {
  private readonly entries = new Map<
    string,
    { texture: Texture; used: number }
  >();
  private frame = 0;
  constructor(private readonly gl: WebGL2RenderingContext) {}

  get(label: LabelData, text: string): Texture {
    const key = JSON.stringify([
      text,
      label.width,
      label.height,
      label.size,
      label.align,
    ]);
    const existing = this.entries.get(key);
    if (existing) {
      existing.used = this.frame;
      return existing.texture;
    }
    const canvas = document.createElement("canvas");
    const density = 2;
    canvas.width = Math.ceil(label.width * density);
    canvas.height = Math.ceil(label.height * density);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is required for bitmap text");
    context.scale(density, density);
    context.font = `${label.size}px Arial, "Microsoft YaHei", sans-serif`;
    context.fillStyle = "white";
    context.textBaseline = "top";
    const lines = wrapText(
      text,
      label.width,
      (value) => context.measureText(value).width,
    );
    lines.forEach((line, i) => {
      const w = context.measureText(line).width;
      const x =
        label.align === 2
          ? (label.width - w) / 2
          : label.align === 1
            ? label.width - w
            : 0;
      context.fillText(line, x, i * label.size);
    });
    const texture = new Texture(this.gl, canvas);
    this.entries.set(key, { texture, used: this.frame });
    return texture;
  }

  endFrame() {
    this.frame++;
    if (this.entries.size <= 128) return;
    for (const [key, entry] of this.entries) {
      if (entry.used < this.frame - 1) {
        entry.texture.dispose();
        this.entries.delete(key);
      }
    }
  }
  dispose() {
    for (const entry of this.entries.values()) entry.texture.dispose();
    this.entries.clear();
  }
}
