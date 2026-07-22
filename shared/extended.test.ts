import { describe, it, expect } from 'vitest'
import { isExtendedTitle, titleMatches, scoreExtendedCandidate, pickBestPerSource } from './extended'
import type { TrackMeta } from './types'

const track = (over: Partial<TrackMeta>): TrackMeta => ({
  id: 'x', title: '', artists: ['A'], sourceId: 'youtube', sourceUrl: 'u', ...over
})

describe('isExtendedTitle', () => {
  it('detecta variações de extended/club mix', () => {
    expect(isExtendedTitle('Song (Extended Mix)')).toBe(true)
    expect(isExtendedTitle('Song - Club Mix')).toBe(true)
    expect(isExtendedTitle('Song (Extended Version)')).toBe(true)
    expect(isExtendedTitle('Song (Radio Edit)')).toBe(false)
    expect(isExtendedTitle('Song')).toBe(false)
  })
})

describe('titleMatches', () => {
  it('aceita candidato que contém o título original', () => {
    expect(titleMatches('Get Lucky', 'Get Lucky (Extended Mix)')).toBe(true)
    expect(titleMatches('Insomnia', 'Insomnia - Extended')).toBe(true)
  })
  it('rejeita faixa diferente', () => {
    expect(titleMatches('Get Lucky', 'Lucky Star (Extended)')).toBe(false)
  })
  it('ignora acentos', () => {
    expect(titleMatches('Coração', 'Coracao (Extended Mix)')).toBe(true)
  })
})

describe('scoreExtendedCandidate', () => {
  const input = { originalTitle: 'Insomnia', originalDurationSec: 200 }
  it('pontua positivo quando extended, relevante e mais longa', () => {
    expect(scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 360 }))).toBeGreaterThan(0)
  })
  it('rejeita quando não é mais longa que a original', () => {
    expect(scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 190 }))).toBe(0)
  })
  it('rejeita sem palavra-chave', () => {
    expect(scoreExtendedCandidate(input, track({ title: 'Insomnia (Radio Edit)', durationSec: 360 }))).toBe(0)
  })
  it('rejeita faixa diferente', () => {
    expect(scoreExtendedCandidate(input, track({ title: 'Other Song (Extended Mix)', durationSec: 360 }))).toBe(0)
  })
  it('quanto mais longa, maior a pontuação', () => {
    const a = scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 260 }))
    const b = scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 420 }))
    expect(b).toBeGreaterThan(a)
  })
})

describe('pickBestPerSource', () => {
  it('escolhe a melhor qualificada de cada fonte e omite as sem candidata', () => {
    const groups = [
      { sourceId: 'youtube' as const, tracks: [
        track({ id: 'yt1', title: 'Insomnia (Radio Edit)', durationSec: 200, sourceId: 'youtube' }),
        track({ id: 'yt2', title: 'Insomnia (Extended Mix)', durationSec: 380, sourceId: 'youtube' })
      ]},
      { sourceId: 'soundcloud' as const, tracks: [
        track({ id: 'sc1', title: 'Insomnia (Club Mix)', durationSec: 300, sourceId: 'soundcloud' })
      ]},
      { sourceId: 'deezer' as const, tracks: [
        track({ id: 'dz1', title: 'Insomnia', durationSec: 200, sourceId: 'deezer' }) // sem keyword
      ]}
    ]
    const best = pickBestPerSource({ originalTitle: 'Insomnia', originalDurationSec: 200 }, groups)
    expect(best.youtube?.id).toBe('yt2')
    expect(best.soundcloud?.id).toBe('sc1')
    expect(best.deezer).toBeUndefined()
  })
})
