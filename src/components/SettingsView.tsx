import { useEffect, useState } from 'react'
import { api } from '../ipc'
import { ResetDialog } from './ResetDialog'
import type { AppConfig } from '@shared/types'

/** Edita config: pasta, template, formato/qualidade, concorrencia, credenciais Spotify. */
export function SettingsView() {
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [saved, setSaved] = useState(false)
  const [showReset, setShowReset] = useState(false)

  useEffect(() => {
    api.getConfig().then(setCfg)
  }, [])

  if (!cfg) return <div className="p-4 text-sm text-neutral-500">Carregando...</div>

  function set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setCfg((c) => (c ? { ...c, [key]: value } : c))
    setSaved(false)
  }

  async function save() {
    if (!cfg) return
    await api.updateConfig(cfg)
    setSaved(true)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-xl space-y-4">
        <Field label="Pasta de destino">
          <div className="flex gap-2">
            <input
              value={cfg.outputDir}
              onChange={(e) => set('outputDir', e.target.value)}
              className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={async () => {
                const dir = await api.pickFolder()
                if (dir) set('outputDir', dir)
              }}
              className="whitespace-nowrap rounded bg-neutral-700 px-3 py-2 text-sm hover:bg-neutral-600"
            >
              Escolher...
            </button>
            <button
              onClick={() => api.openFolder()}
              disabled={!cfg.outputDir}
              className="whitespace-nowrap rounded bg-neutral-700 px-3 py-2 text-sm hover:bg-neutral-600 disabled:opacity-40"
            >
              Abrir pasta
            </button>
          </div>
        </Field>

        <Field label="Template de nome">
          <input
            value={cfg.nameTemplate}
            onChange={(e) => set('nameTemplate', e.target.value)}
            className="w-full rounded bg-neutral-800 px-3 py-2 text-sm outline-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Formato">
            <select
              value={cfg.format}
              onChange={(e) => set('format', e.target.value as AppConfig['format'])}
              className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
            >
              {['mp3', 'flac', 'm4a', 'opus', 'best'].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Qualidade">
            <select
              value={cfg.quality}
              onChange={(e) => set('quality', e.target.value as AppConfig['quality'])}
              className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
            >
              {['128', '192', '256', '320', 'lossless', 'best'].map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Downloads simultâneos">
          <input
            type="number"
            min={1}
            max={10}
            value={cfg.concurrency}
            onChange={(e) => set('concurrency', Number(e.target.value))}
            className="w-24 rounded bg-neutral-800 px-3 py-2 text-sm outline-none"
          />
        </Field>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={cfg.syncOnStartup}
            onChange={(e) => set('syncOnStartup', e.target.checked)}
          />
          Sincronizar playlists ao abrir o app
        </label>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={cfg.watchClipboard}
            onChange={(e) => set('watchClipboard', e.target.checked)}
          />
          Preencher a barra ao copiar um link (monitor da área de transferência)
        </label>

        <fieldset className="rounded border border-neutral-800 p-3">
          <legend className="px-1 text-sm text-neutral-400">Credenciais Spotify (metadados)</legend>
          <div className="space-y-2">
            <input
              placeholder="Client ID"
              value={cfg.spotify.clientId ?? ''}
              onChange={(e) => set('spotify', { ...cfg.spotify, clientId: e.target.value })}
              className="w-full rounded bg-neutral-800 px-3 py-2 text-sm outline-none"
            />
            <input
              placeholder="Client Secret"
              type="password"
              value={cfg.spotify.clientSecret ?? ''}
              onChange={(e) => set('spotify', { ...cfg.spotify, clientSecret: e.target.value })}
              className="w-full rounded bg-neutral-800 px-3 py-2 text-sm outline-none"
            />
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button onClick={save} className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium">Salvar</button>
          {saved && <span className="text-sm text-emerald-400">Salvo.</span>}
        </div>

        <div className="mt-4 border-t border-neutral-800 pt-4">
          <button
            onClick={() => setShowReset(true)}
            className="rounded border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30"
          >
            Resetar / Limpar dados...
          </button>
        </div>
      </div>

      {showReset && <ResetDialog onClose={() => setShowReset(false)} />}
    </div>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-neutral-400">{props.label}</span>
      {props.children}
    </label>
  )
}
