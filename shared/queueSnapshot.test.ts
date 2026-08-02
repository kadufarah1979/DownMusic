import { describe, it, expect } from 'vitest'
import { toSnapshot, fromSnapshot, seqFromIds } from './queueSnapshot'
import type { QueueItem, TrackMeta } from './types'

const meta = (id: string): TrackMeta => ({
  id, title: id, artists: ['A'], sourceId: 'youtube', sourceUrl: `u/${id}`
})

const item = (over: Partial<QueueItem> & { itemId: string }): QueueItem => ({
  meta: meta(over.itemId), state: 'queued', progress: 0, ...over
})

describe('seqFromIds', () => {
  it('deriva o contador do maior id restaurado', () => {
    expect(seqFromIds(['q3', 'q10'])).toBe(10)
  })
  it('ignora ids fora do padrao sem quebrar', () => {
    expect(seqFromIds(['q2', 'lixo', 'q', 'qx', 'q7abc'])).toBe(2)
  })
  it('lista vazia comeca do zero', () => {
    expect(seqFromIds([])).toBe(0)
  })
})

describe('fromSnapshot', () => {
  it('normaliza item running para queued com progresso zerado', () => {
    const snap = toSnapshot([item({ itemId: 'q1', state: 'running', progress: 47 })], new Map(), new Set())
    const out = fromSnapshot(snap)
    expect(out.items[0].state).toBe('queued')
    expect(out.items[0].progress).toBe(0)
  })

  it('preserva done e error como estao', () => {
    const snap = toSnapshot(
      [
        item({ itemId: 'q1', state: 'done', progress: 100, outputPath: '/o.mp3' }),
        item({ itemId: 'q2', state: 'error', error: 'falhou' })
      ],
      new Map(),
      new Set()
    )
    const out = fromSnapshot(snap)
    expect(out.items.map((i) => i.state)).toEqual(['done', 'error'])
    expect(out.items[1].error).toBe('falhou')
  })

  it('round-trip preserva outputDirs e enriched', () => {
    const snap = toSnapshot(
      [item({ itemId: 'q1' }), item({ itemId: 'q2' })],
      new Map([['q1', '/pasta/b']]),
      new Set(['q2'])
    )
    const out = fromSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(out.outputDirs.get('q1')).toBe('/pasta/b')
    expect(out.enriched.has('q2')).toBe(true)
    expect(out.seq).toBe(2)
  })

  it('descarta entradas de outputDirs/enriched sem item correspondente', () => {
    const out = fromSnapshot({
      version: 1,
      items: [item({ itemId: 'q1' })],
      outputDirs: { q1: '/b', q9: '/orfao' },
      enriched: ['q1', 'q9']
    })
    expect(out.outputDirs.has('q9')).toBe(false)
    expect(out.enriched.has('q9')).toBe(false)
  })

  it('descarta itens que nao tem a forma de QueueItem', () => {
    const out = fromSnapshot({
      version: 1,
      items: [item({ itemId: 'q1' }), { itemId: 'q2' }, { meta: meta('x') }, null, 'q3'],
      outputDirs: {},
      enriched: []
    })
    expect(out.items.map((i) => i.itemId)).toEqual(['q1'])
  })

  it('estado desconhecido vira queued', () => {
    const out = fromSnapshot({
      version: 1,
      items: [{ itemId: 'q1', meta: meta('q1'), state: 'voando', progress: 12 }],
      outputDirs: {},
      enriched: []
    })
    expect(out.items[0].state).toBe('queued')
  })

  it('entrada irreconhecivel devolve fila vazia em vez de quebrar', () => {
    for (const raw of [null, undefined, {}, { version: 99, items: [] }, [1, 2], 'texto', { entries: [] }]) {
      const out = fromSnapshot(raw)
      expect(out.items).toEqual([])
      expect(out.outputDirs.size).toBe(0)
      expect(out.enriched.size).toBe(0)
      expect(out.seq).toBe(0)
    }
  })
})
