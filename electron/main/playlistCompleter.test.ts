import { describe, it, expect } from 'vitest'
import { PlaylistCompleter } from './playlistCompleter'
import type { TrackMeta } from '../../shared/types'

const t = (title: string, over: Partial<TrackMeta> = {}): TrackMeta => ({
  id: title,
  title,
  artists: ['A'],
  sourceId: 'spotify',
  sourceUrl: '',
  ...over
})

// base do Spotify: 4 faixas (com nome de playlist, senao nao ha o que buscar)
const BASE = [t('A', { playlist: 'Meu set' }), t('B'), t('C'), t('D')]

function completer(opts: {
  candTracks: TrackMeta[]
  deezerCandidates?: { url: string; title: string; trackCount: number }[]
}) {
  const resolver = {
    async resolve(url: string) {
      return url.includes('deezer') ? opts.candTracks : BASE
    }
  } as any
  const deezer = {
    async searchPlaylists() {
      return opts.deezerCandidates ?? [{ url: 'https://www.deezer.com/playlist/1', title: 'Cand', trackCount: 5 }]
    },
    async resolveUrl() {
      return opts.candTracks
    }
  } as any
  const ytdlp = { async searchPlaylists() { return [] }, async dumpFlat() { return [] } } as any
  return new PlaylistCompleter(resolver, deezer, ytdlp)
}

describe('PlaylistCompleter.findCompletions', () => {
  it('aceita candidata com overlap alto e retorna as faixas extras', async () => {
    // candidata: A,B,C,D (mesmas) + E,F (novas) -> overlap 100%, +2
    const cand = [
      t('A', { sourceId: 'deezer' }), t('B', { sourceId: 'deezer' }), t('C', { sourceId: 'deezer' }),
      t('D', { sourceId: 'deezer' }), t('E', { sourceId: 'deezer' }), t('F', { sourceId: 'deezer' })
    ]
    const c = completer({ candTracks: cand })
    const [res] = await c.findCompletions('https://open.spotify.com/playlist/x')
    expect(res.platform).toBe('deezer')
    expect(res.overlapPct).toBe(100)
    expect(res.addedCount).toBe(2)
    expect(res.extras.map((x) => x.title)).toEqual(['E', 'F'])
  })

  it('descarta candidata com baixa sobreposicao (trava anti-erro)', async () => {
    // candidata: so 1 das 4 bate (25% < 60%) -> descartada
    const cand = [t('A', { sourceId: 'deezer' }), t('Z1', { sourceId: 'deezer' }), t('Z2', { sourceId: 'deezer' })]
    const c = completer({ candTracks: cand })
    expect(await c.findCompletions('https://open.spotify.com/playlist/x')).toHaveLength(0)
  })

  it('sem faixas novas -> nao sugere', async () => {
    const cand = BASE.map((x) => ({ ...x, sourceId: 'deezer' as const }))
    const c = completer({ candTracks: cand })
    expect(await c.findCompletions('https://open.spotify.com/playlist/x')).toHaveLength(0)
  })
})
