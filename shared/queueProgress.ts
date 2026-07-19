import type { QueueItem } from './types'

export interface QueueProgress {
  total: number
  done: number
  error: number
  /** 0..100 — fracao da fila ja processada (concluidos + erros). */
  pct: number
  /** true quando todos os itens foram processados (done ou error). */
  finished: boolean
}

/** Resumo do progresso geral da fila a partir dos itens. */
export function queueProgress(items: QueueItem[]): QueueProgress {
  const total = items.length
  const done = items.filter((i) => i.state === 'done').length
  const error = items.filter((i) => i.state === 'error').length
  const pct = total ? Math.round(((done + error) / total) * 100) : 0
  return { total, done, error, pct, finished: total > 0 && done + error === total }
}
