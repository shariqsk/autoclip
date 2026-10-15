// What actually gets rendered: the active draft's plan with captions and effect intensity applied,
// the look (style defaults with your overrides), caption options and the audio mix settings.

import type { CaptionOptions } from '../lib/captions/render'
import { getStyle } from '../lib/edit/presets'
import type { Look } from '../lib/render/compositor'
import type { EditPlan } from '../lib/types'
import { captionsFor, type CaptionInputs } from './actions'
import type { Settings } from './settings'
import type { Draft } from './store'

export function lookFor(style: Draft['style'], s: Settings): Look {
  const base = getStyle(style).look
  return {
    grade: s.grade === 'style' ? base.grade : s.grade,
    grain: s.grain === 'style' ? base.grain : s.grain,
    vignette: s.vignette === 'style' ? base.vignette : s.vignette,
    letterbox: s.letterbox === 'style' ? base.letterbox : s.letterbox,
    fit: s.fit,
  }
}

export function captionOptionsFor(style: Draft['style'], s: Settings): CaptionOptions {
  const c = s.captions
  return { style: c.style === 'style' ? getStyle(style).captions : c.style, position: c.position, scale: c.scale, accent: c.accent }
}

export function renderPlan(d: Draft, state: CaptionInputs): EditPlan {
  const k = state.settings.intensity
  return {
    ...d.plan,
    captions: captionsFor(d, state),
    shots:
      k === 1
        ? d.plan.shots
        : d.plan.shots.map((shot) => ({
            ...shot,
            fx: {
              pulse: shot.fx.pulse * k,
              shake: shot.fx.shake * k,
              rgb: shot.fx.rgb * k,
              flash: Math.min(1, shot.fx.flash * k),
              push: shot.fx.push * Math.min(1.5, k),
            },
          })),
  }
}

/** When the voiceover plays, in edit seconds. "Drop" lines finish right as the first drop lands. */
export function voiceoverAt(plan: EditPlan, placement: 'intro' | 'drop', duration: number): number {
  if (placement === 'drop') {
    const drop = plan.hits.find((h) => h.kind === 'drop')
    if (drop) return Math.max(0.1, drop.time - duration - 0.08)
  }
  return 0.2
}
