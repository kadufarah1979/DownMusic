import { describe, it, expect } from 'vitest'
import { findExtended, EXTENDED_SOURCES } from './extendedFinder'
import type { Resolver } from './resolver'
import type { SearchGroup, SourceId, TrackMeta } from '../../shared/types'

const track = (over: Partial<TrackMeta> & { id: string }): TrackMeta => ({
  title: 'Insomnia', artists: ['Faithless'], sourceId: 'youtube', sourceUrl: `u/${over.id}`, ...over
})

/** Resolver falso que registra a query e devolve grupos fixos por fonte. */
function fakeResolver(groups: Partial<Record<SourceId, SearchGroup>>) {
  const queries: string[] = []
  const resolver = {
    searchMany: async (query: string, sourceIds: SourceId[]): Promise<SearchGroup[]> => {
      queries.push(query)
      return sourceIds.map((sourceId) => groups[sourceId] ?? { sourceId, tracks: [] })
    }
  } as unknown as Resolver
  return { resolver, queries }
}

const original = track({ id: 'orig', durationSec: 200 })

describe('findExtended', () => {
  it('monta a query com artistas, titulo e o termo extended', async () => {
    const { resolver, queries } = fakeResolver({})
    await findExtended(resolver, original)
    expect(queries).toEqual(['Faithless Insomnia extended mix'])
  })

  it('consulta os quatro motores da aba Busca', async () => {
    let seen: SourceId[] = []
    const resolver = {
      searchMany: async (_q: string, ids: SourceId[]) => {
        seen = ids
        return ids.map((sourceId) => ({ sourceId, tracks: [] }))
      }
    } as unknown as Resolver

    await findExtended(resolver, original)
    expect(seen).toEqual(EXTENDED_SOURCES)
    expect(EXTENDED_SOURCES).toEqual(['spotify', 'deezer', 'youtube', 'soundcloud'])
  })

  it('devolve a melhor candidata de cada fonte', async () => {
    const { resolver } = fakeResolver({
      youtube: {
        sourceId: 'youtube',
        tracks: [
          track({ id: 'yt-radio', title: 'Insomnia (Radio Edit)', durationSec: 200, sourceId: 'youtube' }),
          track({ id: 'yt-ext', title: 'Insomnia (Extended Mix)', durationSec: 300, sourceId: 'youtube' })
        ]
      },
      soundcloud: {
        sourceId: 'soundcloud',
        tracks: [track({ id: 'sc-ext', title: 'Insomnia (Club Mix)', durationSec: 320, sourceId: 'soundcloud' })]
      }
    })

    const out = await findExtended(resolver, original)
    expect(out.youtube?.id).toBe('yt-ext')
    expect(out.soundcloud?.id).toBe('sc-ext')
  })

  it('omite a fonte sem candidata qualificada', async () => {
    const { resolver } = fakeResolver({
      deezer: {
        sourceId: 'deezer',
        // mesma faixa, sem palavra-chave: nao qualifica
        tracks: [track({ id: 'dz', durationSec: 400, sourceId: 'deezer' })]
      }
    })
    const out = await findExtended(resolver, original)
    expect(out.deezer).toBeUndefined()
    expect(Object.keys(out)).toEqual([])
  })

  it('descarta DJ set desproporcional mesmo com a palavra-chave', async () => {
    const { resolver } = fakeResolver({
      youtube: {
        sourceId: 'youtube',
        tracks: [track({ id: 'set', title: 'Insomnia (Extended Mix) - DJ Set', durationSec: 3600, sourceId: 'youtube' })]
      }
    })
    expect((await findExtended(resolver, original)).youtube).toBeUndefined()
  })

  it('fonte que falhou nao derruba as demais nem lanca', async () => {
    const { resolver } = fakeResolver({
      // searchMany isola por fonte: erro vira grupo vazio com `error`
      spotify: { sourceId: 'spotify', tracks: [], error: 'Spotify indisponivel' },
      youtube: {
        sourceId: 'youtube',
        tracks: [track({ id: 'yt-ext', title: 'Insomnia (Extended Mix)', durationSec: 300, sourceId: 'youtube' })]
      }
    })

    const out = await findExtended(resolver, original)
    expect(out.spotify).toBeUndefined()
    expect(out.youtube?.id).toBe('yt-ext')
  })

  it('sem duracao original a candidata ainda qualifica pelo nome', async () => {
    const { resolver } = fakeResolver({
      youtube: {
        sourceId: 'youtube',
        tracks: [track({ id: 'yt-ext', title: 'Insomnia (Extended Mix)', sourceId: 'youtube' })]
      }
    })
    const semDuracao = track({ id: 'orig' })
    expect((await findExtended(resolver, semDuracao)).youtube?.id).toBe('yt-ext')
  })

  it('faixa sem artistas nao gera espaco duplicado na query', async () => {
    const { resolver, queries } = fakeResolver({})
    await findExtended(resolver, track({ id: 'x', artists: [] }))
    expect(queries[0]).toBe('Insomnia extended mix')
  })
})
