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
