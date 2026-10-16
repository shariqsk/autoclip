// A small zip extractor (stored and deflated entries, from the central directory), enough for the
// yt-dlp release archives. Keeps Unix permissions so the executable stays executable.

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

export async function unzip(zipPath, destDir) {
  const buf = await readFile(zipPath)
  // End of central directory: the last 22+ bytes, signature 0x06054b50.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const root = path.resolve(destDir)
  const written = []

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip directory')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const external = buf.readUInt32LE(p + 38)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen

    const target = path.resolve(root, name)
    // Never write outside the destination ("zip slip").
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Unsafe path in zip: ${name}`)
    if (name.endsWith('/')) {
      await mkdir(target, { recursive: true })
      continue
    }
    const lName = buf.readUInt16LE(localOffset + 26)
    const lExtra = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + lName + lExtra
    const raw = buf.subarray(start, start + compSize)
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null
    if (!data) throw new Error(`Unsupported compression in ${name}`)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data)
    const mode = (external >>> 16) & 0o777
    if (mode && process.platform !== 'win32') await chmod(target, mode)
    written.push(name)
  }
  return written
}
