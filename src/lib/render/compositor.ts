// WebGL2 compositor: uploads up to two frames plus the caption layer and runs the edit shader.
// Used by the live preview (frames from <video> elements) and the exporter (frames decoded by
// WebCodecs), so both look identical.

import type { FrameFx } from '../edit/timeline'
import type { FitMode, Grade, TransitionType } from '../types'
import { FRAGMENT, VERTEX } from './shader'

export type FrameSource = TexImageSource

export interface LayerInput {
  source: FrameSource
  width: number
  height: number
  /** Where the action is, 0–1 from the top-left. */
  focusX: number
  focusY: number
  /** Extra zoom for this layer (slow push on stills), 1 = none. */
  zoom: number
}

export interface Look {
  grade: Grade
  grain: number
  vignette: number
  letterbox: boolean
  fit: FitMode
}

export interface RenderInput {
  a: LayerInput | null
  b: LayerInput | null
  transition: { type: TransitionType; progress: number } | null
  fx: FrameFx
  look: Look
  time: number
}

const TRANSITION_CODE: Record<TransitionType, number> = { cut: 0, fade: 1, flash: 2, zoom: 3, whip: 4, glitch: 5, dip: 6, spin: 7 }

interface GradeParams {
  contrast: number
  saturation: number
  lift: [number, number, number]
  shadow: [number, number, number]
  highlight: [number, number, number]
  mono: boolean
}

export const GRADES: Record<Grade, GradeParams & { name: string }> = {
  none: { name: 'Natural', contrast: 1, saturation: 1, lift: [0, 0, 0], shadow: [0, 0, 0], highlight: [0, 0, 0], mono: false },
  punch: {
    name: 'Punchy',
    contrast: 1.16,
    saturation: 1.28,
    lift: [0, 0, 0],
    shadow: [0, 0, 0.015],
    highlight: [0.02, 0.01, 0],
    mono: false,
  },
  'teal-orange': {
    name: 'Teal & orange',
    contrast: 1.12,
    saturation: 1.12,
    lift: [0, 0, 0],
    shadow: [-0.03, 0.04, 0.07],
    highlight: [0.07, 0.025, -0.04],
    mono: false,
  },
  mono: { name: 'Black & white', contrast: 1.32, saturation: 0, lift: [0, 0, 0], shadow: [0, 0, 0], highlight: [0, 0, 0], mono: true },
  warm: {
    name: 'Golden hour',
    contrast: 1.05,
    saturation: 1.08,
    lift: [0.01, 0.005, 0],
    shadow: [0.02, 0.005, -0.02],
    highlight: [0.06, 0.03, -0.03],
    mono: false,
  },
  cold: {
    name: 'Ice',
    contrast: 1.1,
    saturation: 0.9,
    lift: [0, 0, 0.01],
    shadow: [-0.02, 0.01, 0.05],
    highlight: [-0.02, 0.01, 0.04],
    mono: false,
  },
  vintage: {
    name: 'Faded film',
    contrast: 0.92,
    saturation: 0.78,
    lift: [0.07, 0.06, 0.05],
    shadow: [0.0, 0.03, 0.02],
    highlight: [0.06, 0.03, -0.02],
    mono: false,
  },
  neon: {
    name: 'Neon',
    contrast: 1.12,
    saturation: 1.55,
    lift: [0, 0, 0],
    shadow: [0.04, -0.02, 0.07],
    highlight: [0.02, 0.03, 0.05],
    mono: false,
  },
}

export class Compositor {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private textures: WebGLTexture[]
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private captionDirty = false
  private captionSource: TexImageSource | null = null

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    }) as WebGL2RenderingContext | null
    if (!gl) throw new Error('WebGL2 is not available in this browser.')
    this.gl = gl
    this.program = this.link()
    gl.useProgram(this.program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(this.program, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    this.textures = [0, 1, 2].map((unit) => {
      const tex = gl.createTexture()!
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
      return tex
    })
    gl.uniform1i(this.u('uA'), 0)
    gl.uniform1i(this.u('uB'), 1)
    gl.uniform1i(this.u('uCaption'), 2)
  }

  private link(): WebGLProgram {
    const gl = this.gl
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Shader link error: ${gl.getProgramInfoLog(p)}`)
    return p
  }

  private u(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    return this.uniforms.get(name)!
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  /** The caption layer (a transparent 2D canvas the size of the output). Pass null to clear it. */
  setCaption(source: TexImageSource | null) {
    this.captionSource = source
    this.captionDirty = true
  }

  private upload(unit: number, source: TexImageSource, flip: boolean, premultiply: boolean) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[unit])
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  render(input: RenderInput) {
    const gl = this.gl
    const { width, height } = this.canvas
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.program)
    gl.uniform2f(this.u('uOut'), width, height)

    const setLayer = (unit: number, layer: LayerInput | null, suffix: 'A' | 'B') => {
      gl.uniform1i(this.u(`uHas${suffix}`), layer ? 1 : 0)
      if (!layer) return
      this.upload(unit, layer.source, true, false)
      gl.uniform2f(this.u(`uSize${suffix}`), layer.width, layer.height)
      gl.uniform2f(this.u(`uFocus${suffix}`), layer.focusX, layer.focusY)
      gl.uniform1f(this.u(`uZoom${suffix}`), layer.zoom)
    }
    setLayer(0, input.a, 'A')
    setLayer(1, input.b, 'B')

    if (this.captionDirty) {
      if (this.captionSource) this.upload(2, this.captionSource, false, true)
      this.captionDirty = false
    }
    gl.uniform1i(this.u('uHasCaption'), this.captionSource ? 1 : 0)

    gl.uniform1i(this.u('uTrans'), input.transition ? TRANSITION_CODE[input.transition.type] : 0)
    gl.uniform1f(this.u('uProg'), input.transition?.progress ?? 0)
    const fx = input.fx
    gl.uniform2f(this.u('uShake'), fx.shakeX, fx.shakeY)
    gl.uniform1f(this.u('uRot'), fx.rotate)
    gl.uniform1f(this.u('uZoom'), fx.zoom)
    gl.uniform1f(this.u('uFlash'), fx.flash)
    gl.uniform1f(this.u('uRgb'), fx.rgb)
    gl.uniform1i(this.u('uFit'), input.look.fit === 'blur' ? 1 : 0)
    gl.uniform1f(this.u('uTime'), input.time)

    const g = GRADES[input.look.grade]
    gl.uniform1f(this.u('uContrast'), g.contrast)
    gl.uniform1f(this.u('uSaturation'), g.saturation)
    gl.uniform3f(this.u('uLift'), ...g.lift)
    gl.uniform3f(this.u('uShadowTint'), ...g.shadow)
    gl.uniform3f(this.u('uHighlightTint'), ...g.highlight)
    gl.uniform1i(this.u('uMono'), g.mono ? 1 : 0)
    gl.uniform1f(this.u('uGrain'), input.look.grain)
    gl.uniform1f(this.u('uVignette'), input.look.vignette)
    const aspect = width / height
    gl.uniform1f(this.u('uLetterbox'), input.look.letterbox ? (aspect >= 1 ? Math.max(0, (1 - aspect / 2.39) / 2) : 0.1) : 0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  dispose() {
    for (const t of this.textures) this.gl.deleteTexture(t)
    this.gl.deleteProgram(this.program)
  }
}
