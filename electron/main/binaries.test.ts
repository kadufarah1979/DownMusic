import { describe, it, expect } from 'vitest'
import { binPath } from './binaries'

describe('binPath', () => {
  it('empacotado: usa o binario embarcado em resources/bin', () => {
    expect(binPath('yt-dlp', { isPackaged: true, resourcesPath: '/app/resources' })).toBe('/app/resources/bin/yt-dlp')
    expect(binPath('ffmpeg', { isPackaged: true, resourcesPath: '/app/resources' })).toBe('/app/resources/bin/ffmpeg')
  })

  it('dev: usa o binario do PATH (so o nome)', () => {
    expect(binPath('yt-dlp', { isPackaged: false, resourcesPath: '' })).toBe('yt-dlp')
    expect(binPath('ffmpeg', { isPackaged: false, resourcesPath: '' })).toBe('ffmpeg')
  })
})
