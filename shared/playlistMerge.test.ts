import { describe, it, expect } from 'vitest'
import { overlapFraction, newTracksFrom, mergeCompleting } from './playlistMerge'
import type { TrackMeta } from './types'

const t = (title: string, over: Partial<TrackMeta> = {}): TrackMeta => ({
  id: title,
  title,
  artists: ['A'],
  sourceId: 'spotify',
  sourceUrl: '',
  ...over
})

describe('overlapFraction', () => {
  it('fracao das faixas de base presentes na candidata (por nome)', () => {
    const base = [t('X'), t('Y'), t('Z'), t('W')]
    const cand = [t('X', { sourceId: 'deezer' }), t('Y', { sourceId: 'deezer' }), t('Z', { sourceId: 'deezer' })]
    expect(overlapFraction(base, cand)).toBe(0.75)
  })
  it('casa por ISRC mesmo com titulo diferente', () => {
    const base = [t('Get Lucky', { isrc: 'I1' })]
    const cand = [t('Get Lucky (Radio Edit)', { isrc: 'I1', sourceId: 'deezer' })]
    expect(overlapFraction(base, cand)).toBe(1)
  })
  it('base vazia -> 0', () => {
    expect(overlapFraction([], [t('X')])).toBe(0)
  })
})

describe('newTracksFrom', () => {
  it('retorna so as faixas da candidata que nao estao na base', () => {
    const base = [t('X'), t('Y')]
    const cand = [t('X', { sourceId: 'deezer' }), t('Novo', { sourceId: 'deezer' })]
    const news = newTracksFrom(base, cand)
    expect(news.map((x) => x.title)).toEqual(['Novo'])
  })
})

describe('mergeCompleting', () => {
  it('base + extras da candidata (sem duplicar)', () => {
    const base = [t('X'), t('Y')]
    const cand = [t('X', { sourceId: 'deezer' }), t('Novo', { sourceId: 'deezer' })]
    const merged = mergeCompleting(base, cand)
    expect(merged.map((x) => x.title)).toEqual(['X', 'Y', 'Novo'])
    expect(merged[2].sourceId).toBe('deezer') // extra mantem a plataforma de origem
  })
})
