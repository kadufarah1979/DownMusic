import { describe, it, expect } from 'vitest'
import { detectLink, ClipboardWatcher } from './clipboardWatcher'

const supported = (u: string) => /youtube\.com|youtu\.be/.test(u)

describe('detectLink', () => {
  it('retorna a URL quando e http(s), nova e suportada', () => {
    expect(detectLink('https://youtu.be/abc', '', supported)).toBe('https://youtu.be/abc')
  })
  it('ignora quando igual ao ultimo visto', () => {
    expect(detectLink('https://youtu.be/abc', 'https://youtu.be/abc', supported)).toBeNull()
  })
  it('ignora texto que nao e URL', () => {
    expect(detectLink('apenas um texto', '', supported)).toBeNull()
  })
  it('ignora URL de fonte nao suportada', () => {
    expect(detectLink('https://exemplo.com/x', '', supported)).toBeNull()
  })
  it('ignora colagens multi-palavra/linha', () => {
    expect(detectLink('https://youtu.be/abc e mais coisa', '', supported)).toBeNull()
  })
})

describe('ClipboardWatcher', () => {
  it('so avisa quando habilitado e o link e novo e suportado', () => {
    let clip = 'https://youtu.be/xyz'
    const hits: string[] = []
    let on = true
    const w = new ClipboardWatcher(() => on, supported, (u) => hits.push(u), () => clip)
    w.start() // captura o estado inicial (nao dispara)
    // tick manual via acesso ao metodo privado nao e ideal; simulamos trocando o clip
    clip = 'https://youtu.be/novo'
    ;(w as unknown as { tick(): void }).tick()
    expect(hits).toEqual(['https://youtu.be/novo'])
    // desabilitado: nao avisa mesmo com link novo
    on = false
    clip = 'https://youtu.be/outro'
    ;(w as unknown as { tick(): void }).tick()
    expect(hits).toEqual(['https://youtu.be/novo'])
    w.stop()
  })
})
