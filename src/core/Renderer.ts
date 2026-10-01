// Port of lib/render/render.c and lib/shader.c; owns all WebGL state and flush boundaries.
import { BatchBuffer, MAX_QUADS } from "./BatchBuffer";
import { rgba, WHITE } from "./Color";
import { Matrix, rectPoints, type Point, type Rect } from "./Matrix";
import { Screen } from "./Screen";
import { ScissorStack } from "./ScissorStack";
import { Shader } from "./Shader";
import { Texture } from "./Texture";
import type { Program } from "./shaders";
import type { RgbaImage } from "./PpmLoader";
import { FontAtlas } from "../text/FontAtlas";
import type { SpritePainter } from "../sprite/Sprite";
import type { SpritePack } from "../sprite/SpritePack";
import type { LabelData, Picture } from "../sprite/types";

const fullUv: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
export class Renderer implements SpritePainter {
  readonly gl: WebGL2RenderingContext;
  readonly screen = new Screen();
  readonly clips = new ScissorStack();
  readonly stats = { drawCalls: 0, quads: 0 };
  private readonly batch: BatchBuffer;
  private readonly shaders: Record<Program, Shader>;
  private readonly fonts: FontAtlas;
  private readonly packages = new Map<SpritePack, readonly Texture[]>();
  private readonly textures = new Set<Texture>();
  private readonly white: Texture;
  private currentTexture: Texture | null = null;
  private currentProgram: Program | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl)
      throw new Error("此浏览器无法创建 WebGL2 上下文，请启用硬件加速后重试。");
    this.gl = gl;
    this.shaders = {
      normal: new Shader(gl, "normal"),
      gray: new Shader(gl, "gray"),
      color: new Shader(gl, "color"),
    };
    this.batch = new BatchBuffer(gl, this.screen);
    this.fonts = new FontAtlas(gl);
    this.white = this.createTexture({
      width: 1,
      height: 1,
      pixels: new Uint8Array([255, 255, 255, 255]),
    });
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  createTexture(image: RgbaImage) {
    this.flush();
    const texture = new Texture(this.gl, image);
    this.textures.add(texture);
    this.currentTexture = null;
    return texture;
  }
  registerPack(pack: SpritePack, textures: readonly Texture[]) {
    if (textures.length !== pack.textureCount)
      throw new Error("Pack texture count mismatch");
    this.packages.set(pack, textures);
  }
  getTextures(pack: SpritePack) {
    const textures = this.packages.get(pack);
    if (!textures)
      throw new Error(
        "Sprite pack textures are not registered with this renderer",
      );
    return textures;
  }

  begin(color = 0xff808080) {
    this.flush();
    if (this.clips.depth)
      throw new Error("Unbalanced clipping at frame boundary");
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
    const height = Math.max(1, Math.round(rect.height * devicePixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    const [r, g, b, a] = rgba(color);
    gl.clearColor(r / 255, g / 255, b / 255, a / 255);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.stats.drawCalls = 0;
    this.stats.quads = 0;
  }
  end() {
    this.flush();
    this.fonts.endFrame();
  }
  flush() {
    if (this.batch.flush()) this.stats.drawCalls++;
  }

  drawQuad(
    texture: Texture,
    positions: readonly Point[],
    uv: readonly Point[],
    color = WHITE,
    additive = 0,
    program: Program = "normal",
  ) {
    const gl = this.gl;
    if (texture !== this.currentTexture || program !== this.currentProgram) {
      this.flush();
      gl.useProgram(this.shaders[program].handle);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.handle);
      this.currentTexture = texture;
      this.currentProgram = program;
    }
    this.batch.addQuad(positions, uv, color, additive);
    this.stats.quads++;
    if (this.batch.count === MAX_QUADS) this.flush();
  }

  picture(
    pack: SpritePack,
    data: Picture,
    matrix: Matrix,
    color: number,
    additive: number,
    program: Program,
  ) {
    const textures = this.getTextures(pack);
    for (const quad of data.quads) {
      const texture = textures[quad.texture];
      const uv: Point[] = quad.src.map((p) => [
        p[0] / texture.width,
        p[1] / texture.height,
      ]);
      this.drawQuad(
        texture,
        quad.screen.map((p) => matrix.transform(...p)),
        uv,
        color,
        additive,
        program,
      );
    }
  }
  label(
    data: LabelData,
    text: string,
    matrix: Matrix,
    color: number,
    additive: number,
  ) {
    // A cache miss uploads a texture, which must not change the binding of queued geometry.
    this.flush();
    const texture = this.fonts.get(data, text);
    this.currentTexture = null;
    this.drawQuad(
      texture,
      rectPoints(data.width, data.height).map((p) => matrix.transform(...p)),
      fullUv,
      color,
      additive,
    );
  }
  fillRect(rect: Rect, color: number) {
    this.drawQuad(
      this.white,
      [
        [rect[0], rect[1]],
        [rect[2], rect[1]],
        [rect[2], rect[3]],
        [rect[0], rect[3]],
      ],
      fullUv,
      color,
    );
  }
  outline(rect: Rect, color = 0xffc6fa78, thickness = 1) {
    const [x0, y0, x1, y1] = rect;
    this.fillRect([x0, y0, x1, y0 + thickness], color);
    this.fillRect([x0, y1 - thickness, x1, y1], color);
    this.fillRect([x0, y0, x0 + thickness, y1], color);
    this.fillRect([x1 - thickness, y0, x1, y1], color);
  }
  private setClip(rect: Rect | null) {
    const gl = this.gl;
    if (rect) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        ...this.screen.scissor(rect, this.canvas.width, this.canvas.height),
      );
    } else gl.disable(gl.SCISSOR_TEST);
  }
  pushClip(rect: Rect) {
    this.flush();
    this.setClip(this.clips.push(rect));
  }
  popClip() {
    this.flush();
    this.setClip(this.clips.pop());
  }
  blend(source: number, destination: number) {
    this.flush();
    this.gl.blendFunc(source, destination);
  }

  dispose() {
    this.flush();
    this.fonts.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const shader of Object.values(this.shaders)) shader.dispose();
    this.batch.dispose();
    this.packages.clear();
    this.textures.clear();
  }
}
