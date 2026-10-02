// 移植 lib/texture.c 的 texture_load 和 lib/render/render.c 的 render_texture_update。
//
// 原版按整数 id 放进纹理池，并保存 width、height、invw、invh。
// 这里没有 id 池，对象自己就是纹理；宽高留给 Renderer 做 UV（像素除以宽高）。
// texture_coord 会再乘 65535 存成 uint16，本项目的 UV 直接用 0..1 的 float。
// 渲染目标 texture_new_rt 和降采样没有移植。
import type { RgbaImage } from "./PpmLoader";

export class Texture {
  readonly handle: WebGLTexture;
  readonly width: number;
  readonly height: number;
  // PPM 字节原样上传，不预乘 alpha。Canvas 文字在上传时预乘，以配合 ONE, ONE_MINUS_SRC_ALPHA。
  constructor(
    private readonly gl: WebGL2RenderingContext,
    source: RgbaImage | HTMLCanvasElement,
  ) {
    const handle = gl.createTexture();
    if (!handle) throw new Error("Cannot allocate WebGL texture");
    this.handle = handle;
    this.width = source.width;
    this.height = source.height;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (this.width > maxSize || this.height > maxSize)
      throw new Error(`Texture exceeds ${maxSize}px GPU limit`);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    // 1 字节对齐，与 render_texture_update 的 UNPACK_ALIGNMENT 相同。
    // 不翻转 Y：图像第一行是顶部，和 ejoy2d 的左上原点一致。
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if ("pixels" in source) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        source.width,
        source.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source.pixels,
      );
    } else {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    // texture_load 创建时不开 mipmap，过滤为 LINEAR。WRAP 夹到边缘，对应 CLAMP_TO_EDGE。
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // texture_unload。
  dispose() {
    this.gl.deleteTexture(this.handle);
  }
}
