export const vertexShader = `
attribute vec3 aPos, aNrm;
attribute vec2 aUV;
uniform mat4 uProj, uView;
varying vec3 vNrm, vPos;
varying vec2 vUV;
void main() {
  vNrm = aNrm;
  vPos = aPos;
  vUV = aUV;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

export const fragmentShader = `
precision highp float;
varying vec3 vNrm, vPos;
varying vec2 vUV;
uniform vec3 uLight, uColor, uEye;
uniform sampler2D uTex;
uniform float uFace, uAlpha, uAmbient;
uniform bool uHasTex;

void main() {
  vec3 n = normalize(vNrm) * uFace;
  vec3 vd = normalize(uEye - vPos);

  float diff = max(dot(n, uLight), 0.0) * 0.55;
  float fill = max(dot(n, normalize(vec3(-0.5, 0.3, -0.6))), 0.0) * 0.18;
  float rim = pow(1.0 - max(dot(n, vd), 0.0), 3.0) * 0.15;
  vec3 hd = normalize(uLight + vd);
  float spec = pow(max(dot(n, hd), 0.0), 160.0) * 0.30;
  float spec2 = pow(max(dot(n, hd), 0.0), 32.0) * 0.08;
  float wrap = max(0.0, (dot(n, uLight) + 0.35) / 1.35) * 0.10;

  float light = uAmbient + diff + fill + rim + spec + spec2 + wrap;

  vec3 base = uColor;
  float alpha = uAlpha;
  if (uHasTex) {
    vec2 tc = vUV;
    if (uFace < 0.0) tc.x = 1.0 - tc.x;
    vec4 t = texture2D(uTex, tc);
    base = mix(base, t.rgb, t.a);
    alpha = mix(uAlpha, 1.0, t.a);
  }

  gl_FragColor = vec4(base * light, alpha);
}`;
