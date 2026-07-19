import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { QueueItem } from '@shared/types'

/**
 * Lista os itens da fila com estado e progresso, atualizada via IPC push.
 * `compact` (usado quando ha faixas resolvidas acima): a fila vira uma faixa
 * inferior de altura limitada, para nao roubar espaco da lista resolvida.
 */
export function QueueList({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<Record<string, QueueItem>>({})
  const [onlyErrors, setOnlyErrors] = useState(false)

  useEffect(() => {
    api.queueList().then((list) => {
      setItems(Object.fromEntries(list.map((i) => [i.itemId, i])))
    })
    const off = api.onQueueUpdate((item) => {
      setItems((prev) => ({ ...prev, [item.itemId]: item }))
    })
    return off
  }, [])

  const list = Object.values(items)
  const errorCount = list.filter((i) => i.state === 'error').length
  const visible = onlyErrors ? list.filter((i) => i.state === 'error') : list

  if (list.length === 0) {
    return compact ? (
      <div className="border-t border-neutral-800 px-4 py-2 text-xs text-neutral-500">Fila vazia</div>
    ) : (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Fila vazia</div>
    )
  }

  return (
    <div className={`flex ${compact ? 'max-h-[45vh] shrink-0 border-t border-neutral-800' : 'flex-1'} flex-col overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span>{list.length} na fila</span>
          {errorCount > 0 && <span className="text-red-400">· {errorCount} com erro</span>}
          {errorCount > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={onlyErrors} onChange={() => setOnlyErrors((v) => !v)} />
              Só com erro
            </label>
          )}
        </div>
        {errorCount > 0 && (
          <button
            onClick={() => api.retryFailed()}
            className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600"
          >
            ↻ Tentar novamente ({errorCount})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          {visible.map((it) => (
            <li key={it.itemId} className="rounded bg-neutral-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex-1 text-sm">
                  {it.meta.artists.join(', ')} — {it.meta.title}
                </span>
                {it.state === 'error' && (
                  <button
                    onClick={() => api.retry(it.itemId)}
                    className="rounded bg-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-600"
                  >
                    ↻ Tentar
                  </button>
                )}
                <StateBadge item={it} />
              </div>
              <div className="mt-2 h-1.5 w-full rounded bg-neutral-700">
                <div
                  className={`h-1.5 rounded transition-all ${it.state === 'error' ? 'bg-red-500/50' : 'bg-emerald-500'}`}
                  style={{ width: `${it.progress}%` }}
                />
              </div>
              {it.error && <p className="mt-1 text-xs text-red-400">{it.error}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function StateBadge({ item }: { item: QueueItem }) {
  const map: Record<string, string> = {
    queued: 'text-neutral-400',
    running: 'text-blue-400',
    done: 'text-emerald-400',
    error: 'text-red-400',
    canceled: 'text-neutral-500'
  }
  return <span className={`text-xs ${map[item.state]}`}>{item.state}</span>
}
