import { describe, it, expect } from 'vitest'
import { GenericYtDlpSource } from './generic'
import { YtDlpEngine, type ProcRunner } from '../engines/ytdlp'

function engineReturning(stdout: string): YtDlpEngine {
  const runner: ProcRunner = { async run() { return { stdout, exitCode: 0 } } }
  return new YtDlpEngine('yt-dlp', runner)
}

describe('GenericYtDlpSource', () => {
  it('reconhece qualquer URL http(s)', () => {
    const s = new GenericYtDlpSource(engineReturning(''))
    expect(s.matches('https://www.tiktok.com/@u/video/1')).toBe(true)
    expect(s.matches('https://vimeo.com/12345')).toBe(true)
    expect(s.matches('nao-e-url')).toBe(false)
  })

  it('resolve via yt-dlp mapeando para sourceId generic', async () => {
    const engine = engineReturning(
      JSON.stringify({ id: 'v', title: 'Clipe', uploader: 'Autor', webpage_url: 'https://vimeo.com/1', duration: 100 })
    )
    const [t] = await new GenericYtDlpSource(engine).resolve('https://vimeo.com/1')
    expect(t).toMatchObject({ id: 'v', title: 'Clipe', sourceId: 'generic', sourceUrl: 'https://vimeo.com/1' })
  })

  it('search retorna vazio (sem busca por texto)', async () => {
    expect(await new GenericYtDlpSource(engineReturning('')).search()).toEqual([])
  })
})
