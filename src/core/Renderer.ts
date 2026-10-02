// 移植 lib/shader.c 的 render_state，GL 调用对应 lib/render/render.c。
//
// 原版把合批状态放在全局 RS：当前 program、纹理通道、混合、drawcall 和顶点缓冲。
// 纹理或 program 变化、缓冲满 1024、裁剪或混合改变时，先 rs_commit 再改状态。
// 这里用 currentTexture、currentProgram 和 BatchBuffer 做同样的边界。
//
// 只建 normal、gray、color 三个 program。文字把 Canvas 字库贴成普通四边形，
// 不用 PROGRAM_TEXT / PROGRAM_TEXT_EDGE。material、多纹理通道和 polygon 没有移植。
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

  // shader_init 把混合设为 ONE, ONE_MINUS_SRC_ALPHA。片段着色器输出已经预乘 alpha，源因子因此是 ONE。
  // 关闭深度测试和背面剔除，四边形按提交顺序覆盖。white 是 1×1 白纹理，给 fillRect / outline 用。
  // preserveDrawingBuffer 让这一帧呈现之后仍能 readPixels。
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

  // 上传会改掉当前纹理绑定。先 flush，再丢掉 currentTexture，下一次 drawQuad 重新绑定。
  // shader_texture 在纹理 id 变化时同样先 rs_commit。
  createTexture(image: RgbaImage) {
    this.flush();
    const texture = new Texture(this.gl, image);
    this.textures.add(texture);
    this.currentTexture = null;
    return texture;
  }
  // 一张 pack 可以有多页纹理，quad.texture 是页号。原版用 texture_glid 取 GL 名字。
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

  // shader_clear。颜色是 0xAARRGGBB，与 render_clear 一样拆成通道再除以 255。
  // 视口按 CSS 尺寸乘 devicePixelRatio 设置，对应 screen_init 的 render_setviewport(0, 0, w*scale, h*scale)。
  // 清屏前关掉裁剪，避免上一帧的 scissor 留下。drawcall 计数对应 reset_drawcall_count。
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
  // 帧末 shader_flush。字库在这里丢掉上一帧没再用的纹理。
  end() {
    this.flush();
    this.fonts.endFrame();
  }
  // rs_commit。缓冲为空时不增加 drawcall，与 rs_commit 在 object == 0 时直接返回相同。
  flush() {
    if (this.batch.flush()) this.stats.drawCalls++;
  }

  // shader_draw。纹理或 program 与当前不同时先 flush，再 useProgram 并绑定纹理，
  // 对应 shader_texture 和 shader_program 里的 rs_commit。
  // 满 MAX_QUADS（原版 MAX_COMMBINE）再提交一次。混合不在这里比较，blend 自己先 flush。
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

  // sprite_drawquad。screen 角点已是逻辑像素，matrix.transform 变到世界坐标，NDC 留到 BatchBuffer。
  // 原版在这里做定点除以 1024，再 screen_trans。
  // src 是像素，除以纹理宽高得到 0..1。原版把 uv 存成 uint16，属性指针对 UNSIGNED_SHORT 做 normalized，相当于除以 65535。
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
  // 原版 label_draw 逐字查 dfont，并用 PROGRAM_TEXT。这里把整段文字画进一张纹理，贴到 label 的宽高上。
  // 缓存未命中会上传纹理，必须先 flush，并清掉 currentTexture，避免改掉已经排队的顶点绑定。
  label(
    data: LabelData,
    text: string,
    matrix: Matrix,
    color: number,
    additive: number,
  ) {
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
  // 调试用纯色矩形和 AABB 框，乘 1×1 白纹理，颜色走顶点 color。原版没有这组接口。
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
  // scissor_push / scissor_pop 在改裁剪前 shader_flush。
  // 逻辑矩形经 Screen.scissor 变成帧缓冲像素，再 gl.scissor，对应 render_setscissor。
  // 栈空时关掉 SCISSOR_TEST，对应 shader_scissortest(0)。
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
  // shader_blend。先 flush，再 gl.blendFunc。
  // 原版在因子不是默认 ONE / ONE_MINUS_SRC_ALPHA 时置 blendchange，随后由 shader_defaultblend 改回。
  blend(source: number, destination: number) {
    this.flush();
    this.gl.blendFunc(source, destination);
  }

  // shader_unload：释放字库、纹理、program 和顶点缓冲。
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
