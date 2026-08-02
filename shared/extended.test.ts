import { describe, it, expect } from 'vitest'
import {
  isExtendedTitle,
  titleMatches,
  scoreExtendedCandidate,
  pickBestPerSource,
  isDurationVerified
} from './extended'
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
  it('rejeita candidata marginalmente mais longa', () => {
    // +3s sobre 200s: nem 20% mais longa, nem 60s a mais
    expect(scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 203 }))).toBe(0)
  })
  it('aceita extended típica (1.5x)', () => {
    expect(scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 300 }))).toBeGreaterThan(0)
  })
  it('aceita faixa longa que ganha 60s sem chegar a 1,2x', () => {
    const longInput = { originalTitle: 'Insomnia', originalDurationSec: 600 }
    // 665s = 1,108x, mas +65s
    expect(scoreExtendedCandidate(longInput, track({ title: 'Insomnia (Extended Mix)', durationSec: 665 }))).toBeGreaterThan(0)
    // 630s = +30s, abaixo do piso absoluto e do proporcional
    expect(scoreExtendedCandidate(longInput, track({ title: 'Insomnia (Extended Mix)', durationSec: 630 }))).toBe(0)
  })
  it('rejeita DJ set desproporcional (4x)', () => {
    expect(scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 800 }))).toBe(0)
  })
  it('pontuação tem pico e deixa de crescer com a duração', () => {
    const peak = scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 300 })) // 1,5x
    const longer = scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 500 })) // 2,5x
    expect(peak).toBeGreaterThan(longer)
    expect(longer).toBeGreaterThan(0)
  })
  it('sem duração original: qualifica pelo nome, sem bônus de duração', () => {
    const noDur = { originalTitle: 'Insomnia' }
    const s = scoreExtendedCandidate(noDur, track({ title: 'Insomnia (Extended Mix)', durationSec: 360 }))
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 300 })))
  })
  it('sem duração no candidato: qualifica pelo nome, sem bônus de duração', () => {
    const s = scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)' }))
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(scoreExtendedCandidate(input, track({ title: 'Insomnia (Extended Mix)', durationSec: 300 })))
  })
})

describe('isDurationVerified', () => {
  it('só é verificada quando as duas durações existem', () => {
    const cand = track({ title: 'Insomnia (Extended Mix)', durationSec: 300 })
    expect(isDurationVerified({ originalTitle: 'Insomnia', originalDurationSec: 200 }, cand)).toBe(true)
    expect(isDurationVerified({ originalTitle: 'Insomnia' }, cand)).toBe(false)
    expect(isDurationVerified(
      { originalTitle: 'Insomnia', originalDurationSec: 200 },
      track({ title: 'Insomnia (Extended Mix)' })
    )).toBe(false)
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
  it('no empate entre candidatas mantém a primeira da lista', () => {
    // 280s (1,4x) e 360s (1,8x) ficam equidistantes do pico e empatam
    const input = { originalTitle: 'Insomnia', originalDurationSec: 200 }
    const a = track({ id: 'yt1', title: 'Insomnia (Extended Mix)', durationSec: 280, sourceId: 'youtube' })
    const b = track({ id: 'yt2', title: 'Insomnia (Extended Mix)', durationSec: 360, sourceId: 'youtube' })
    expect(scoreExtendedCandidate(input, a)).toBe(scoreExtendedCandidate(input, b))
    expect(pickBestPerSource(input, [{ sourceId: 'youtube' as const, tracks: [a, b] }]).youtube?.id).toBe('yt1')
  })
})
