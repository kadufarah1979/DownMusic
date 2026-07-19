import { describe, it, expect } from 'vitest'
import { YtDlpEngine, type ProcRunner } from '../engines/ytdlp'
import { YouTubeSource } from './youtube'
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
