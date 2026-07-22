import { describe, it, expect } from 'vitest'
import { YtDlpEngine, type ProcRunner } from '../engines/ytdlp'
import { YouTubeSource, isYouTubeContainer } from './youtube'
import { BandcampSource } from './bandcamp'
import { SoundCloudSource } from './soundcloud'

/** Runner falso que devolve um stdout fixo (linhas JSON do --dump-json). */
function runnerWithStdout(stdout: string): ProcRunner {
  return {
    async run() {
      return { stdout, exitCode: 0 }
    }
  }
}

function engineReturning(stdout: string): YtDlpEngine {
  return new YtDlpEngine('yt-dlp', runnerWithStdout(stdout))
}

describe('YouTubeSource.resolve', () => {
  it('mapeia um video em uma faixa com sourceId youtube', async () => {
    const engine = engineReturning(
      JSON.stringify({ id: 'v1', title: 'Faixa', uploader: 'Canal', webpage_url: 'https://youtu.be/v1', duration: 200 })
    )
    const tracks = await new YouTubeSource(engine).resolve('https://youtu.be/v1')
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ id: 'v1', title: 'Faixa', sourceId: 'youtube', sourceUrl: 'https://youtu.be/v1' })
  })

  it('expande playlist em varias faixas', async () => {
    const engine = engineReturning(
      [
        JSON.stringify({ id: 'a', title: 'A', webpage_url: 'https://youtu.be/a' }),
        JSON.stringify({ id: 'b', title: 'B', webpage_url: 'https://youtu.be/b' })
      ].join('\n')
    )
    const tracks = await new YouTubeSource(engine).resolve('https://youtube.com/playlist?list=x')
    expect(tracks.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('isYouTubeContainer', () => {
  it('reconhece canais, playlists e abas de listagem', () => {
    expect(isYouTubeContainer('https://www.youtube.com/@canal')).toBe(true)
    expect(isYouTubeContainer('https://www.youtube.com/channel/UC123')).toBe(true)
    expect(isYouTubeContainer('https://www.youtube.com/playlist?list=PL1')).toBe(true)
    expect(isYouTubeContainer('https://www.youtube.com/@canal/videos')).toBe(true)
    expect(isYouTubeContainer('https://youtu.be/v1')).toBe(false)
  })
})

describe('YouTubeSource.resolve (canal/flat)', () => {
  it('lista entradas do canal e monta a watch URL de cada video', async () => {
    const engine = engineReturning(
      [
        JSON.stringify({ id: 'aaa', title: 'Video 1', playlist: 'Meu Canal' }),
        JSON.stringify({ id: 'bbb', title: 'Video 2', playlist: 'Meu Canal' })
      ].join('\n')
    )
    const tracks = await new YouTubeSource(engine).resolve('https://www.youtube.com/@canal')
    expect(tracks.map((t) => t.sourceUrl)).toEqual([
      'https://www.youtube.com/watch?v=aaa',
      'https://www.youtube.com/watch?v=bbb'
    ])
    expect(tracks[0].playlist).toBe('Meu Canal')
  })
})

describe('YouTubeSource.search', () => {
  it('mapeia resultados e garante sourceUrl = watch URL baixavel', async () => {
    const engine = engineReturning(
      JSON.stringify({ id: '5NV6Rdv1a3I', title: 'Get Lucky', uploader: 'Daft Punk', duration: 249 })
    )
    const r = await new YouTubeSource(engine).search('get lucky')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: '5NV6Rdv1a3I', title: 'Get Lucky', sourceId: 'youtube' })
    expect(r[0].sourceUrl).toBe('https://www.youtube.com/watch?v=5NV6Rdv1a3I')
  })
})

describe('SoundCloudSource.search', () => {
  it('mapeia resultados usando o webpage_url do SoundCloud', async () => {
    const engine = engineReturning(
      JSON.stringify({ id: '88335161', title: 'Get Lucky', uploader: 'DJ KB', webpage_url: 'https://soundcloud.com/djkb/get-lucky' })
    )
    const r = await new SoundCloudSource(engine).search('get lucky')
    expect(r[0]).toMatchObject({ id: '88335161', sourceId: 'soundcloud' })
    expect(r[0].sourceUrl).toBe('https://soundcloud.com/djkb/get-lucky')
  })
})

describe('BandcampSource.resolve', () => {
  it('usa artist e album do Bandcamp', async () => {
    const engine = engineReturning(
      JSON.stringify({ id: 'bc1', track: 'Musica', artist: 'Banda', album: 'Disco', webpage_url: 'https://x.bandcamp.com/track/m' })
    )
    const [t] = await new BandcampSource(engine).resolve('https://x.bandcamp.com/track/m')
    expect(t).toMatchObject({ title: 'Musica', artists: ['Banda'], album: 'Disco', sourceId: 'bandcamp' })
  })
})

describe('SoundCloudSource.resolve', () => {
  it('usa uploader como artista', async () => {
    const engine = engineReturning(
      JSON.stringify({ id: 'sc1', title: 'Set', uploader: 'DJ', webpage_url: 'https://soundcloud.com/dj/set' })
    )
    const [t] = await new SoundCloudSource(engine).resolve('https://soundcloud.com/dj/set')
    expect(t).toMatchObject({ title: 'Set', artists: ['DJ'], sourceId: 'soundcloud' })
  })
})
