import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { QueueItem } from '@shared/types'

/** Lista os itens da fila com estado e progresso, atualizada via IPC push. */
export function QueueList() {
  const [items, setItems] = useState<Record<string, QueueItem>>({})

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

  if (list.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Fila vazia</div>
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <ul className="space-y-2">
        {list.map((it) => (
          <li key={it.itemId} className="rounded bg-neutral-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {it.meta.artists.join(', ')} — {it.meta.title}
              </span>
              <StateBadge item={it} />
            </div>
            <div className="mt-2 h-1.5 w-full rounded bg-neutral-700">
              <div
                className="h-1.5 rounded bg-emerald-500 transition-all"
                style={{ width: `${it.progress}%` }}
              />
            </div>
            {it.error && <p className="mt-1 text-xs text-red-400">{it.error}</p>}
          </li>
        ))}
      </ul>
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
