import { describe, it, expect } from 'vitest'
import { isDifferentList, pruneSelection, pruneCandidates, remapKey } from './trackListState'

describe('isDifferentList', () => {
  it('lista anterior vazia conta como lista nova', () => {
    expect(isDifferentList([], ['a', 'b'])).toBe(true)
  })

  it('nenhuma faixa em comum: lista nova', () => {
    expect(isDifferentList(['a', 'b'], ['c', 'd'])).toBe(true)
  })

  it('troca de uma faixa: NAO e lista nova (as outras permanecem)', () => {
    expect(isDifferentList(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(false)
  })

  it('mesma lista reresolvida: nao e lista nova', () => {
    expect(isDifferentList(['a', 'b'], ['a', 'b'])).toBe(false)
  })

  it('lista de uma faixa so, trocada: e tratada como lista nova', () => {
    // sem nenhuma chave em comum nao ha o que preservar — resetar e o certo
    expect(isDifferentList(['a'], ['x'])).toBe(true)
  })
})

describe('pruneSelection', () => {
  it('mantem so o que continua na lista', () => {
    expect(pruneSelection(new Set(['a', 'b', 'c']), ['a', 'c'])).toEqual(new Set(['a', 'c']))
  })

  it('preserva desmarcadas: chave ausente do conjunto nao volta marcada', () => {
    expect(pruneSelection(new Set(['a']), ['a', 'b'])).toEqual(new Set(['a']))
  })

  it('conjunto vazio segue vazio', () => {
    expect(pruneSelection(new Set(), ['a'])).toEqual(new Set())
  })
})

describe('pruneCandidates', () => {
  it('descarta candidatas de faixas que sairam', () => {
    const cands = { a: { youtube: 1 }, b: { deezer: 2 } }
    expect(pruneCandidates(cands, ['a'])).toEqual({ a: { youtube: 1 } })
  })

  it('preserva as candidatas das faixas que ficaram — o bug que motivou isto', () => {
    const cands = { a: { youtube: 1 }, c: { deezer: 2 } }
    // 'b' virou 'x' por troca; 'a' e 'c' nao podem perder o que ja acharam
    expect(pruneCandidates(cands, ['a', 'x', 'c'])).toEqual(cands)
  })

  it('mapa vazio segue vazio', () => {
    expect(pruneCandidates({}, ['a'])).toEqual({})
  })
})

describe('remapKey', () => {
  it('faixa marcada continua marcada apos a troca', () => {
    expect(remapKey(new Set(['a', 'b']), 'b', 'x')).toEqual(new Set(['a', 'x']))
  })

  it('faixa desmarcada continua desmarcada apos a troca', () => {
    expect(remapKey(new Set(['a']), 'b', 'x')).toEqual(new Set(['a']))
  })

  it('troca encadeada: a chave nova pode ser remapeada de novo', () => {
    const um = remapKey(new Set(['a']), 'a', 'b')
    expect(remapKey(um, 'b', 'c')).toEqual(new Set(['c']))
  })
})
