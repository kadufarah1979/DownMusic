import { describe, it, expect } from 'vitest'
import { trackMatchesQuery } from './trackFilter'
import type { TrackMeta } from './types'

const t = (over: Partial<TrackMeta>): TrackMeta => ({
  id: '1',
  title: 'Get Lucky',
  artists: ['Daft Punk'],
  sourceId: 'spotify',
  sourceUrl: '',
  ...over
})

describe('trackMatchesQuery', () => {
  it('query vazia sempre casa', () => {
    expect(trackMatchesQuery(t({}), '')).toBe(true)
    expect(trackMatchesQuery(t({}), '   ')).toBe(true)
  })

  it('casa por titulo (case-insensitive, parcial)', () => {
    expect(trackMatchesQuery(t({ title: 'Get Lucky' }), 'lucky')).toBe(true)
    expect(trackMatchesQuery(t({ title: 'Get Lucky' }), 'GET')).toBe(true)
  })

  it('casa por artista', () => {
    expect(trackMatchesQuery(t({ artists: ['Daft Punk', 'Pharrell'] }), 'pharrell')).toBe(true)
  })

  it('ignora acentos (PT-BR)', () => {
    expect(trackMatchesQuery(t({ title: 'Canção' }), 'cancao')).toBe(true)
    expect(trackMatchesQuery(t({ title: 'Coração' }), 'coracao')).toBe(true)
  })

  it('nao casa quando nao ha correspondencia', () => {
    expect(trackMatchesQuery(t({ title: 'Get Lucky', artists: ['Daft Punk'] }), 'xyz')).toBe(false)
  })
})
