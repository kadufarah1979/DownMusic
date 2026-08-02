import { useEffect, useState } from 'react'
import { api } from '../ipc'
import { queueProgress } from '@shared/queueProgress'
import { platformLabel } from '../lib/platforms'
import type { HistoryEntry } from '@shared/history'
import type { QueueItem } from '@shared/types'

/** Quantos downloads recentes mostrar quando a fila esta vazia. */
const RECENT_LIMIT = 10

/**
 * Ocupa a aba Download quando nao ha nada na fila. Sem isso a primeira tela
 * do app abre em branco, o que ja levou a concluir que o app tinha perdido
 * tudo — quando na verdade o historico estava intacto, so nao aparecia aqui.
 * E read-only: sem progresso e sem retry, para nao passar por fila ativa.
 */
function EmptyQueue({ onGoToHistory }: { onGoToHistory?: () => void }) {
  const [recent, setRecent] = useState<HistoryEntry[] | null>(null)

  useEffect(() => {
    api
      .getHistory()
      .then((all) =>
        setRecent(
          [...all]
            .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
            .slice(0, RECENT_LIMIT)
        )
      )
      .catch(() => setRecent([]))
  }, [])

  if (recent === null) return <div className="flex flex-1" />

  if (recent.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-neutral-300">Nada baixado ainda.</p>
        <p className="max-w-sm text-xs text-neutral-500">
          Cole um link de música, álbum, playlist ou canal na barra acima — ou digite um texto para
          buscar.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <span className="text-xs font-medium text-neutral-400">Últimos downloads</span>
        {onGoToHistory && (
          <button onClick={onGoToHistory} className="text-xs text-emerald-400 hover:text-emerald-300">
            Ver histórico completo
          </button>
        )}
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-4">
        {recent.map((e) => (
          <li key={e.nameKey + e.downloadedAt} className="flex items-center gap-3 rounded bg-neutral-800/60 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">
              {e.artists.join(', ')}
              {e.artists.length ? ' — ' : ''}
              {e.title}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">{platformLabel(e.sourceId)}</span>
            <span className="shrink-0 text-xs text-neutral-600">{e.downloadedAt.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Lista os itens da fila com estado e progresso, atualizada via IPC push.
 * `compact` (usado quando ha faixas resolvidas acima): a fila vira uma faixa
 * inferior de altura limitada, para nao roubar espaco da lista resolvida.
 */
export function QueueList({
  compact = false,
  onGoToHistory
}: {
  compact?: boolean
  onGoToHistory?: () => void
}) {
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
  const prog = queueProgress(list)
  const visible = onlyErrors ? list.filter((i) => i.state === 'error') : list

  if (list.length === 0) {
    // no modo compacto o espaco e da lista resolvida acima: so a linha enxuta
    return compact ? (
      <div className="border-t border-neutral-800 px-4 py-2 text-xs text-neutral-500">Fila vazia</div>
    ) : (
      <EmptyQueue onGoToHistory={onGoToHistory} />
    )
  }

  return (
    <div className={`flex ${compact ? 'max-h-[45vh] shrink-0 border-t border-neutral-800' : 'flex-1'} flex-col overflow-hidden`}>
      <div className="border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span className="text-neutral-200">
              {prog.finished ? 'Concluído' : 'Baixando'} {prog.done}/{prog.total}
            </span>
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
        {/* barra de progresso geral */}
        <div className="mt-2 h-1.5 w-full rounded bg-neutral-700">
          <div
            className={`h-1.5 rounded transition-all ${errorCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${prog.pct}%` }}
          />
        </div>
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
