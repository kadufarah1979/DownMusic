import { describe, it, expect } from 'vitest'
import { checkForUpdate } from './updater'

function fakeFetch(release: unknown, ok = true, status = 200) {
  return (async () => ({ ok, status, json: async () => release })) as any
}

const release = {
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/kadufarah1979/DownMusic/releases/tag/v0.2.0',
  assets: [
    { name: 'DownMusic.Setup.0.2.0.exe', browser_download_url: 'http://x/exe' },
    { name: 'DownMusic-0.2.0-arm64.dmg', browser_download_url: 'http://x/arm' },
    { name: 'DownMusic-0.2.0.AppImage', browser_download_url: 'http://x/appimage' }
  ]
}

describe('checkForUpdate', () => {
  it('detecta versao nova e escolhe o instalador do SO atual', async () => {
    const r = await checkForUpdate('0.1.1', 'win32', 'x64', fakeFetch(release))
    expect(r.latest).toBe('0.2.0')
    expect(r.isNewer).toBe(true)
    expect(r.downloadUrl).toBe('http://x/exe')
    expect(r.notesUrl).toContain('/releases/tag/v0.2.0')
  })

  it('quando ja esta atualizado, isNewer=false', async () => {
    const r = await checkForUpdate('0.2.0', 'linux', 'x64', fakeFetch(release))
    expect(r.isNewer).toBe(false)
    expect(r.downloadUrl).toBe('http://x/appimage')
  })

  it('erro de rede vira campo error (nao lanca)', async () => {
    const r = await checkForUpdate('0.1.1', 'linux', 'x64', (async () => { throw new Error('offline') }) as any)
    expect(r.error).toBe('offline')
    expect(r.isNewer).toBe(false)
  })

  it('HTTP nao-ok vira error', async () => {
    const r = await checkForUpdate('0.1.1', 'linux', 'x64', fakeFetch({}, false, 403))
    expect(r.error).toContain('403')
  })
})
