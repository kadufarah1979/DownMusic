import { describe, it, expect } from 'vitest'
import { binPath, checkBinaries } from './binaries'

describe('binPath', () => {
  it('empacotado: usa o binario embarcado em resources/bin', () => {
    expect(binPath('yt-dlp', { isPackaged: true, resourcesPath: '/app/resources' })).toBe('/app/resources/bin/yt-dlp')
    expect(binPath('ffmpeg', { isPackaged: true, resourcesPath: '/app/resources' })).toBe('/app/resources/bin/ffmpeg')
  })

  it('dev: usa o binario do PATH (so o nome)', () => {
    expect(binPath('yt-dlp', { isPackaged: false, resourcesPath: '' })).toBe('yt-dlp')
    expect(binPath('ffmpeg', { isPackaged: false, resourcesPath: '' })).toBe('ffmpeg')
  })

  it('Windows: acrescenta .exe ao nome do binario', () => {
    expect(binPath('yt-dlp', { isPackaged: true, resourcesPath: 'C:\\app\\resources', platform: 'win32' }))
      .toContain('yt-dlp.exe')
    expect(binPath('ffmpeg', { isPackaged: false, resourcesPath: '', platform: 'win32' })).toBe('ffmpeg.exe')
  })
})

describe('checkBinaries', () => {
  const probe = (ok: boolean) => ({ available: async () => ok })

  it('reporta os dois disponiveis', async () => {
    expect(await checkBinaries(probe(true), probe(true))).toEqual({ ytdlp: true, ffmpeg: true })
  })

  it('reporta cada binario ausente de forma independente', async () => {
    expect(await checkBinaries(probe(false), probe(true))).toEqual({ ytdlp: false, ffmpeg: true })
    expect(await checkBinaries(probe(true), probe(false))).toEqual({ ytdlp: true, ffmpeg: false })
    expect(await checkBinaries(probe(false), probe(false))).toEqual({ ytdlp: false, ffmpeg: false })
  })

  it('engine que lanca conta como ausente, sem propagar o erro', async () => {
    const throwing = {
      available: async () => {
        throw new Error('ENOENT')
      }
    }
    expect(await checkBinaries(throwing, probe(true))).toEqual({ ytdlp: false, ffmpeg: true })
  })

  it('checa as duas em paralelo, nao em sequencia', async () => {
    let running = 0
    let maxConcurrent = 0
    const slow = () => ({
      available: async () => {
        maxConcurrent = Math.max(maxConcurrent, ++running)
        await new Promise((r) => setTimeout(r, 10))
        running--
        return true
      }
    })
    await checkBinaries(slow(), slow())
    expect(maxConcurrent).toBe(2)
  })
})
