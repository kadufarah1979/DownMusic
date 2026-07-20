import { describe, it, expect } from 'vitest'
import { QueueManager } from './queue'
import { DEFAULT_CONFIG, type TrackMeta } from '../../shared/types'
import type { AudioResult } from '../../shared/types'

const track = (id: string): TrackMeta => ({ id, title: id, artists: [], sourceId: 'youtube', sourceUrl: '' })

/** Monta um QueueManager com fonte/tagger falsos; fetchImpl controla sucesso/erro. */
function makeQueue(fetchImpl: () => Promise<AudioResult>) {
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
  return new QueueManager(resolver, tagger, cfg)
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
