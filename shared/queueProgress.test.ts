import { describe, it, expect } from 'vitest'
import { queueProgress } from './queueProgress'
import type { QueueItem, QueueItemState } from './types'

const item = (state: QueueItemState): QueueItem => ({
  itemId: Math.random().toString(),
  meta: { id: 'x', title: 'x', artists: [], sourceId: 'youtube', sourceUrl: '' },
  state,
  progress: 0
})

const items = (...states: QueueItemState[]) => states.map(item)

describe('queueProgress', () => {
  it('fila vazia -> zeros', () => {
    expect(queueProgress([])).toEqual({ total: 0, done: 0, error: 0, pct: 0, finished: false })
  })

  it('conta done/error e calcula pct por itens processados', () => {
    // 10 itens: 4 done, 1 erro, 5 na fila/baixando -> pct = (4+1)/10 = 50%
    const list = items('done', 'done', 'done', 'done', 'error', 'queued', 'running', 'queued', 'queued', 'running')
    expect(queueProgress(list)).toMatchObject({ total: 10, done: 4, error: 1, pct: 50, finished: false })
  })

  it('finished quando done+error == total (barra cheia mesmo com erro)', () => {
    const list = items('done', 'done', 'error')
    const r = queueProgress(list)
    expect(r.pct).toBe(100)
    expect(r.finished).toBe(true)
  })
})
