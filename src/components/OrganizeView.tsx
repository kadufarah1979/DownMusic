import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { AnalysisReport, OrganizationPlan } from '@shared/library'

const DEFAULT_TPL = '%genre%/%artist% - %title%'

export function OrganizeView() {
  const [dir, setDir] = useState('')
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [unreadable, setUnreadable] = useState<string[]>([])
  const [template, setTemplate] = useState(DEFAULT_TPL)
  const [plan, setPlan] = useState<OrganizationPlan | null>(null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState('')

  useEffect(() => api.onLibraryProgress((p) => setProgress(p)), [])

  async function pick() {
    const d = await api.pickFolder()
    if (d) {
      setDir(d)
      setReport(null)
      setPlan(null)
      setResult('')
    }
  }
  async function analyze() {
    setBusy('Analisando...')
    setPlan(null)
    setResult('')
    const { report, unreadable } = await api.libraryScanAnalyze(dir)
    setReport(report)
    setUnreadable(unreadable)
    setBusy('')
  }
  async function makePlan() {
    setBusy('Enriquecendo e planejando...')
    setPlan(await api.libraryPlan(dir, template))
    setBusy('')
  }
  async function apply() {
    if (!plan) return
    if (!confirm(`Aplicar reorganização em ${plan.entries.length} arquivo(s)? Duplicados vão para _Duplicados/.`)) return
    setBusy('Aplicando...')
    setProgress({ done: 0, total: plan.entries.length })
    const r = await api.libraryApply(plan)
    setResult(`Movidos: ${r.moved} · Retagueados: ${r.retagged} · Duplicados: ${r.quarantined} · Falhas: ${r.failed.length}`)
    setBusy('')
    setProgress(null)
    setPlan(null)
    setReport(null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-neutral-800 p-4">
        <button onClick={pick} className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600">Escolher pasta</button>
        <span className="flex-1 truncate text-xs text-neutral-400">{dir || 'Nenhuma pasta selecionada'}</span>
        <button onClick={analyze} disabled={!dir || !!busy} className="rounded bg-emerald-600 px-3 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40">Analisar</button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {busy && <p className="text-sm text-emerald-400">{busy}</p>}

        {report && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Card label="Faixas" value={report.total} />
            <Card label="Gêneros" value={report.genres.length} />
            <Card label="Sem gênero" value={report.missingGenre} />
            <Card label="Sem capa" value={report.missingCover} />
            <Card label="Baixa qualidade" value={report.lowQuality} />
            <Card label="Duplicados" value={report.duplicates.length} />
            <Card label="Não identificados" value={report.unidentified} />
            <Card label="Ilegíveis" value={unreadable.length} />
          </div>
        )}

        {report && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400">Template:</label>
            <input value={template} onChange={(e) => setTemplate(e.target.value)} className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs" />
            <button onClick={makePlan} disabled={!!busy} className="rounded bg-emerald-600 px-3 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40">Gerar plano</button>
          </div>
        )}

        {plan && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {plan.entries.length} mudança(s){plan.collisions.length ? ` · ${plan.collisions.length} colisão(ões) ignorada(s)` : ''}
              </span>
              <button onClick={apply} disabled={!!busy} className="rounded bg-emerald-600 px-3 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40">Aplicar</button>
            </div>
            <ul className="space-y-1 text-xs">
              {plan.entries.slice(0, 200).map((e, i) => (
                <li key={i} className="rounded bg-neutral-800 p-2">
                  <div className="truncate text-neutral-400">{e.from}</div>
                  <div className="truncate text-emerald-300">
                    → {e.to} {e.needsRetag ? '· (tags)' : ''} {e.duplicate ? '· (duplicado)' : ''}
                  </div>
                </li>
              ))}
              {plan.entries.length > 200 && <li className="text-neutral-500">…e mais {plan.entries.length - 200}</li>}
            </ul>
          </div>
        )}

        {progress && <p className="text-sm text-emerald-400">Aplicando {progress.done}/{progress.total}…</p>}
        {result && <p className="text-sm text-emerald-300">{result}</p>}
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-neutral-800 p-3">
      <div className="text-lg font-semibold text-neutral-100">{value}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  )
}
