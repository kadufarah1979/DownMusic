import type { QueueItemState } from './types'

export type TrackStatus = 'error' | 'running' | 'queued' | 'downloaded' | 'new'

/**
 * Status de uma faixa numa playlist, combinando historico (persistente) com a
 * fila da sessao atual. Precedencia: erro > baixando > na fila > baixado > novo.
 */
export function trackStatus(ctx: { downloaded: boolean; queueState?: QueueItemState }): TrackStatus {
  const q = ctx.queueState
  if (q === 'error') return 'error'
  if (q === 'running') return 'running'
  if (q === 'queued') return 'queued'
  if (ctx.downloaded || q === 'done') return 'downloaded'
  return 'new'
}
