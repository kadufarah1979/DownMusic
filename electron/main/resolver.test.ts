import { describe, it, expect } from 'vitest'
import { Resolver } from './resolver'
import { renderTemplate, outputExtension } from './tagger'
import type { Source } from '../sources/types'
import type { TrackMeta } from '../../shared/types'

function fakeSource(id: Source['id'], re: RegExp): Source {
  return {
    id,
    matches: (u) => re.test(u),
    search: async () => [],
    resolve: async (u) => [{ id: u, title: 't', artists: [], sourceId: id, sourceUrl: u }],
    fetchAudio: async () => ({ rawPath: '' })
  }
}

describe('Resolver', () => {
  const sources = [
    fakeSource('spotify', /open\.spotify\.com/),
    fakeSource('youtube', /youtube\.com|youtu\.be/)
  ]
  const resolver = new Resolver(sources)

  it('roteia URL do Spotify para a fonte spotify', async () => {
    const [t] = await resolver.resolve('https://open.spotify.com/track/123')
    expect(t.sourceId).toBe('spotify')
  })

  it('roteia URL do YouTube para a fonte youtube', async () => {
    const [t] = await resolver.resolve('https://youtu.be/abc')
    expect(t.sourceId).toBe('youtube')
  })

  it('lanca erro para URL nao reconhecida', async () => {
    await expect(resolver.resolve('https://exemplo.com/x')).rejects.toThrow(/Nenhuma fonte/)
  })
})

describe('Resolver.searchMany', () => {
  const track = (id: string): TrackMeta => ({ id, title: id, artists: [], sourceId: 'spotify', sourceUrl: '' })

  function searchSource(id: Source['id'], fn: () => Promise<TrackMeta[]>): Source {
    return { id, matches: () => false, search: fn, resolve: async () => [], fetchAudio: async () => ({ rawPath: '' }) }
  }

  it('busca em paralelo, preserva a ordem pedida e agrupa por fonte', async () => {
    const resolver = new Resolver([
      searchSource('spotify', async () => [track('s1')]),
      searchSource('youtube', async () => [track('y1')])
    ])
    const groups = await resolver.searchMany('q', ['youtube', 'spotify'])
    expect(groups.map((g) => g.sourceId)).toEqual(['youtube', 'spotify']) // ordem pedida
    expect(groups[1].tracks.map((t) => t.id)).toEqual(['s1'])
  })

  it('isola erro por fonte: uma falhando nao derruba as outras', async () => {
    const resolver = new Resolver([
      searchSource('spotify', async () => {
        throw new Error('credenciais ausentes')
      }),
      searchSource('deezer', async () => [track('d1')])
    ])
    const groups = await resolver.searchMany('q', ['spotify', 'deezer'])
    expect(groups[0]).toMatchObject({ sourceId: 'spotify', tracks: [] })
    expect(groups[0].error).toMatch(/credenciais/i)
    expect(groups[1].tracks.map((t) => t.id)).toEqual(['d1'])
  })

  it('fonte desconhecida vira grupo com erro', async () => {
    const resolver = new Resolver([])
    const groups = await resolver.searchMany('q', ['spotify'])
    expect(groups[0].error).toMatch(/desconhecida/i)
  })
})

describe('renderTemplate', () => {
  const meta: TrackMeta = {
    id: '1',
    title: 'Song',
    artists: ['Artist'],
    album: 'Album',
    sourceId: 'youtube',
    sourceUrl: 'x'
  }

  it('expande placeholders', () => {
    expect(renderTemplate('%artist%/%album%/%title%', meta)).toBe('Artist/Album/Song')
  })

  it('sanitiza caracteres invalidos de caminho', () => {
    const dirty = { ...meta, title: 'a/b:c' }
    expect(renderTemplate('%title%', dirty)).toBe('a_b_c')
  })

  it('nao deixa separador pendurado quando %track% esta vazio', () => {
    // template comum com numero da faixa que nao temos -> sem "/ - Titulo" nem "- Titulo"
    expect(renderTemplate('%artist%/%album%/%track% - %title%', meta)).toBe('Artist/Album/Song')
  })

  it('omite a pasta do album quando o album e desconhecido (sem "Unknown" nem vazio)', () => {
    const semAlbum = { ...meta, album: undefined }
    expect(renderTemplate('%artist%/%album%/%track% - %title%', semAlbum)).toBe('Artist/Song')
  })

  it('sem artista nem album -> arquivo direto (so o titulo)', () => {
    const so = { ...meta, artists: [], album: undefined }
    expect(renderTemplate('%artist%/%album%/%track% - %title%', so)).toBe('Song')
  })
})

describe('outputExtension', () => {
  it('usa o formato quando nao e best', () => {
    expect(outputExtension('mp3', '/tmp/1.webm')).toBe('mp3')
    expect(outputExtension('flac', '/tmp/1.opus')).toBe('flac')
  })

  it('mantem a extensao de origem quando formato e best', () => {
    expect(outputExtension('best', '/tmp/1.webm')).toBe('webm')
    expect(outputExtension('best', '/tmp/1.m4a')).toBe('m4a')
  })
})
