// Port of lib/texture.c. PPM bytes remain unchanged; Canvas text is uploaded premultiplied.
import type { RgbaImage } from "./PpmLoader";

export class Texture {
  readonly handle: WebGLTexture;
  readonly width: number;
  readonly height: number;
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  dispose() {
    this.gl.deleteTexture(this.handle);
  }
}
