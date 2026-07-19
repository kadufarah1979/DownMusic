import { describe, it, expect } from 'vitest'
import { parseDeezerUrl, deezerTrackToMeta, DeezerClient } from './deezerClient'
import type { HttpClient } from '../net/http'

describe('parseDeezerUrl', () => {
  it('extrai tipo e id (com e sem locale)', () => {
    expect(parseDeezerUrl('https://www.deezer.com/track/3135556')).toEqual({ type: 'track', id: '3135556' })
    expect(parseDeezerUrl('https://www.deezer.com/en/album/302127')).toEqual({ type: 'album', id: '302127' })
    expect(parseDeezerUrl('https://deezer.com/pt/playlist/908622995')).toEqual({ type: 'playlist', id: '908622995' })
  })
  it('retorna null para URLs nao-Deezer', () => {
    expect(parseDeezerUrl('https://open.spotify.com/track/x')).toBeNull()
  })
})

describe('deezerTrackToMeta', () => {
  it('mapeia campos (duracao ja em segundos, isrc, capa, artista)', () => {
    const t = deezerTrackToMeta({
      id: 66609426,
      title: 'Get Lucky',
      isrc: 'USQX91300809',
      link: 'https://www.deezer.com/track/66609426',
      duration: 248,
      artist: { name: 'Daft Punk' },
      album: { title: 'Random Access Memories', cover_big: 'http://img/big.jpg' }
    })
    expect(t).toEqual({
      id: '66609426',
      title: 'Get Lucky',
      artists: ['Daft Punk'],
      album: 'Random Access Memories',
      coverUrl: 'http://img/big.jpg',
      isrc: 'USQX91300809',
      durationSec: 248,
      sourceId: 'deezer',
      sourceUrl: 'https://www.deezer.com/track/66609426'
    })
  })
})

/** HttpClient falso: casa por substring da URL. */
function fakeHttp(routes: Record<string, any>): HttpClient {
  return {
    async getJson(url: string) {
      const key = Object.keys(routes).find((k) => url.includes(k))
      if (!key) throw new Error(`sem rota para ${url}`)
      return routes[key]
    },
    async postForm() {
      throw new Error('nao usado')
    }
  }
}

describe('DeezerClient.search', () => {
  it('busca e mapeia resultados', async () => {
    const http = fakeHttp({
      '/search': {
        data: [
          { id: 1, title: 'A', duration: 10, artist: { name: 'X' }, album: { title: 'Al', cover_big: 'c' }, isrc: 'I1' }
        ]
      }
    })
    const client = new DeezerClient(http)
    const r = await client.search('daft punk')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: '1', title: 'A', artists: ['X'], album: 'Al', durationSec: 10, sourceId: 'deezer' })
  })
})

describe('DeezerClient.resolveUrl', () => {
  it('track', async () => {
    const http = fakeHttp({
      '/track/3135556': { id: 3135556, title: 'HBFS', duration: 226, artist: { name: 'Daft Punk' }, album: { title: 'Discovery', cover_big: 'c' }, isrc: 'I' }
    })
    const r = await new DeezerClient(http).resolveUrl('https://www.deezer.com/track/3135556')
    expect(r.map((t) => t.id)).toEqual(['3135556'])
  })

  it('album: enxerta titulo/capa do album nas faixas', async () => {
    const http = fakeHttp({
      '/album/302127': {
        title: 'Discovery',
        cover_big: 'http://c/al.jpg',
        tracks: { data: [{ id: 3135553, title: 'One More Time', duration: 320, artist: { name: 'Daft Punk' } }], next: null }
      }
    })
    const r = await new DeezerClient(http).resolveUrl('https://www.deezer.com/album/302127')
    expect(r[0]).toMatchObject({ title: 'One More Time', album: 'Discovery', coverUrl: 'http://c/al.jpg' })
  })

  it('playlist: segue a paginacao (next) ate o fim', async () => {
    const routes: Record<string, any> = {
      'https://api.deezer.com/playlist/908622995': {
        tracks: {
          data: [{ id: 1, title: 'A', duration: 1, artist: { name: 'X' }, album: { title: 'Al', cover_big: 'c' } }],
          next: 'https://api.deezer.com/playlist/908622995/tracks?index=1'
        }
      },
      'https://api.deezer.com/playlist/908622995/tracks?index=1': {
        data: [{ id: 2, title: 'B', duration: 1, artist: { name: 'Y' }, album: { title: 'Al', cover_big: 'c' } }],
        next: null
      }
    }
    const http: HttpClient = {
      async getJson(url: string) {
        if (routes[url]) return routes[url]
        throw new Error(`sem rota para ${url}`)
      },
      async postForm() {
        throw new Error('nao usado')
      }
    }
    const r = await new DeezerClient(http).resolveUrl('https://www.deezer.com/playlist/908622995')
    expect(r.map((t) => t.id)).toEqual(['1', '2'])
  })
})
