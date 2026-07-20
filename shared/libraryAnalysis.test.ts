import { describe, it, expect } from 'vitest'
import { findDuplicates, analyzeLibrary } from './libraryAnalysis'
import type { ScannedTrack } from './library'

const t = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/a.mp3', title: 'Song', artists: ['A'], hasCover: true, format: 'MP3', lossless: false, bitrate: 320, fileSize: 1, ...over
})

describe('findDuplicates', () => {
  it('agrupa por ISRC e mantém a de maior qualidade', () => {
    const g = findDuplicates([
      t({ path: '/lo.mp3', isrc: 'X', bitrate: 128 }),
      t({ path: '/hi.mp3', isrc: 'X', bitrate: 320 })
    ])
    expect(g).toHaveLength(1)
    expect(g[0].keeper).toBe('/hi.mp3')
    expect(g[0].others).toEqual(['/lo.mp3'])
  })
  it('sem ISRC, agrupa por artista+título normalizado', () => {
    const g = findDuplicates([
      t({ path: '/1.mp3', title: 'One More Time', artists: ['Daft Punk'] }),
      t({ path: '/2.mp3', title: 'one more time', artists: ['daft punk'], bitrate: 128 })
    ])
    expect(g).toHaveLength(1)
    expect(g[0].keeper).toBe('/1.mp3')
  })
  it('não agrupa faixas não identificadas (sem título)', () => {
    expect(findDuplicates([t({ path: '/1', title: undefined }), t({ path: '/2', title: undefined })])).toEqual([])
  })
})

describe('analyzeLibrary', () => {
  it('conta faltantes, baixa qualidade, não identificados e gêneros', () => {
    const r = analyzeLibrary([
      t({ path: '/1.mp3', genre: 'House', hasCover: true, bitrate: 320 }),
      t({ path: '/2.mp3', genre: undefined, hasCover: false, bitrate: 128 }),
      t({ path: '/3.mp3', title: undefined, artists: [] })
    ])
    expect(r.total).toBe(3)
    expect(r.missingGenre).toBe(2) // /2 e /3
    expect(r.missingCover).toBe(1) // /2
    expect(r.lowQuality).toBe(1) // /2 (128 < 256)
    expect(r.unidentified).toBe(1) // /3
    expect(r.genres.find((g) => g.genre === 'House')?.count).toBe(1)
  })
})
