import { useEffect, useState } from 'react'
import { api } from '../ipc'
import { looksLikeUrl } from '@shared/url'
import { SEARCH_PLATFORMS } from '../lib/platforms'
import type { TrackMeta, SearchGroup, SourceId } from '@shared/types'

/**
 * Barra "omnibox": aceita um LINK (resolve as faixas) OU um TEXTO de busca
 * (pesquisa nos motores selecionados e devolve os resultados agrupados).
 */
export function UrlBar({
  onResolved,
  onSearched,
  prefill,
  onConsumePrefill
}: {
  onResolved: (tracks: TrackMeta[]) => void
  onSearched: (groups: SearchGroup[]) => void
  /** Link vindo da área de transferência para pré-preencher o campo. */
  prefill?: string | null
  onConsumePrefill?: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromClipboard, setFromClipboard] = useState(false)
  const [engines, setEngines] = useState<SourceId[]>(SEARCH_PLATFORMS.map((p) => p.id))

  // link copiado detectado no main pré-preenche o campo (sem carregar sozinho)
  useEffect(() => {
    if (prefill) {
      setText(prefill)
      setFromClipboard(true)
      onConsumePrefill?.()
    }
  }, [prefill])

  const isLink = looksLikeUrl(text)

  function toggleEngine(id: SourceId) {
    setEngines((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function submit() {
    const q = text.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      if (looksLikeUrl(q)) {
        onResolved(await api.resolve(q))
        setText('')
        setFromClipboard(false)
      } else {
        if (engines.length === 0) {
          setError('Selecione ao menos um motor de busca.')
          return
        }
        onSearched(await api.search(q, engines))
        setFromClipboard(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-neutral-800 p-4">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFromClipboard(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Cole um link/canal ou digite o nome da música, artista ou festival…"
          className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none placeholder:text-neutral-500"
        />
        <button
          onClick={submit}
          disabled={busy}
          className="whitespace-nowrap rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? '...' : isLink ? 'Carregar faixas' : 'Buscar'}
        </button>
      </div>

      {/* motores de busca (usados quando a entrada é texto) */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="text-xs text-neutral-500">Buscar em:</span>
        {SEARCH_PLATFORMS.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-300">
            <input type="checkbox" checked={engines.includes(p.id)} onChange={() => toggleEngine(p.id)} />
            {p.label}
          </label>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {fromClipboard && text && (
        <p className="mt-2 text-xs text-emerald-400">📋 Link colado da área de transferência — clique em Carregar faixas.</p>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        💡 Cole/arraste um link (música, playlist, canal) ou digite um nome para buscar nos motores.
      </p>
    </div>
  )
}
