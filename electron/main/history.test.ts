import { describe, it, expect } from 'vitest'
import { HistoryStore } from './history'
import { memoryStore } from '../testSupport/memoryStore'
import type { HistoryEntry } from '../../shared/history'
import type { TrackMeta } from '../../shared/types'

const track = (over: Partial<TrackMeta> = {}): TrackMeta => ({
  id: 'y1', title: 'Insomnia', artists: ['Faithless'], sourceId: 'youtube', sourceUrl: 'u', ...over
})

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  nameKey: 'faithless insomnia',
  title: 'Insomnia',
  artists: ['Faithless'],
  sourceId: 'youtube',
  outputPath: '/a.mp3',
  downloadedAt: '2026-01-01T00:00:00.000Z',
  ...over
})

const make = (entries: HistoryEntry[] = []) => {
  const backend = memoryStore({ entries })
  return { store: new HistoryStore(backend), backend }
}

describe('HistoryStore', () => {
  it('list devolve o que esta gravado', () => {
    const e = entry()
    const { store } = make([e])
    expect(store.list()).toEqual([e])
  })

  it('add grava a faixa baixada com o caminho de saida', () => {
    const { store, backend } = make()
    store.add(track(), '/musicas/Faithless - Insomnia.mp3')

    expect(backend.store.entries).toHaveLength(1)
    expect(backend.store.entries[0].title).toBe('Insomnia')
    expect(backend.store.entries[0].outputPath).toBe('/musicas/Faithless - Insomnia.mp3')
    expect(backend.store.entries[0].downloadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('add nao duplica a mesma faixa (dedup por nome, feito pelo addToHistory)', () => {
    const { store, backend } = make()
    store.add(track(), '/primeiro.mp3')
    store.add(track({ id: 'y2', sourceUrl: 'outra' }), '/segundo.mp3')

    expect(backend.store.entries).toHaveLength(1)
    expect(backend.store.entries[0].outputPath).toBe('/primeiro.mp3') // mantem o primeiro
  })

  it('add nao duplica quando o ISRC repete, mesmo com titulo diferente', () => {
    const { store, backend } = make()
    store.add(track({ isrc: 'GBAAA0000001' }), '/a.mp3')
    store.add(track({ isrc: 'GBAAA0000001', title: 'Insomnia (Radio Edit)' }), '/b.mp3')

    expect(backend.store.entries).toHaveLength(1)
  })

  it('add mantem faixas diferentes', () => {
    const { store, backend } = make()
    store.add(track(), '/a.mp3')
    store.add(track({ id: 'y2', title: 'Salva Mea' }), '/b.mp3')

    expect(backend.store.entries).toHaveLength(2)
  })

  it('clear esvazia o historico', () => {
    const { store, backend } = make([entry(), entry({ nameKey: 'outra' })])
    store.clear()
    expect(store.list()).toEqual([])
    expect(backend.store.entries).toEqual([])
  })
})
