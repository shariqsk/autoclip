import { describe, expect, it } from 'vitest'
import { beatWords, groupWords, parseLrc, parseSrt, toEditTime, toSrt } from './parse'

describe('caption parsing', () => {
  it('reads SRT and spreads the words', () => {
    const lines = parseSrt('1\n00:00:01,500 --> 00:00:03,000\nHello <i>there</i> world\n\n2\n00:00:04,000 --> 00:00:05,000\nAgain\n')
    expect(lines).toHaveLength(2)
    expect(lines[0].start).toBe(1.5)
    expect(lines[0].words.map((w) => w.text)).toEqual(['Hello', 'there', 'world'])
    expect(lines[0].words.at(-1)!.end).toBeCloseTo(3)
  })

  it('reads plain and word-timed LRC', () => {
    const plain = parseLrc('[ti:Song]\n[00:12.00]First line\n[00:15.50]Second line\n')
    expect(plain.map((l) => l.start)).toEqual([12, 15.5])
    expect(plain[0].end).toBe(15.5)
    const enhanced = parseLrc('[00:01.00]<00:01.00>One <00:01.50>two <00:02.20>three\n[00:04.00]x')
    expect(enhanced[0].words.map((w) => w.start)).toEqual([1, 1.5, 2.2])
  })

  it('groups word timestamps into short lines at pauses', () => {
    const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((text, i) => ({
      text,
      start: i * 0.3 + (i >= 3 ? 2 : 0),
      end: i * 0.3 + 0.25 + (i >= 3 ? 2 : 0),
    }))
    const lines = groupWords(words, 4)
    expect(lines.map((l) => l.words.length)).toEqual([3, 4, 1])
  })

  it('puts one word on each beat', () => {
    const lines = beatWords('WHO IS THE GOAT', [9, 10, 10.5, 11, 11.5, 12], 10)
    expect(lines.map((l) => l.start)).toEqual([10, 10.5, 11, 11.5])
  })

  it('moves captions onto the edit timeline and round-trips SRT', () => {
    const lines = parseSrt('1\n00:00:10,000 --> 00:00:12,000\nIn range\n\n2\n00:01:00,000 --> 00:01:02,000\nOut\n')
    const edit = toEditTime(lines, 9, 30)
    expect(edit).toHaveLength(1)
    expect(edit[0].start).toBe(1)
    expect(parseSrt(toSrt(edit))[0].end).toBe(3)
  })
})
