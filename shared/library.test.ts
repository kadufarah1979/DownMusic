import { describe, it, expect } from 'vitest'
import { qualityRank, type ScannedTrack } from './library'

const t = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/a.mp3', artists: [], hasCover: false, format: 'MP3', lossless: false, fileSize: 1, ...over
})

describe('qualityRank', () => {
  it('lossless supera qualquer lossy', () => {
    expect(qualityRank(t({ lossless: true, bitrate: 900 }))).toBeGreaterThan(qualityRank(t({ bitrate: 320 })))
  })
  it('entre lossy, maior bitrate vence', () => {
    expect(qualityRank(t({ bitrate: 320 }))).toBeGreaterThan(qualityRank(t({ bitrate: 128 })))
  })
  it('sem bitrate vale 0', () => {
    expect(qualityRank(t({}))).toBe(0)
  })
})
