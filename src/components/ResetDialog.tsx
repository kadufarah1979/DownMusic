import { useEffect, useState } from 'react'
import { api } from '../ipc'

/** Modal para limpar seletivamente historico, playlists e/ou arquivos baixados. */
export function ResetDialog({ onClose }: { onClose: () => void }) {
  const [history, setHistory] = useState(false)
  const [playlists, setPlaylists] = useState(false)
  const [downloads, setDownloads] = useState(false)
  const [dir, setDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api.getConfig().then((c) => setDir(c.outputDir))
  }, [])

  const anySelected = history || playlists || downloads

  async function run() {
    if (!anySelected || busy) return
    // confirmacao nativa extra para o caso destrutivo (apagar arquivos)
    if (downloads && !window.confirm(`Apagar TODOS os arquivos em "${dir}"?\n\nIsto NÃO pode ser desfeito.`)) return

    setBusy(true)
    setMsg(null)
    const done: string[] = []
    try {
      if (history) {
        await api.clearHistory()
        done.push('histórico')
      }
      if (playlists) {
        await api.clearPlaylists()
        done.push('playlists')
      }
      if (downloads) {
        const r = await api.clearDownloads()
        done.push(r.ok ? `${r.removed} item(ns) da pasta` : `pasta: ERRO (${r.error})`)
      }
      setMsg('Limpo: ' + done.join(', '))
      setHistory(false)
      setPlaylists(false)
      setDownloads(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-sm font-semibold text-neutral-100">Resetar / Limpar dados</h2>
        <p className="mb-4 text-xs text-neutral-400">Marque o que deseja limpar:</p>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={history} onChange={(e) => setHistory(e.target.checked)} />
            <span className="text-sm">
              Histórico de downloads
              <span className="block text-xs text-neutral-500">apaga as entradas do histórico (não mexe em arquivos)</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={playlists} onChange={(e) => setPlaylists(e.target.checked)} />
            <span className="text-sm">
              Playlists salvas
              <span className="block text-xs text-neutral-500">remove todas as playlists cadastradas</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded border border-red-900/50 bg-red-950/20 p-2">
            <input type="checkbox" className="mt-0.5" checked={downloads} onChange={(e) => setDownloads(e.target.checked)} />
            <span className="text-sm text-red-300">
              ⚠ Arquivos baixados
              <span className="block text-xs text-red-400/80">
                APAGA os arquivos em {dir || '(pasta padrão)'} — irreversível
              </span>
            </span>
          </label>
        </div>

        {msg && <p className="mt-3 text-xs text-emerald-400">{msg}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600">
            Fechar
          </button>
          <button
            onClick={run}
            disabled={!anySelected || busy}
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium hover:bg-red-600 disabled:opacity-40"
          >
            {busy ? '...' : 'Limpar selecionados'}
          </button>
        </div>
      </div>
    </div>
  )
}
