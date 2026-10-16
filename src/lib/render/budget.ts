// Fitting an export under a file-size limit (Discord's, for one): how much bitrate the picture can
// have once the sound is paid for, and whether a smaller frame would look better at that rate.

export interface SizeBudget {
  /** Video bitrate, Mbps. */
  videoMbps: number
  /** Audio bitrate, kbps. */
  audioKbps: number
  /** The short side to render at (lowered when the bitrate is too thin for the asked one). */
  shortSide: number
}

/** Container overhead and encoder overshoot: aim this far under the limit. */
const MARGIN = 0.92
/** Below this many bits per pixel per frame, 1080p looks smeared; 720p at the same rate looks clean. */
const MIN_BPP = 0.045

export function fitToSize(opts: {
  limitMb: number
  seconds: number
  width: number
  height: number
  fps: number
  /** The bitrate the chosen quality would use with no limit; never exceeded. */
  wantMbps: number
}): SizeBudget {
  const { limitMb, seconds, width, height, fps, wantMbps } = opts
  const audioKbps = 128
  const totalMbps = (limitMb * 8 * MARGIN) / Math.max(1, seconds)
  const videoMbps = Math.max(0.3, Math.min(wantMbps, totalMbps - audioKbps / 1000))
  const short = Math.min(width, height)
  const bpp = (videoMbps * 1e6) / (width * height * fps)
  const shortSide = short > 720 && bpp < MIN_BPP ? 720 : short
  return { videoMbps: Math.round(videoMbps * 100) / 100, audioKbps, shortSide }
}

/** A bitrate to retry with after a file came out too big. */
export function shrinkFor(videoMbps: number, gotBytes: number, limitBytes: number): number {
  return Math.max(0.25, Math.round(videoMbps * (limitBytes / gotBytes) * 0.94 * 100) / 100)
}
