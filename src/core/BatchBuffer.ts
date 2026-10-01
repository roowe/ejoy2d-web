// Port of lib/renderbuffer.c and lib/shader.c: 1024 quads, one interleaved VBO and index buffer.
import { rgba } from "./Color";
import type { Point } from "./Matrix";
import type { Screen } from "./Screen";

export const MAX_QUADS = 1024;
const STRIDE = 24;

export class BatchBuffer {
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly ibo: WebGLBuffer;
  private readonly memory = new ArrayBuffer(MAX_QUADS * 4 * STRIDE);
  private readonly floats = new Float32Array(this.memory);
  private readonly bytes = new Uint8Array(this.memory);
  count = 0;

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
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20);
    for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
    gl.bindVertexArray(null);
  }

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

  flush() {
    if (!this.count) return false;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.bytes.subarray(0, this.count * 4 * STRIDE),
    );
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
