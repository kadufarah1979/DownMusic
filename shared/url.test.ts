import { describe, it, expect } from 'vitest'
import { looksLikeUrl } from './url'

describe('looksLikeUrl', () => {
  it('reconhece links com esquema', () => {
    expect(looksLikeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
    expect(looksLikeUrl('http://vimeo.com/123')).toBe(true)
  })
  it('reconhece dominio/caminho sem esquema', () => {
    expect(looksLikeUrl('youtu.be/abc')).toBe(true)
    expect(looksLikeUrl('open.spotify.com/track/xyz')).toBe(true)
  })
  it('trata texto como busca', () => {
    expect(looksLikeUrl('boris brejcha')).toBe(false)
    expect(looksLikeUrl('artista - faixa')).toBe(false)
    expect(looksLikeUrl('Awakenings festival')).toBe(false)
  })
  it('dominio sem caminho ou vazio ⇒ não é URL', () => {
    expect(looksLikeUrl('youtube.com')).toBe(false)
    expect(looksLikeUrl('')).toBe(false)
  })
})
