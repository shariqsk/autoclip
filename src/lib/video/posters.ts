// Poster frames from a video at chosen times, on the main thread: one hidden <video>, seeked in turn,
// each frame drawn small and kept as a JPEG blob URL.

export async function grabPosters(url: string, times: number[], width = 320): Promise<string[]> {
  const v = document.createElement('video')
  v.muted = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((ok, fail) => {
    v.onloadeddata = () => ok()
    v.onerror = () => fail(new Error("Couldn't open the video"))
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(2, Math.round((v.videoHeight / v.videoWidth) * width))
  const ctx = canvas.getContext('2d')!
  const out: string[] = []
  for (const t of times) {
    await new Promise<void>((ok) => {
      const done = () => {
        v.removeEventListener('seeked', done)
        ok()
      }
      v.addEventListener('seeked', done)
      v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05))
    })
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.8))
    out.push(blob ? URL.createObjectURL(blob) : '')
  }
  v.removeAttribute('src')
  v.load()
  return out
}

/** Square portraits of faces (boxes are frame fractions), with some room around each face. */
export async function grabFaces(url: string, faces: { t: number; box: [number, number, number, number] }[], size = 160): Promise<string[]> {
  const v = document.createElement('video')
  v.muted = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((ok, fail) => {
    v.onloadeddata = () => ok()
    v.onerror = () => fail(new Error("Couldn't open the video"))
  })
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const out: string[] = []
  for (const f of faces) {
    await new Promise<void>((ok) => {
      const done = () => {
        v.removeEventListener('seeked', done)
        ok()
      }
      v.addEventListener('seeked', done)
      v.currentTime = Math.min(Math.max(0, f.t), Math.max(0, v.duration - 0.05))
    })
    const [x, y, w, h] = f.box
    const W = v.videoWidth
    const H = v.videoHeight
    const side = Math.min(W, H, Math.max(w * W, h * H) * 1.7)
    const cx = (x + w / 2) * W
    const cy = (y + h / 2) * H
    const sx = Math.min(W - side, Math.max(0, cx - side / 2))
    const sy = Math.min(H - side, Math.max(0, cy - side / 2))
    ctx.drawImage(v, sx, sy, side, side, 0, 0, size, size)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85))
    out.push(blob ? URL.createObjectURL(blob) : '')
  }
  v.removeAttribute('src')
  v.load()
  return out
}
