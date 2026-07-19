import { describe, it, expect } from 'vitest'
import { DeezerSource } from './deezer'
import { DeezerClient } from './deezerClient'
import { YtDlpEngine, type ProcRunner } from '../engines/ytdlp'
import type { HttpClient } from '../net/http'

function client(routes: Record<string, any>): DeezerClient {
  const http: HttpClient = {
    async getJson(url: string) {
      const k = Object.keys(routes).find((r) => url.includes(r))
      if (!k) throw new Error(`sem rota ${url}`)
      return routes[k]
    },
    async postForm() {
      throw new Error('n/a')
    }
  }
  return new DeezerClient(http)
}

const noopRunner: ProcRunner = { async run() { return { stdout: '', exitCode: 0 } } }

describe('DeezerSource', () => {
  const src = new DeezerSource(new YtDlpEngine('yt-dlp', noopRunner), client({}))

  it('reconhece URLs do Deezer e ignora outras', () => {
    expect(src.matches('https://www.deezer.com/en/track/3135556')).toBe(true)
    expect(src.matches('https://open.spotify.com/track/x')).toBe(false)
  })

  it('delega a busca ao DeezerClient e marca sourceId deezer', async () => {
    const s = new DeezerSource(
      new YtDlpEngine('yt-dlp', noopRunner),
      client({ '/search': { data: [{ id: 9, title: 'Z', duration: 3, artist: { name: 'W' }, album: {} }] } })
    )
    const r = await s.search('w')
    expect(r[0]).toMatchObject({ id: '9', title: 'Z', sourceId: 'deezer' })
  })
})
