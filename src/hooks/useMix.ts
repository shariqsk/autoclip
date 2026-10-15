// Re-renders the soundtrack whenever the edit or the sound settings change. Offline rendering of a
// minute of audio takes a fraction of a second, so it's done eagerly and the preview always plays
// exactly what will be exported.

import { useEffect, useState } from 'react'
import { DEFAULT_MIX, renderMix } from '../lib/audio/mix'
import { decodeAudioFile } from '../lib/audio/decode'
import type { EditPlan } from '../lib/types'
import { voiceoverAt } from '../state/derive'
import { voiceKey } from '../state/actions'
import { useApp } from '../state/store'

const clipAudioCache = new Map<string, Promise<AudioBuffer | null>>()

function clipAudio(id: string, file: File): Promise<AudioBuffer | null> {
  let p = clipAudioCache.get(id)
  if (!p) {
    p = decodeAudioFile(file).catch(() => null)
    clipAudioCache.set(id, p)
  }
  return p
}

export function useMix(plan: EditPlan | null): AudioBuffer | null {
  const song = useApp((s) => s.song?.buffer ?? null)
  const settings = useApp((s) => s.settings)
  const voice = useApp((s) => s.voice)
  const clips = useApp((s) => s.clips)
  const currentVoiceKey = useApp(voiceKey)
  const [mix, setMix] = useState<AudioBuffer | null>(null)

  useEffect(() => {
    if (!plan || !song) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const clipBuffers = new Map<string, AudioBuffer>()
      if (settings.clipAudio !== 'off') {
        const used = new Set(plan.shots.map((s) => s.clipId))
        await Promise.all(
          clips
            .filter((c) => used.has(c.id) && c.kind === 'video')
            .map(async (c) => {
              const b = await clipAudio(c.id, c.file)
              if (b) clipBuffers.set(c.id, b)
            }),
        )
      }
      const vo = settings.voiceover
      const voiceovers =
        vo.enabled && voice && voice.key === currentVoiceKey
          ? [{ buffer: voice.buffer, at: voiceoverAt(plan, vo.placement, voice.buffer.duration) }]
          : []
      const out = await renderMix(song, plan, {
        ...DEFAULT_MIX,
        musicVolume: settings.musicVolume,
        sfx: settings.sfx,
        sfxVolume: settings.sfxVolume,
        clipAudio: settings.clipAudio,
        clipBuffers,
        voiceovers,
      })
      if (!cancelled) setMix(out)
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    plan,
    song,
    settings.musicVolume,
    settings.sfx,
    settings.sfxVolume,
    settings.clipAudio,
    settings.voiceover,
    voice,
    currentVoiceKey,
    clips,
  ])

  return plan && song ? mix : null
}
