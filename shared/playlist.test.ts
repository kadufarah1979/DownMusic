import { describe, it, expect } from 'vitest'
import { pickNewTracks } from './playlist'
import { entryFromTrack, buildDownloadedIndex } from './history'
import type { TrackMeta } from './types'

const t = (over: Partial<TrackMeta>): TrackMeta => ({
  id: '1',
  title: 'X',
  artists: ['A'],
  sourceId: 'spotify',
  sourceUrl: '',
  ...over
})

describe('pickNewTracks', () => {
  it('retorna so as faixas que nao estao no historico', () => {
    const downloaded = t({ title: 'Get Lucky', isrc: 'ISRC1' })
    const index = buildDownloadedIndex([entryFromTrack(downloaded, '/x.mp3', '2026-01-01T00:00:00Z')])

    const playlist = [
      t({ title: 'Get Lucky', isrc: 'ISRC1', sourceId: 'deezer', id: 'd1' }), // ja baixada (ISRC)
      t({ title: 'Nova A', isrc: 'ISRC2', id: 'n1' }),
      t({ title: 'Nova B', id: 'n2' })
    ]
    const novas = pickNewTracks(playlist, index)
    expect(novas.map((x) => x.title)).toEqual(['Nova A', 'Nova B'])
  })

  it('historico vazio -> todas sao novas', () => {
    const index = buildDownloadedIndex([])
    expect(pickNewTracks([t({ id: 'a' }), t({ id: 'b' })], index)).toHaveLength(2)
  })
})
