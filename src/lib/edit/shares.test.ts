import { describe, expect, it } from 'vitest'
import { footageShares } from './shares'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('footageShares', () => {
  it('splits by how much footage there is, without letting a long clip take it all', () => {
    const [long, short] = footageShares([{ duration: 600 }, { duration: 10 }])
    expect(long + short).toBeCloseTo(1)
    expect(long).toBeGreaterThan(short)
    expect(short).toBeGreaterThan(0.1)
  })

  it('keeps the shares you set and splits the rest', () => {
    const shares = footageShares([{ duration: 30, share: 70 }, { duration: 30 }, { duration: 30 }])
    expect(shares[0]).toBeCloseTo(0.7)
    expect(shares[1]).toBeCloseTo(0.15)
    expect(shares[2]).toBeCloseTo(0.15)
  })

  it('scales shares that add up to something other than the whole edit', () => {
    expect(
      footageShares([
        { duration: 30, share: 30 },
        { duration: 30, share: 10 },
      ]),
    ).toEqual([0.75, 0.25].map((v) => expect.closeTo(v)))
    expect(sum(footageShares([{ duration: 30, share: 90 }, { duration: 30, share: 90 }, { duration: 5 }]))).toBeCloseTo(1)
  })

  it("doesn't give a clip more of the edit than it has footage for", () => {
    const [short, long] = footageShares([{ duration: 6, share: 60 }, { duration: 60 }], 30)
    expect(short).toBeCloseTo(0.2)
    expect(long).toBeCloseTo(0.8)
  })

  it('splits by what there is when there is too little footage altogether', () => {
    const shares = footageShares([{ duration: 4 }, { duration: 8 }], 30)
    expect(shares[0]).toBeCloseTo(1 / 3)
    expect(shares[1]).toBeCloseTo(2 / 3)
  })

  it('falls back to an even split when everything is set to nothing', () => {
    expect(
      footageShares([
        { duration: 30, share: 0 },
        { duration: 30, share: 0 },
      ]),
    ).toEqual([0.5, 0.5])
  })
})
