// A style in plain words: the handful of things you'll actually see, read straight from its playbook so
// the description can't drift from what the editor does.

import { CAPTION_STYLES } from '../captions/render'
import { GRADES } from '../render/compositor'
import type { StylePreset } from './presets'

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

export function styleFeatures(p: StylePreset): string[] {
  const out: string[] = []
  const pace = mean(p.flurry.choices)
  if (pace <= 1.4) out.push('Fast cuts')
  else if (pace >= 3) out.push('Long takes')
  if (p.intro.mono >= 0.5) out.push('Black & white intro')
  if (p.hero.speed.kind === 'freeze') out.push('Freeze on the drop')
  else if (p.hero.speed.kind === 'velocity' || p.velocity) out.push('Speed ramps')
  else if (p.hero.speed.kind === 'constant' && p.hero.speed.speed < 1) out.push('Slow-mo drop')
  if (p.titleBehind) out.push('Title behind people')
  if (p.look.leaks) out.push('Light leaks')
  if ((p.look.glow ?? 0) >= 0.3) out.push('Glow')
  if (p.look.blur) out.push('Motion blur')
  const transitions = [p.intro, p.hero, p.flurry, p.ride].flatMap((x) => Object.keys(x.transition))
  if (p.collage) out.push('Collage intro')
  else if (transitions.includes('panels')) out.push('Picture in picture')
  if (transitions.includes('glitch')) out.push('Glitch cuts')
  if (transitions.includes('whip')) out.push('Whip pans')
  if (p.fx.shake >= 0.5) out.push('Hard shakes')
  if (p.fx.rgb >= 0.4) out.push('RGB split')
  if (p.look.letterbox) out.push('Cinema bars')
  if (p.look.fit === 'bars') out.push('Whole shot on black')
  out.push(`${GRADES[p.look.grade].name} grade`)
  out.push(`${CAPTION_STYLES.find((c) => c.id === p.captions)?.name ?? 'Plain'} captions`)
  return out
}
