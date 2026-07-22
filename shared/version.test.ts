import { describe, it, expect } from 'vitest'
import { parseVersion, isNewer, assetForPlatform } from './version'

describe('parseVersion', () => {
  it('remove o v inicial e separa em numeros', () => {
    expect(parseVersion('v0.1.2')).toEqual([0, 1, 2])
    expect(parseVersion('1.10.0')).toEqual([1, 10, 0])
  })
})

describe('isNewer', () => {
  it('detecta versao maior em cada componente', () => {
    expect(isNewer('0.1.0', '0.1.1')).toBe(true)
    expect(isNewer('0.1.0', '0.2.0')).toBe(true)
    expect(isNewer('0.9.0', '1.0.0')).toBe(true)
    expect(isNewer('1.2.3', 'v1.2.10')).toBe(true)
  })
  it('retorna false quando igual ou menor', () => {
    expect(isNewer('0.1.1', '0.1.1')).toBe(false)
    expect(isNewer('0.2.0', '0.1.9')).toBe(false)
    expect(isNewer('1.0.0', 'v1.0.0')).toBe(false)
  })
})

describe('assetForPlatform', () => {
  const assets = [
    { name: 'DownMusic.Setup.0.1.1.exe', url: 'exe' },
    { name: 'DownMusic-0.1.1-arm64.dmg', url: 'arm' },
    { name: 'DownMusic-0.1.1-x64.dmg', url: 'x64' },
    { name: 'DownMusic-0.1.1.AppImage', url: 'appimage' }
  ]
  it('Windows -> .exe', () => {
    expect(assetForPlatform('win32', 'x64', assets)?.url).toBe('exe')
  })
  it('macOS arm64 -> dmg arm64', () => {
    expect(assetForPlatform('darwin', 'arm64', assets)?.url).toBe('arm')
  })
  it('macOS Intel -> dmg x64', () => {
    expect(assetForPlatform('darwin', 'x64', assets)?.url).toBe('x64')
  })
  it('Linux -> AppImage', () => {
    expect(assetForPlatform('linux', 'x64', assets)?.url).toBe('appimage')
  })
  it('sem asset compativel -> undefined', () => {
    expect(assetForPlatform('win32', 'x64', [{ name: 'x.dmg', url: 'y' }])).toBeUndefined()
  })
})
