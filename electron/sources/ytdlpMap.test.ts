import { describe, it, expect } from 'vitest'
import { ytdlpInfoToTrack } from './ytdlpMap'

describe('ytdlpInfoToTrack', () => {
  it('mapeia campos basicos e usa webpage_url como sourceUrl', () => {
    const t = ytdlpInfoToTrack(
      {
        id: 'abc',
        title: 'Meu Video',
        uploader: 'Canal',
        thumbnail: 'http://img/cover.jpg',
        duration: 210,
        webpage_url: 'https://youtu.be/abc'
      },
      'youtube'
    )
    expect(t).toMatchObject({
      id: 'abc',
      title: 'Meu Video',
      artists: ['Canal'],
      coverUrl: 'http://img/cover.jpg',
      durationSec: 210,
      sourceId: 'youtube',
      sourceUrl: 'https://youtu.be/abc'
    })
  })

  it('prefere track sobre title e artists sobre artist/uploader', () => {
    const t = ytdlpInfoToTrack(
      { id: '1', title: 'Video Title', track: 'Nome da Faixa', artist: 'X', uploader: 'Canal', artists: ['A', 'B'], album: 'Album' },
      'youtube'
    )
    expect(t.title).toBe('Nome da Faixa')
    expect(t.artists).toEqual(['A', 'B'])
    expect(t.album).toBe('Album')
  })

  it('faz fallback do artist (string com virgulas) quando nao ha artists', () => {
    const t = ytdlpInfoToTrack({ id: '1', title: 'T', artist: 'A, B' }, 'bandcamp')
    expect(t.artists).toEqual(['A', 'B'])
  })

  it('usa uploader como artista quando nao ha track/artist (SoundCloud)', () => {
    const t = ytdlpInfoToTrack({ id: '1', title: 'T', uploader: 'DJ' }, 'soundcloud')
    expect(t.artists).toEqual(['DJ'])
    expect(t.sourceId).toBe('soundcloud')
  })

  it('duration nao-numerica vira undefined e id e sempre string', () => {
    const t = ytdlpInfoToTrack({ id: 123, title: 'T', duration: null }, 'youtube')
    expect(t.durationSec).toBeUndefined()
    expect(t.id).toBe('123')
  })
})
