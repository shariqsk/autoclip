import { describe, expect, it } from 'vitest'
import { autoSlots, whenLabel } from './schedule'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()

describe('autoSlots', () => {
  it('spreads posts over lunchtime and evening slots, starting with the next one', () => {
    expect(autoSlots(3, at(16, 10))).toEqual([at(16, 12), at(16, 19), at(17, 12)])
    expect(autoSlots(2, at(16, 20))).toEqual([at(17, 12), at(17, 19)])
  })

  it('leaves a little lead time and skips slots already taken', () => {
    expect(autoSlots(1, at(16, 11, 50))).toEqual([at(16, 19)])
    expect(autoSlots(2, at(16, 10), { taken: [at(16, 12)] })).toEqual([at(16, 19), at(17, 12)])
  })

  it('labels times the way people say them', () => {
    expect(whenLabel(at(16, 19), at(16, 10))).toMatch(/^Today /)
    expect(whenLabel(at(17, 12), at(16, 10))).toMatch(/^Tomorrow /)
  })
})
