import { describe, it, expect } from 'vitest'
import { Resolver } from './resolver'
import { renderTemplate } from './tagger'
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
})
