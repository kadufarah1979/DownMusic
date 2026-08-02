import { describe, it, expect } from 'vitest'
import { PlaylistStore, PlaylistService } from './playlists'
import { memoryStore } from '../testSupport/memoryStore'
import type { PlaylistSubscription, TrackMeta } from '../../shared/types'
import type { HistoryEntry } from '../../shared/history'
import type { Resolver } from './resolver'
import type { HistoryStore } from './history'
import type { QueueManager } from './queue'

const sub = (over: Partial<PlaylistSubscription> = {}): PlaylistSubscription => ({
  url: 'https://sp/1', name: 'Set', sourceId: 'spotify', addedAt: '2026-01-01T00:00:00.000Z', trackCount: 2, ...over
})

const track = (over: Partial<TrackMeta> = {}): TrackMeta => ({
  id: 't1', title: 'Insomnia', artists: ['Faithless'], sourceId: 'spotify', sourceUrl: 'u', ...over
})

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  nameKey: 'faithless insomnia', title: 'Insomnia', artists: ['Faithless'],
  sourceId: 'spotify', outputPath: '/a.mp3', downloadedAt: '2026-01-01T00:00:00.000Z', ...over
})

const makeStore = (subs: PlaylistSubscription[] = []) => new PlaylistStore(memoryStore({ subs }))

/** Service com resolver/historico/fila falsos; `resolve` decide o resultado por URL. */
function makeService(opts: {
  subs?: PlaylistSubscription[]
  resolve?: (url: string) => Promise<TrackMeta[]>
  history?: HistoryEntry[]
}) {
  const store = makeStore(opts.subs ?? [])
  const enqueued: TrackMeta[] = []
  const resolver = { resolve: opts.resolve ?? (async () => []) } as unknown as Resolver
  const history = { list: () => opts.history ?? [] } as unknown as HistoryStore
  const queue = { enqueue: (m: TrackMeta) => enqueued.push(m) } as unknown as QueueManager
  return { svc: new PlaylistService(store, resolver, history, queue), store, enqueued }
}

describe('PlaylistStore', () => {
  it('upsert substitui pela URL em vez de duplicar', () => {
    const store = makeStore([sub()])
    store.upsert(sub({ name: 'Set renomeado', trackCount: 9 }))

    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].name).toBe('Set renomeado')
  })

  it('upsert de outra URL adiciona', () => {
    const store = makeStore([sub()])
    store.upsert(sub({ url: 'https://sp/2' }))
    expect(store.list().map((s) => s.url)).toEqual(['https://sp/1', 'https://sp/2'])
  })

  it('update altera so a assinatura da URL informada', () => {
    const store = makeStore([sub(), sub({ url: 'https://sp/2', name: 'Outra' })])
    store.update('https://sp/2', { trackCount: 42 })

    expect(store.list()[0].trackCount).toBe(2)
    expect(store.list()[1].trackCount).toBe(42)
    expect(store.list()[1].name).toBe('Outra') // resto preservado
  })

  it('update de URL inexistente nao cria nem quebra', () => {
    const store = makeStore([sub()])
    store.update('https://sp/999', { trackCount: 7 })
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].trackCount).toBe(2)
  })

  it('remove tira so a URL informada; clear tira todas', () => {
    const store = makeStore([sub(), sub({ url: 'https://sp/2' })])
    store.remove('https://sp/1')
    expect(store.list().map((s) => s.url)).toEqual(['https://sp/2'])

    store.clear()
    expect(store.list()).toEqual([])
  })
})

describe('PlaylistService.add', () => {
  it('deriva nome, plataforma e contagem da primeira faixa resolvida', async () => {
    const { svc } = makeService({
      resolve: async () => [track({ playlist: 'Techno 2026' }), track({ id: 't2' })]
    })
    const s = await svc.add('https://sp/1')

    expect(s.name).toBe('Techno 2026')
    expect(s.sourceId).toBe('spotify')
    expect(s.trackCount).toBe(2)
    expect(svc.list()).toHaveLength(1)
  })

  it('sem nome de playlist usa a propria URL como nome', async () => {
    const { svc } = makeService({ resolve: async () => [track()] })
    expect((await svc.add('https://sp/1')).name).toBe('https://sp/1')
  })

  it('playlist vazia e recusada, sem cadastrar nada', async () => {
    const { svc } = makeService({ resolve: async () => [] })
    await expect(svc.add('https://sp/1')).rejects.toThrow(/vazia|reconhecida/i)
    expect(svc.list()).toEqual([])
  })
})

describe('PlaylistService.sync', () => {
  it('enfileira somente as faixas que nao estao no historico', async () => {
    const { svc, enqueued } = makeService({
      subs: [sub()],
      resolve: async () => [track(), track({ id: 't2', title: 'Salva Mea' })],
      history: [entry()] // Insomnia ja baixada
    })
    const r = await svc.sync('https://sp/1')

    expect(enqueued.map((t) => t.title)).toEqual(['Salva Mea'])
    expect(r).toEqual({ added: 1, total: 2 })
  })

  it('atualiza lastSyncedAt e trackCount da assinatura', async () => {
    const { svc } = makeService({ subs: [sub()], resolve: async () => [track(), track({ id: 't2' }), track({ id: 't3' })] })
    await svc.sync('https://sp/1')

    const s = svc.list()[0]
    expect(s.trackCount).toBe(3)
    expect(s.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('PlaylistService.syncAll', () => {
  it('soma os resultados de todas as playlists', async () => {
    const { svc } = makeService({
      subs: [sub(), sub({ url: 'https://sp/2' })],
      resolve: async () => [track({ id: `${Math.random()}` })]
    })
    const r = await svc.syncAll()
    expect(r.total).toBe(2)
    expect(r.failed).toBe(0)
  })

  it('uma playlist quebrada nao derruba as demais, e a falha e contada', async () => {
    const { svc, enqueued } = makeService({
      subs: [sub({ url: 'https://sp/morta' }), sub({ url: 'https://sp/boa' })],
      resolve: async (url) => {
        if (url.includes('morta')) throw new Error('404 Not Found')
        return [track({ id: 'ok' })]
      }
    })
    const r = await svc.syncAll()

    expect(r.added).toBe(1) // a boa sincronizou
    expect(r.total).toBe(1)
    expect(r.failed).toBe(1)
    expect(enqueued).toHaveLength(1)
  })

  it('a ordem nao importa: falha na ultima tambem preserva o parcial', async () => {
    const { svc } = makeService({
      subs: [sub({ url: 'https://sp/boa' }), sub({ url: 'https://sp/morta' })],
      resolve: async (url) => {
        if (url.includes('morta')) throw new Error('offline')
        return [track({ id: 'ok' })]
      }
    })
    const r = await svc.syncAll()
    expect(r).toEqual({ added: 1, total: 1, failed: 1 })
  })
})

describe('PlaylistService.clear', () => {
  it('remove todas as assinaturas', async () => {
    const { svc } = makeService({ subs: [sub(), sub({ url: 'https://sp/2' })] })
    svc.clear()
    expect(svc.list()).toEqual([])
  })
})
