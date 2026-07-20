import { describe, it, expect } from 'vitest'
import { mergeMissing, LibraryService } from './library'
import type { ScannedTrack } from '../../shared/library'

const st = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/a.mp3', title: 'Song', artists: ['A'], hasCover: false, format: 'MP3', lossless: false, bitrate: 320, fileSize: 1, ...over
})

describe('mergeMissing', () => {
  it('preenche só os campos faltando, preservando os existentes', () => {
    const track = st({ genre: 'House', year: undefined, hasCover: false })
    const filled = mergeMissing(track, { genre: 'Techno', year: '2020', coverUrl: 'u' })
    expect(filled).toEqual({ year: '2020', coverUrl: 'u' }) // genre já existia → ignora; year e cover entram
  })
})

describe('LibraryService.enrichInputs', () => {
  it('só chama o enricher para faixas com buracos e mescla o que faltava', async () => {
    let calls = 0
    const enricher = { enrich: async () => { calls++; return { genre: 'House', year: '2020' } } } as any
    const svc = new LibraryService({} as any, {} as any, enricher, { home: '/home/x' })
    const inputs = await svc.enrichInputs([
      st({ path: '/full.mp3', genre: 'Pop', year: '1999', label: 'L', trackNumber: 1, hasCover: true }), // sem buracos
      st({ path: '/gap.mp3', genre: undefined, hasCover: true, year: undefined, label: 'L', trackNumber: 1 })
    ])
    expect(calls).toBe(1) // só /gap.mp3
    const gap = inputs.find((i) => i.track.path === '/gap.mp3')!
    expect(gap.filled).toEqual({ genre: 'House', year: '2020' })
  })
})
