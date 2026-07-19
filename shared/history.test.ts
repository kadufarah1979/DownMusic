import { describe, it, expect } from 'vitest'
import { nameKey, entryFromTrack, addToHistory, buildDownloadedIndex, isDownloaded } from './history'
import type { TrackMeta } from './types'

const track = (over: Partial<TrackMeta>): TrackMeta => ({
  id: '1',
  title: 'Get Lucky',
  artists: ['Daft Punk'],
  sourceId: 'spotify',
  sourceUrl: '',
  ...over
})

describe('nameKey', () => {
  it('combina artistas + titulo, sem acento/maiuscula', () => {
    expect(nameKey(track({ title: 'Canção', artists: ['Água'] }))).toBe(nameKey(track({ title: 'cancao', artists: ['agua'] })))
  })
})

describe('addToHistory', () => {
  const base = entryFromTrack(track({ isrc: 'ISRC1' }), '/x.mp3', '2026-07-19T00:00:00Z')

  it('adiciona faixa nova', () => {
    const out = addToHistory([], base)
    expect(out).toHaveLength(1)
  })

  it('dedup por ISRC (nao duplica; mantem a primeira)', () => {
    const dup = entryFromTrack(track({ isrc: 'ISRC1', title: 'Get Lucky (Radio Edit)' }), '/y.mp3', '2026-07-20T00:00:00Z')
    const out = addToHistory([base], dup)
    expect(out).toHaveLength(1)
    expect(out[0].outputPath).toBe('/x.mp3') // manteve a primeira
  })

  it('dedup por nameKey quando nao ha ISRC', () => {
    const a = entryFromTrack(track({ isrc: undefined }), '/a.mp3', '2026-07-19T00:00:00Z')
    const b = entryFromTrack(track({ isrc: undefined, sourceId: 'youtube' }), '/b.mp3', '2026-07-20T00:00:00Z')
    expect(addToHistory([a], b)).toHaveLength(1)
  })
})

describe('isDownloaded (via index)', () => {
  const entries = [entryFromTrack(track({ isrc: 'ISRC1' }), '/x.mp3', '2026-07-19T00:00:00Z')]
  const index = buildDownloadedIndex(entries)

  it('reconhece por ISRC (mesma musica, outra plataforma)', () => {
    expect(isDownloaded(track({ isrc: 'ISRC1', sourceId: 'deezer', id: '999' }), index)).toBe(true)
  })

  it('reconhece por artista+titulo quando nao ha ISRC', () => {
    expect(isDownloaded(track({ isrc: undefined, sourceId: 'youtube', id: 'yt1' }), index)).toBe(true)
  })

  it('nao marca faixa diferente', () => {
    expect(isDownloaded(track({ title: 'Instant Crush', artists: ['Daft Punk'], isrc: 'OTHER' }), index)).toBe(false)
  })
})
