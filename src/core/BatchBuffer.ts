// 移植 lib/shader.c 里的动态合批，顶点布局对照 lib/renderbuffer.h 的 struct vertex。
//
// shader_init 预先建好一份索引缓冲和一份顶点缓冲，最多 MAX_COMMBINE（1024）个四边形。
// renderbuffer_add 往 RS->vb 里追加，rs_commit 上传已用部分并 glDrawElements，然后把 object 清零。
// renderbuffer_drawsprite 是另一条静态合批路径，会把整棵 sprite 烤进单独的缓冲，这里没有移植。
//
// 启动一次
//   indices --bufferData--> ibo
//   读取格式 --vertexAttribPointer--> vao（记住 vbo）
//
// 每次绘制
//   points / uv / color --addQuad--> CPU
//   CPU --bufferSubData--> vbo
//   bindVertexArray(vao)
//          |
//          v
//     drawElements
//          |
//          |  每 3 个索引一个三角形
//          |  索引 n --> vbo 偏移 n*24 --> 位置、UV、颜色、加色
//          v
//      顶点着色器
import { rgba } from "./Color";
import type { Point } from "./Matrix";
import type { Screen } from "./Screen";

export const MAX_QUADS = 1024;
// 每个顶点 24 字节：float2 位置、float2 UV、4 字节颜色、4 字节加色。
// C 的 struct vertex 是 20 字节，因为 tx、ty 是 uint16。这里的 UV 已是 0..1 的 float。
const STRIDE = 24;

export class BatchBuffer {
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly ibo: WebGLBuffer;
  private readonly memory = new ArrayBuffer(MAX_QUADS * 4 * STRIDE);
  private readonly floats = new Float32Array(this.memory);
  private readonly bytes = new Uint8Array(this.memory);
  count = 0;

  // 索引在启动时一次写完，顺序与 shader_init 相同：每个四边形 0,1,2, 0,2,3。
  // 顶点缓冲用 DYNAMIC_DRAW，每次 flush 只更新已用的前缀。
  // 颜色和加色是 UNSIGNED_BYTE 且 normalized，与 render.c 对 1 字节属性的处理相同。
  // C 的 texcoord 是 UNSIGNED_SHORT normalized（数值除以 65535）；这里改成 float，不再归一化。
  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly screen: Screen,
  ) {
    const vao = gl.createVertexArray(),
      vbo = gl.createBuffer(),
      ibo = gl.createBuffer();
    if (!vao || !vbo || !ibo)
      throw new Error("Cannot allocate WebGL batch buffers");
    this.vao = vao;
    this.vbo = vbo;
    this.ibo = ibo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.memory.byteLength, gl.DYNAMIC_DRAW);
    const indices = new Uint16Array(MAX_QUADS * 6);
    for (let i = 0; i < MAX_QUADS; i++)
      indices.set(
        [0, 1, 2, 0, 2, 3].map((n) => n + i * 4),
        i * 6,
      );
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    // 只把索引表上传到 GPU。STATIC_DRAW 表示这份数据之后不再改。这里不遍历索引，也不画。
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    // 把读取格式记进当前 vao，并记住此时绑着的 vbo。绘制时才按这个格式取字节：
    // 偏移 0 是位置 float2，8 是 UV float2，16 是颜色，20 是加色，每个顶点共 STRIDE 字节。
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20);
    for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
    // 解开当前顶点数组。上面的格式要等 flush 重新 bindVertexArray 才再生效。
    gl.bindVertexArray(null);
  }

  // renderbuffer_add。颜色 0xAARRGGBB 拆成 RGBA 写入，通道顺序与 C 相同。
  // 位置在这里换成最终 NDC。动态路径里，原版由调用方先做 screen_trans，缓冲里存的是左上 (0,0)、右下 (2,-2)。
  // 满 1024 个由 Renderer 检查 count 并 flush。C 在 object 达到 MAX_COMMBINE 时返回 1，shader_draw 接着 rs_commit。
  addQuad(
    points: readonly Point[],
    uv: readonly Point[],
    color: number,
    additive: number,
  ) {
    const c = rgba(color),
      a = rgba(additive);
    for (let i = 0; i < 4; i++) {
      const byte = (this.count * 4 + i) * STRIDE,
        float = byte / 4;
      const p = this.screen.ndc(...points[i]);
      this.floats.set([p[0], p[1], uv[i][0], uv[i][1]], float);
      this.bytes.set(c, byte + 16);
      this.bytes.set(a, byte + 20);
    }
    this.count++;
  }

  // rs_commit。上传 4 * count 个顶点，画 6 * count 个索引，然后把 count 清零。
  // 缓冲为空时返回 false，调用方不增加 drawcall。
  flush() {
    if (!this.count) return false;
    const gl = this.gl;
    // 恢复构造时记入 vao 的属性格式和索引缓冲 ibo。
    gl.bindVertexArray(this.vao);
    // ARRAY_BUFFER 绑定不在 vao 里。这一行让下面的 bufferSubData 写进 vbo；按索引取顶点不靠它。
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.bytes.subarray(0, this.count * 4 * STRIDE),
    );
    // 从索引缓冲偏移 0 读 count*6 个 uint16，每 3 个画一个三角形。
    // 索引 n 到 vbo 偏移 n*STRIDE 取一个顶点，按 vertexAttribPointer 拆开后交给顶点着色器。
    // 第一组 0,1,2 与下一组 0,2,3 共用顶点 0 和 2。
    gl.drawElements(gl.TRIANGLES, this.count * 6, gl.UNSIGNED_SHORT, 0);
    this.count = 0;
    return true;
  }

  dispose() {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteBuffer(this.ibo);
    this.gl.deleteVertexArray(this.vao);
  }
}
