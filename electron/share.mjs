// Copy a finished video to the clipboard as a file, the way Finder or Explorer copies one, so it can
// be pasted straight into Discord, a chat or a folder. The file is kept in a temp folder (only the
// latest few) because a pasted file reference has to point at something real.

import { execFile } from 'node:child_process'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { clipboard } from 'electron'

const DIR = path.join(os.tmpdir(), 'AutoClip-copies')
const KEEP = 3

const run = (cmd, args) =>
  new Promise((resolve, reject) => execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err) => (err ? reject(err) : resolve())))

/** A file name that's safe on every platform. */
export function safeFileName(name) {
  const base = [...String(name)]
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/^[.\s-]+|[.\s]+$/g, '')
    .slice(0, 80)
  return (base || 'edit') + (base.toLowerCase().endsWith('.mp4') ? '' : '.mp4')
}

async function prune() {
  const names = await readdir(DIR).catch(() => [])
  const files = await Promise.all(names.map(async (n) => ({ n, t: (await stat(path.join(DIR, n)).catch(() => null))?.mtimeMs ?? 0 })))
  files.sort((a, b) => b.t - a.t)
  await Promise.all(files.slice(KEEP).map((f) => rm(path.join(DIR, f.n), { force: true })))
}

export async function copyVideoToClipboard(bytes, name) {
  await mkdir(DIR, { recursive: true })
  const file = path.join(DIR, safeFileName(name))
  await writeFile(file, bytes)
  await prune()
  if (process.platform === 'darwin') {
    // The same file reference Finder puts on the clipboard; AppleScript gets the details right.
    await run('osascript', ['-e', `set the clipboard to (POSIX file ${JSON.stringify(file)})`])
  } else if (process.platform === 'win32') {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -LiteralPath '${file.replace(/'/g, "''")}'`])
  } else {
    clipboard.writeBuffer('text/uri-list', Buffer.from(`${pathToFileURL(file).href}\r\n`))
  }
  return file
}
