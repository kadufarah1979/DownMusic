import { describe, it, expect } from 'vitest'
import { tagsFromDeezer, MetadataEnricher } from './metadataEnricher'
import type { HttpClient } from '../net/http'
import type { TrackMeta } from '../../shared/types'

describe('tagsFromDeezer', () => {
  it('extrai genero/ano/label/nº faixa/disco/capa', () => {
    const track = { track_position: 4, disk_number: 1, release_date: '2001-03-12' }
    const album = {
      genres: { data: [{ name: 'Electro' }] },
      label: 'Daft Life Ltd.',
      release_date: '2001-03-07',
      cover_xl: 'http://c/xl.jpg'
    }
    expect(tagsFromDeezer(track, album)).toEqual({
      genre: 'Electro',
      year: '2001',
      label: 'Daft Life Ltd.',
      trackNumber: 4,
      discNumber: 1,
      coverUrl: 'http://c/xl.jpg'
    })
  })

  it('omite campos ausentes (nao sobrescreve com undefined)', () => {
    expect(tagsFromDeezer({ track_position: 2 }, {})).toEqual({ trackNumber: 2 })
  })
})

const track = (over: Partial<TrackMeta> = {}): TrackMeta => ({
  id: '1',
  title: 'Song',
  artists: ['Artist'],
  sourceId: 'youtube',
  sourceUrl: '',
  ...over
})

describe('MetadataEnricher.enrich', () => {
  it('acha por ISRC, le o album e cacheia (album buscado 1x p/ faixas do mesmo album)', async () => {
    let albumCalls = 0
    const http: HttpClient = {
      async getJson(url: string) {
        if (url.includes('/track/isrc:')) return { id: 10, album: { id: 99 }, track_position: 3, disk_number: 1 }
        if (url.includes('/album/99')) {
          albumCalls++
          return { genres: { data: [{ name: 'Reggae' }] }, label: 'Lbl', release_date: '2020-01-01', cover_xl: 'xl' }
        }
        throw new Error('sem rota ' + url)
      },
      async postForm() {
        throw new Error('n/a')
      }
    }
    const enricher = new MetadataEnricher(http)
    const a = await enricher.enrich(track({ isrc: 'ISRC1' }))
    const b = await enricher.enrich(track({ isrc: 'ISRC1', id: '2' })) // mesmo album -> usa cache

    expect(a).toMatchObject({ genre: 'Reggae', year: '2020', label: 'Lbl', trackNumber: 3, coverUrl: 'xl' })
    expect(b.genre).toBe('Reggae')
    expect(albumCalls).toBe(1) // album so buscado uma vez (cache)
  })

  it('sem match no Deezer -> retorna vazio (nao quebra)', async () => {
    const http: HttpClient = {
      async getJson(url: string) {
        if (url.includes('/track/isrc:')) return { error: { message: 'not found' } }
        if (url.includes('/search')) return { data: [] }
        throw new Error('x')
      },
      async postForm() {
        throw new Error('n/a')
      }
    }
    expect(await new MetadataEnricher(http).enrich(track({ isrc: 'X' }))).toEqual({})
  })
})
