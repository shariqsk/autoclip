// Put a separately downloaded picture and sound into one MP4, on disk. Packets are copied, never
// re-encoded, and read and written in small pieces, so a half-hour video never has to fit in memory.

import { ALL_FORMATS, EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource, FilePathSource, FilePathTarget, Input, Mp4OutputFormat, Output } from 'mediabunny'

export async function mergeFiles(videoPath, audioPath, outPath) {
  const vIn = new Input({ source: new FilePathSource(videoPath), formats: ALL_FORMATS })
  const aIn = new Input({ source: new FilePathSource(audioPath), formats: ALL_FORMATS })
  try {
    const vTrack = await vIn.getPrimaryVideoTrack()
    const aTrack = await aIn.getPrimaryAudioTrack()
    if (!vTrack) throw new Error('No video stream')
    const out = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(outPath) })
    const vSrc = new EncodedVideoPacketSource(await vTrack.getCodec())
    out.addVideoTrack(vSrc, { rotation: await vTrack.getRotation() })
    const aCodec = aTrack ? await aTrack.getCodec() : null
    const aSrc = aTrack && aCodec ? new EncodedAudioPacketSource(aCodec) : null
    if (aSrc) out.addAudioTrack(aSrc)
    await out.start()
    const copy = async (track, src) => {
      const config = await track.getDecoderConfig()
      let first = true
      for await (const packet of new EncodedPacketSink(track).packets()) {
        await src.add(packet, first && config ? { decoderConfig: config } : undefined)
        first = false
      }
      src.close()
    }
    await copy(vTrack, vSrc)
    if (aSrc) await copy(aTrack, aSrc)
    await out.finalize()
  } finally {
    vIn.dispose()
    aIn.dispose()
  }
}
