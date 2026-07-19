import { describe, it, expect, vi } from 'vitest'
import {
  parseSpotifyUrl,
  spotifyTrackToMeta,
  SpotifyClient,
  type HttpClient
} from './spotifyClient'

describe('parseSpotifyUrl', () => {
  it('extrai tipo e id de URLs open.spotify.com', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/track/abc123')).toEqual({ type: 'track', id: 'abc123' })
    expect(parseSpotifyUrl('https://open.spotify.com/album/xyz?si=1')).toEqual({ type: 'album', id: 'xyz' })
    expect(parseSpotifyUrl('https://open.spotify.com/playlist/pl9')).toEqual({ type: 'playlist', id: 'pl9' })
  })

  it('aceita o formato URI spotify:track:id', () => {
    expect(parseSpotifyUrl('spotify:track:t1')).toEqual({ type: 'track', id: 't1' })
  })

  it('aceita o segmento de localidade intl-xx nas URLs', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/intl-pt/track/42F0eI7tFI8Xez4iqXObBt')).toEqual({
      type: 'track',
      id: '42F0eI7tFI8Xez4iqXObBt'
    })
    expect(parseSpotifyUrl('https://open.spotify.com/intl-de/album/xyz?si=2')).toEqual({ type: 'album', id: 'xyz' })
  })

  it('retorna null para URLs nao-Spotify', () => {
    expect(parseSpotifyUrl('https://youtu.be/x')).toBeNull()
  })
})

describe('spotifyTrackToMeta', () => {
  it('mapeia um track object completo (com isrc, capa e duracao)', () => {
    const track = {
      id: 't1',
      name: 'Get Lucky',
      artists: [{ name: 'Daft Punk' }, { name: 'Pharrell' }],
      album: { name: 'Random Access Memories', images: [{ url: 'http://img/big.jpg' }] },
      external_ids: { isrc: 'USQX91300108' },
      duration_ms: 369000,
      external_urls: { spotify: 'https://open.spotify.com/track/t1' }
    }
    expect(spotifyTrackToMeta(track)).toEqual({
      id: 't1',
      title: 'Get Lucky',
      artists: ['Daft Punk', 'Pharrell'],
      album: 'Random Access Memories',
      coverUrl: 'http://img/big.jpg',
      isrc: 'USQX91300108',
      durationSec: 369,
      sourceId: 'spotify',
      sourceUrl: 'https://open.spotify.com/track/t1'
    })
  })
})

/** HttpClient falso: casa por substring da URL. */
function fakeHttp(routes: {
  token?: any
  get?: Record<string, any>
}): HttpClient & { posts: number; gets: string[] } {
  const state = {
    posts: 0,
    gets: [] as string[],
    async postForm() {
      state.posts++
      return routes.token ?? { access_token: 'tok', expires_in: 3600 }
    },
    async getJson(url: string) {
      state.gets.push(url)
      const key = Object.keys(routes.get ?? {}).find((k) => url.includes(k))
      if (!key) throw new Error(`sem rota para ${url}`)
      return routes.get![key]
    }
  }
  return state as any
}

const creds = { clientId: 'id', clientSecret: 'secret' }

describe('SpotifyClient.getToken', () => {
  it('busca e cacheia o token (nao repete o POST)', async () => {
    const http = fakeHttp({ token: { access_token: 'abc', expires_in: 3600 } })
    const client = new SpotifyClient(creds, http)
    expect(await client.getToken()).toBe('abc')
    await client.getToken()
    expect(http.posts).toBe(1)
  })

  it('lanca erro amigavel se faltam credenciais', async () => {
    const client = new SpotifyClient({}, fakeHttp({}))
    await expect(client.getToken()).rejects.toThrow(/[Cc]redenciais/)
  })

  it('le credenciais dinamicamente de um provider (config salva em runtime)', async () => {
    // simula credenciais vazias ao construir e preenchidas depois (ao salvar nas Config)
    let live: { clientId?: string; clientSecret?: string } = {}
    const client = new SpotifyClient(() => live, fakeHttp({ token: { access_token: 'tk', expires_in: 3600 } }))

    await expect(client.getToken()).rejects.toThrow(/[Cc]redenciais/) // ainda vazias
    live = { clientId: 'id', clientSecret: 'secret' } // usuario salvou nas Configuracoes
    expect(await client.getToken()).toBe('tk') // agora funciona sem recriar o client
  })
})

describe('SpotifyClient.searchTracks', () => {
  it('busca e mapeia resultados', async () => {
    const http = fakeHttp({
      get: {
        '/v1/search': {
          tracks: { items: [{ id: 't1', name: 'X', artists: [{ name: 'A' }], duration_ms: 1000 }] }
        }
      }
    })
    const client = new SpotifyClient(creds, http)
    const tracks = await client.searchTracks('daft punk')
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ id: 't1', title: 'X', artists: ['A'], sourceId: 'spotify' })
    expect(http.gets[0]).toContain('type=track')
    expect(http.gets[0]).toContain('daft%20punk')
  })
})

describe('SpotifyClient.resolveUrl', () => {
  it('track: retorna uma faixa', async () => {
    const http = fakeHttp({
      get: { '/v1/tracks/t1': { id: 't1', name: 'X', artists: [{ name: 'A' }], duration_ms: 1000 } }
    })
    const client = new SpotifyClient(creds, http)
    const r = await client.resolveUrl('https://open.spotify.com/track/t1')
    expect(r.map((t) => t.id)).toEqual(['t1'])
  })

  it('album: expande faixas e enxerta nome/capa do album', async () => {
    const http = fakeHttp({
      get: {
        '/v1/albums/al1': {
          name: 'Disco',
          images: [{ url: 'http://img/al.jpg' }],
          tracks: { items: [{ id: 'a', name: 'A', artists: [{ name: 'X' }], duration_ms: 1 }] }
        }
      }
    })
    const client = new SpotifyClient(creds, http)
    const r = await client.resolveUrl('https://open.spotify.com/album/al1')
    expect(r[0]).toMatchObject({ album: 'Disco', coverUrl: 'http://img/al.jpg' })
  })

  it('playlist: mapeia items[].track', async () => {
    const http = fakeHttp({
      get: {
        '/v1/playlists/pl1': {
          tracks: { items: [{ track: { id: 'p', name: 'P', artists: [{ name: 'Y' }], duration_ms: 1 } }] }
        }
      }
    })
    const client = new SpotifyClient(creds, http)
    const r = await client.resolveUrl('https://open.spotify.com/playlist/pl1')
    expect(r.map((t) => t.id)).toEqual(['p'])
  })
})
