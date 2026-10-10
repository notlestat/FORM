import { WebGLRenderer } from "pixi.js";
import { sample } from "./core";
import type { Params, Rect } from "./core";
import { rasterizeMask } from "./mask-raster";
const vertex = `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform sampler2D uPaintedMask;
uniform int uPainted;
uniform vec2 uSize;
uniform vec4 uRegion;
uniform vec2 uPixels;
uniform vec4 uSamples[64];
uniform int uCount;
uniform int uMode;
uniform int uMask;
uniform vec4 uEllipse;
uniform float uFeather;
uniform float uOpacity;
uniform vec2 uAnchor;
out vec4 outColor;
vec3 linearize(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 encode(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
void main(){
 vec2 world=uRegion.xy+vec2(gl_FragCoord.x/uPixels.x,1.0-gl_FragCoord.y/uPixels.y)*uRegion.zw;
 vec4 acc=vec4(0.0);float sum=0.0;
 for(int i=0;i<64;i++){if(i>=uCount)break;vec4 e=uSamples[i];float c=cos(e.z),s=sin(e.z);vec2 d=world-e.xy-uAnchor;
 vec2 q=vec2(c*d.x+s*d.y,-s*d.x+c*d.y)+uAnchor;
 vec2 uv=q/uSize;vec4 src=texture(uImage,clamp(uv,0.0,1.0));
 float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
 float mask=1.0;if(uMask==1){if(uPainted==1){mask=texture(uPaintedMask,clamp(uv,0.0,1.0)).a;}else{float distance=length((q-uEllipse.xy)/uEllipse.zw);mask=1.0-smoothstep(1.0-uFeather,1.0,distance);}}
 float a=src.a*mask*inside*e.w;vec4 v=vec4(linearize(src.rgb)*a,a);
 if(uMode==0)acc=v+acc*(1.0-v.a);else{acc+=v;sum+=e.w/max(uOpacity,.000001);}
 }
 if(uMode==1&&sum>0.0)acc/=sum;
 // Keep linear premultiplied accumulation in shader registers, encode only at output.
 // RGBA8 export stores straight alpha; the canvas context is explicitly non-premultiplied.
 outColor=vec4(acc.a>.000001?encode(acc.rgb/acc.a):vec3(0.0),acc.a);
}`;
export class AfterimageRenderer {
  pixi!: WebGLRenderer;
  gl!: WebGL2RenderingContext;
  program!: WebGLProgram;
  texture!: WebGLTexture;
  maskTexture!: WebGLTexture;
  maskKey = "";
  vao!: WebGLVertexArrayObject;
  canvas: HTMLCanvasElement;
  width = 1;
  height = 1;
  maxSize = 0;
  lost = false;
  uniforms = new Map<string, WebGLUniformLocation | null>();
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  async init() {
    this.pixi = new WebGLRenderer();
    await this.pixi.init({
      canvas: this.canvas,
      width: 1,
      height: 1,
      preferWebGLVersion: 2,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      backgroundAlpha: 0,
    });
    const gl = this.pixi.gl;
    if (!(gl instanceof WebGL2RenderingContext))
      throw Error("This experiment needs WebGL2.");
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s) || "Shader compilation failed");
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex),
      fs = compile(gl.FRAGMENT_SHADER, fragment);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(this.program) || "Shader link failed");
    this.texture = gl.createTexture()!;
    this.maskTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.vao = gl.createVertexArray()!;
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    return this;
  }
  upload(image: TexImageSource, width: number, height: number) {
    const g = this.gl;
    if (width > this.maxSize || height > this.maxSize)
      throw Error("Image exceeds this GPU texture limit.");
    this.width = width;
    this.height = height;
    this.maskKey = "";
    g.bindTexture(g.TEXTURE_2D, this.texture);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, 0);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, image);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  }
  u(name: string) {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }
  draw(p: Params, region: Rect, width: number, height: number) {
    if (this.lost)
      throw Error(
        "GPU context lost. Reload the experiment to restore rendering.",
      );
    const g = this.gl;
    const painted = p.mask && p.paintedMask?.enabled;
    if (painted) {
      const key = JSON.stringify([
        this.width,
        this.height,
        p.feather,
        p.paintedMask,
      ]);
      if (key !== this.maskKey) {
        const mask = rasterizeMask(
          p.paintedMask!,
          this.width,
          this.height,
          p.feather,
        );
        g.activeTexture(g.TEXTURE1);
        g.bindTexture(g.TEXTURE_2D, this.maskTexture);
        g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, 0);
        g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, mask);
        this.maskKey = key;
      }
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.bindVertexArray(this.vao);
    g.viewport(0, 0, width, height);
    g.disable(g.BLEND);
    g.disable(g.DEPTH_TEST);
    g.disable(g.SCISSOR_TEST);
    g.disable(g.STENCIL_TEST);
    g.colorMask(true, true, true, true);
    g.useProgram(this.program);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, this.texture);
    g.uniform1i(this.u("uImage"), 0);
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, this.maskTexture);
    g.uniform1i(this.u("uPaintedMask"), 1);
    g.uniform1i(this.u("uPainted"), painted ? 1 : 0);
    g.uniform2f(this.u("uSize"), this.width, this.height);
    g.uniform2f(this.u("uPixels"), width, height);
    g.uniform4f(
      this.u("uRegion"),
      region.x,
      region.y,
      region.width,
      region.height,
    );
    const es = sample(p),
      values = new Float32Array(256);
    es.forEach((e, i) => values.set([e.x, e.y, e.angle, e.weight], i * 4));
    g.uniform4fv(this.u("uSamples[0]"), values);
    g.uniform1i(this.u("uCount"), es.length);
    g.uniform1i(this.u("uMode"), p.mode === "ghosts" ? 0 : 1);
    g.uniform1i(this.u("uMask"), p.mask ? 1 : 0);
    g.uniform4f(
      this.u("uEllipse"),
      p.maskCenter.x,
      p.maskCenter.y,
      p.maskRadius.x,
      p.maskRadius.y,
    );
    g.uniform1f(this.u("uFeather"), p.feather);
    g.uniform1f(this.u("uOpacity"), p.opacity);
    g.uniform2f(this.u("uAnchor"), this.width / 2, this.height / 2);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }
  clear() {
    const g = this.gl;
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.disable(g.SCISSOR_TEST);
    g.colorMask(true, true, true, true);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
  }
  read(): Uint8Array {
    const g = this.gl,
      b = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    g.readPixels(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      g.RGBA,
      g.UNSIGNED_BYTE,
      b,
    );
    return b;
  }
  capabilities() {
    const g = this.gl;
    return {
      backend: "PixiJS 8.22 context + isolated WebGL2 kernel",
      userAgent: navigator.userAgent,
      webgl: g.getParameter(g.VERSION),
      renderer: g.getParameter(g.RENDERER),
      maxTextureSize: this.maxSize,
      maxRenderbufferSize: g.getParameter(g.MAX_RENDERBUFFER_SIZE),
      floatColorBuffer: !!g.getExtension("EXT_color_buffer_float"),
      floatBlend: !!g.getExtension("EXT_float_blend"),
      devicePixelRatio: devicePixelRatio,
      sourceDimensions: [this.width, this.height],
    };
  }
  destroy() {
    if (this.gl) {
      this.gl.deleteTexture(this.texture);
      this.gl.deleteTexture(this.maskTexture);
      this.gl.deleteProgram(this.program);
      this.gl.deleteVertexArray(this.vao);
    }
    this.pixi?.destroy();
  }
}
