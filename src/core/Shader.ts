// Port of lib/shader.c program setup; shaders are checked at the WebGL API boundary.
import { fragmentShader, vertexShader, type Program } from './shaders';

export class Shader {
  readonly handle: WebGLProgram;
  constructor(private readonly gl: WebGL2RenderingContext, readonly name: Program) {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Cannot allocate WebGL shader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed: ${message}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertexShader);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShader(name));
    const program = gl.createProgram();
    if (!program) throw new Error('Cannot allocate WebGL program');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader link failed: ${message}`);
    }
    this.handle = program;
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
  }
  dispose() { this.gl.deleteProgram(this.handle); }
}
