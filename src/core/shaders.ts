// Port of ejoy2d/shader.lua; CPU supplies final NDC, so there is no second position offset.
export type Program = 'normal' | 'gray' | 'color';
export const vertexShader = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
layout(location=1) in vec2 aTexCoord;
layout(location=2) in vec4 aColor;
layout(location=3) in vec4 aAdditive;
out vec2 vTexCoord;
out vec4 vColor;
out vec4 vAdditive;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord = aTexCoord;
  vColor = aColor;
  vAdditive = aAdditive;
}`;

export function fragmentShader(program: Program) {
  const output = {
    normal: 'outColor = c;',
    gray: 'outColor = vec4(vec3(dot(c.rgb, vec3(0.299, 0.587, 0.114))), c.a);',
    color: 'outColor = vec4(vColor.rgb * tex.a, tex.a);',
  }[program];
  return `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vTexCoord;
in vec4 vColor;
in vec4 vAdditive;
out vec4 outColor;
void main() {
  vec4 tex = texture(uTexture, vTexCoord);
  vec4 c = vec4(tex.rgb * vColor.rgb * vColor.a + vAdditive.rgb * tex.a, tex.a * vColor.a);
  ${output}
}`;
}
