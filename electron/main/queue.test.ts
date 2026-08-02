import { describe, it, expect } from 'vitest'
import { QueueManager } from './queue'
import { DEFAULT_CONFIG, type TrackMeta } from '../../shared/types'
import type { AudioResult } from '../../shared/types'

const track = (id: string): TrackMeta => ({ id, title: id, artists: [], sourceId: 'youtube', sourceUrl: '' })

/** Monta um QueueManager com fonte/tagger falsos; fetchImpl controla sucesso/erro. */
function makeQueue(fetchImpl: (...args: any[]) => Promise<AudioResult>, store?: any) {
  const source = {
    id: 'youtube' as const,
    matches: () => false,
    search: async () => [],
    resolve: async () => [],
    fetchAudio: fetchImpl
  }
  const resolver = { getSource: (id: string) => (id === 'youtube' ? source : undefined) } as any
  const tagger = { finalize: async () => '/out.mp3' } as any
  const cfg = { ...DEFAULT_CONFIG, concurrency: 2, maxRetries: 0, outputDir: '/tmp' }
  return new QueueManager(resolver, tagger, cfg, undefined, store)
}

function waitFor(q: QueueManager, itemId: string, state: string): Promise<void> {
  return new Promise((res) => {
    const check = (it: any) => {
      if (it.itemId === itemId && it.state === state) {
        q.off('update', check)
        res()
      }
    }
    q.on('update', check)
  })
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('QueueManager.retry', () => {
  it('re-executa um item em erro ate concluir', async () => {
    let ok = false
    const q = makeQueue(async () => {
      if (!ok) throw new Error('Nenhum resultado no YouTube')
      return { rawPath: '/r' }
    })
    const item = q.enqueue(track('a'))
    await waitFor(q, item.itemId, 'error')

    ok = true
    q.retry(item.itemId)
    await waitFor(q, item.itemId, 'done')
    expect(q.list()[0].state).toBe('done')
  })

  it('ignora item que nao esta em erro (nao re-executa)', async () => {
    let calls = 0
    const q = makeQueue(async () => {
      calls++
      return { rawPath: '/r' }
    })
    const item = q.enqueue(track('a'))
    await waitFor(q, item.itemId, 'done')
    const before = calls
    q.retry(item.itemId)
    await delay(30)
    expect(calls).toBe(before)
  })
})

describe('QueueManager.enqueue com pasta de destino (override por lista)', () => {
  it('usa a pasta do override quando informada; senao usa a config', async () => {
    const dirs: string[] = []
    const source = {
      id: 'youtube' as const, matches: () => false, search: async () => [], resolve: async () => [],
      fetchAudio: async (_m: any, opts: any) => { dirs.push(opts.outputDir); return { rawPath: '/r' } }
    }
    const resolver = { getSource: () => source } as any
    const tagger = { finalize: async () => '/out.mp3' } as any
    const cfg = { ...DEFAULT_CONFIG, concurrency: 1, maxRetries: 0, outputDir: '/padrao' }
    const q = new QueueManager(resolver, tagger, cfg)

    const a = q.enqueue(track('a'), '/pasta/escolhida')
    await waitFor(q, a.itemId, 'done')
    const b = q.enqueue(track('b')) // sem override
    await waitFor(q, b.itemId, 'done')

    expect(dirs).toEqual(['/pasta/escolhida', '/padrao'])
  })
})

describe('QueueManager enrich (metadados Deezer)', () => {
  it('enriquece a faixa 1x antes do finalize (aplica no meta) e nao re-enriquece no retry', async () => {
    let ok = false
    let enrichCalls = 0
    let seenGenre: string | undefined
    const source = {
      id: 'youtube' as const, matches: () => false, search: async () => [], resolve: async () => [],
      fetchAudio: async () => { if (!ok) throw new Error('x'); return { rawPath: '/r' } }
    }
    const resolver = { getSource: () => source } as any
    const tagger = { finalize: async (m: TrackMeta) => { seenGenre = m.genre; return '/out.mp3' } } as any
    const cfg = { ...DEFAULT_CONFIG, concurrency: 1, maxRetries: 0, outputDir: '/tmp' }
    const enrich = async () => { enrichCalls++; return { genre: 'Techno', trackNumber: 3 } }
    const q = new QueueManager(resolver, tagger, cfg, enrich)

    const item = q.enqueue(track('a'))
    await waitFor(q, item.itemId, 'error') // falhou o download, mas enrich ja rodou
    ok = true
    q.retry(item.itemId)
    await waitFor(q, item.itemId, 'done')

    expect(enrichCalls).toBe(1) // enriquecido uma unica vez
    expect(seenGenre).toBe('Techno') // meta enriquecido chega ao finalize
    expect(q.list()[0].meta.trackNumber).toBe(3)
  })

  it('falha do enrich nao quebra o download', async () => {
    const source = {
      id: 'youtube' as const, matches: () => false, search: async () => [], resolve: async () => [],
      fetchAudio: async () => ({ rawPath: '/r' })
    }
    const resolver = { getSource: () => source } as any
    const tagger = { finalize: async () => '/out.mp3' } as any
    const cfg = { ...DEFAULT_CONFIG, concurrency: 1, maxRetries: 0, outputDir: '/tmp' }
    const enrich = async () => { throw new Error('deezer down') }
    const q = new QueueManager(resolver, tagger, cfg, enrich)
    const item = q.enqueue(track('a'))
    await waitFor(q, item.itemId, 'done')
    expect(q.list()[0].state).toBe('done')
  })
})

/** Store em memoria com a mesma interface do QueueStore (arquivo queue.json). */
function fakeStore() {
  return {
    data: undefined as unknown,
    saves: 0,
    load() {
      return this.data
    },
    save(snap: unknown) {
      this.saves++
      this.data = JSON.parse(JSON.stringify(snap))
    }
  }
}

describe('QueueManager persistencia', () => {
  it('itens em erro sobrevivem ao reinicio e podem ser retentados', async () => {
    const store = fakeStore()
    let ok = false
    const fetchImpl = async () => {
      if (!ok) throw new Error('Nenhum resultado no YouTube')
      return { rawPath: '/r' }
    }
    const q = makeQueue(fetchImpl, store)
    const item = q.enqueue(track('a'))
    await waitFor(q, item.itemId, 'error')

    ok = true
    const revived = makeQueue(fetchImpl, store)
    expect(revived.list().map((i) => i.state)).toEqual(['error'])

    revived.retry(item.itemId)
    await waitFor(revived, item.itemId, 'done')
    expect(revived.list()[0].state).toBe('done')
  })

  it('retry apos reinicio grava na pasta escolhida para aquela lista', async () => {
    const store = fakeStore()
    const dirs: string[] = []
    let ok = false
    const fetchImpl = async (_m: any, opts: any) => {
      dirs.push(opts.outputDir)
      if (!ok) throw new Error('falhou')
      return { rawPath: '/r' }
    }
    const q = makeQueue(fetchImpl, store)
    const item = q.enqueue(track('a'), '/pasta/escolhida')
    await waitFor(q, item.itemId, 'error')

    ok = true
    const revived = makeQueue(fetchImpl, store)
    revived.retry(item.itemId)
    await waitFor(revived, item.itemId, 'done')

    expect(dirs).toEqual(['/pasta/escolhida', '/pasta/escolhida'])
  })

  it('nao re-enriquece apos reinicio (enriched persistido)', async () => {
    const store = fakeStore()
    let ok = false
    let enrichCalls = 0
    const source = {
      id: 'youtube' as const, matches: () => false, search: async () => [], resolve: async () => [],
      fetchAudio: async () => { if (!ok) throw new Error('x'); return { rawPath: '/r' } }
    }
    const resolver = { getSource: () => source } as any
    const tagger = { finalize: async () => '/out.mp3' } as any
    const cfg = { ...DEFAULT_CONFIG, concurrency: 1, maxRetries: 0, outputDir: '/tmp' }
    const enrich = async () => { enrichCalls++; return { genre: 'Techno' } }

    const q = new QueueManager(resolver, tagger, cfg, enrich, store)
    const item = q.enqueue(track('a'))
    await waitFor(q, item.itemId, 'error')
    expect(enrichCalls).toBe(1)

    ok = true
    const revived = new QueueManager(resolver, tagger, cfg, enrich, store)
    revived.retry(item.itemId)
    await waitFor(revived, item.itemId, 'done')
    expect(enrichCalls).toBe(1)
  })

  it('novo enqueue apos reinicio nao sobrescreve item restaurado', async () => {
    const store = fakeStore()
    const q = makeQueue(async () => ({ rawPath: '/r' }), store)
    const a = q.enqueue(track('a'))
    await waitFor(q, a.itemId, 'done')

    const revived = makeQueue(async () => ({ rawPath: '/r' }), store)
    const b = revived.enqueue(track('b'))
    expect(b.itemId).not.toBe(a.itemId)
    expect(revived.list().map((i) => i.itemId).sort()).toEqual([a.itemId, b.itemId].sort())
  })

  it('progresso nao grava em disco (so transicao de estado)', async () => {
    const store = fakeStore()
    const q = makeQueue(async (_m: any, _o: any, onProgress: any) => {
      for (let p = 10; p <= 90; p += 10) onProgress(p)
      return { rawPath: '/r' }
    }, store)
    const item = q.enqueue(track('a'))
    await waitFor(q, item.itemId, 'done')
    // enqueue(queued) + running + done = 3 gravacoes; os 9 ticks de progresso nao contam
    expect(store.saves).toBe(3)
  })

  it('item running volta como queued, parado, e so baixa quando resume() e chamado', async () => {
    const store = fakeStore()
    store.data = {
      version: 1,
      items: [{ itemId: 'q1', meta: track('a'), state: 'running', progress: 47 }],
      outputDirs: {},
      enriched: []
    }
    let calls = 0
    const q = makeQueue(async () => {
      calls++
      return { rawPath: '/r' }
    }, store)

    expect(q.list()[0].state).toBe('queued')
    expect(q.list()[0].progress).toBe(0)
    await delay(30)
    expect(calls).toBe(0) // nao comecou a baixar sozinho no boot

    const done = waitFor(q, 'q1', 'done')
    q.resume()
    await done
    expect(calls).toBe(1)
  })

  it('marca o item restaurado como parado e limpa a marca ao retomar', async () => {
    const store = fakeStore()
    store.data = {
      version: 1,
      items: [{ itemId: 'q1', meta: track('a'), state: 'running', progress: 47 }],
      outputDirs: {},
      enriched: []
    }
    const q = makeQueue(async () => ({ rawPath: '/r' }), store)
    expect(q.list()[0].stalled).toBe(true)
    expect(q.stalledCount()).toBe(1)

    const done = waitFor(q, 'q1', 'done')
    q.resume()
    expect(q.stalledCount()).toBe(0)
    await done
    expect(q.list()[0].stalled).toBeUndefined()
  })

  it('item enfileirado na sessao atual nao conta como parado', async () => {
    const store = fakeStore()
    const q = makeQueue(async () => ({ rawPath: '/r' }), store)
    const item = q.enqueue(track('a'))
    expect(q.stalledCount()).toBe(0)
    await waitFor(q, item.itemId, 'done')
  })

  it('resume() avisa a UI de todos os itens retomados, nao so dos que cabem na concorrencia', () => {
    const store = fakeStore()
    store.data = {
      version: 1,
      items: [
        { itemId: 'q1', meta: track('a'), state: 'queued', progress: 0 },
        { itemId: 'q2', meta: track('b'), state: 'queued', progress: 0 },
        { itemId: 'q3', meta: track('c'), state: 'queued', progress: 0 }
      ],
      outputDirs: {},
      enriched: []
    }
    const q = makeQueue(async () => new Promise<never>(() => {}), store) // download que nunca termina
    const seen = new Map<string, boolean>()
    q.on('update', (it: any) => seen.set(it.itemId, Boolean(it.stalled)))
    q.resume()
    expect([...seen.keys()].sort()).toEqual(['q1', 'q2', 'q3'])
    expect([...seen.values()]).toEqual([false, false, false])
  })

  it('resume() ignora item ja concluido ou em erro', async () => {
    const store = fakeStore()
    store.data = {
      version: 1,
      items: [
        { itemId: 'q1', meta: track('a'), state: 'done', progress: 100 },
        { itemId: 'q2', meta: track('b'), state: 'error', progress: 0, error: 'x' }
      ],
      outputDirs: {},
      enriched: []
    }
    let calls = 0
    const q = makeQueue(async () => {
      calls++
      return { rawPath: '/r' }
    }, store)
    q.resume()
    await delay(30)
    expect(calls).toBe(0)
  })

  it('arquivo corrompido nao impede o boot: comeca com fila vazia', () => {
    const store = fakeStore()
    store.data = { lixo: true }
    const q = makeQueue(async () => ({ rawPath: '/r' }), store)
    expect(q.list()).toEqual([])
  })
})

describe('QueueManager.retryFailed', () => {
  it('retenta todos os itens com erro', async () => {
    let ok = false
    const q = makeQueue(async () => {
      if (!ok) throw new Error('falhou')
      return { rawPath: '/r' }
    })
    const a = q.enqueue(track('a'))
    const b = q.enqueue(track('b'))
    // registra os waiters de forma sincrona (antes dos runs assincronos executarem)
    await Promise.all([waitFor(q, a.itemId, 'error'), waitFor(q, b.itemId, 'error')])

    ok = true
    // registra os waiters antes de retentar (concorrencia 2 pode concluir antes)
    const doneA = waitFor(q, a.itemId, 'done')
    const doneB = waitFor(q, b.itemId, 'done')
    q.retryFailed()
    await Promise.all([doneA, doneB])
    expect(q.list().every((i) => i.state === 'done')).toBe(true)
  })
})
