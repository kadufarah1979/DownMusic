import { useEffect, useState } from 'react'
import { UrlBar } from './components/UrlBar'
import { SearchResults } from './components/SearchResults'
import { QueueList } from './components/QueueList'
import { SettingsView } from './components/SettingsView'
import { HistoryView } from './components/HistoryView'
import { OrganizeView } from './components/OrganizeView'
import { HelpView } from './components/HelpView'
import { PlaylistsView } from './components/PlaylistsView'
import { TrackSelectList } from './components/TrackSelectList'
import { useDownloadedChecker } from './lib/downloaded'
import { api } from './ipc'
import type { TrackMeta, SearchGroup } from '@shared/types'

type Tab = 'download' | 'playlists' | 'history' | 'organize' | 'settings' | 'help'

export function App() {
  const [tab, setTab] = useState<Tab>('download')
  const [resolved, setResolved] = useState<TrackMeta[]>([])
  const [searchGroups, setSearchGroups] = useState<SearchGroup[] | null>(null)
  const [downloadDir, setDownloadDir] = useState('')
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [extBusy, setExtBusy] = useState(false)
  const [extError, setExtError] = useState<string | null>(null)
  const isDownloaded = useDownloadedChecker()

  // pasta padrao (Configuracoes) — usada como ponto de partida de cada lista
  useEffect(() => {
    api.getConfig().then((c) => setDownloadDir(c.outputDir))
  }, [])

  // monitor de clipboard: link copiado pré-preenche a barra de URL (aba Download)
  useEffect(
    () =>
      api.onClipboardLink((url) => {
        setClipUrl(url)
        setTab('download')
      }),
    []
  )

  // drag & drop de link em qualquer lugar da janela
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const text = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text') || '').trim()
      const url = text.split(/\s+/)[0]
      if (/^https?:\/\//i.test(url)) resolveExternal(url)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  // ao carregar uma nova lista (link), recomeca na pasta padrao atual e limpa a busca
  function onResolved(tracks: TrackMeta[]) {
    setResolved(tracks)
    setSearchGroups(null)
    api.getConfig().then((c) => setDownloadDir(c.outputDir))
  }

  // ao buscar por texto, mostra os resultados agrupados e limpa a lista resolvida
  function onSearched(groups: SearchGroup[]) {
    setSearchGroups(groups)
    setResolved([])
    api.getConfig().then((c) => setDownloadDir(c.outputDir))
  }

  // troca uma faixa da lista resolvida pela versão extended escolhida
  function replaceResolved(original: TrackMeta, replacement: TrackMeta) {
    setResolved((prev) => prev.map((t) => (t === original ? replacement : t)))
  }

  // resolve uma URL vinda do clipboard ou de drag & drop e leva para a aba Download
  async function resolveExternal(url: string) {
    setTab('download')
    setClipUrl(null)
    setExtError(null)
    setExtBusy(true)
    try {
      onResolved(await api.resolve(url))
    } catch (e) {
      setExtError(e instanceof Error ? e.message : String(e))
    } finally {
      setExtBusy(false)
    }
  }

  async function chooseDownloadDir() {
    const d = await api.pickFolder()
    if (d) setDownloadDir(d)
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="flex items-center gap-4 border-b border-neutral-800 px-4 py-3">
        <h1 className="text-lg font-semibold">DownMusic</h1>
        <nav className="flex gap-1">
          <TabButton active={tab === 'download'} onClick={() => setTab('download')}>Download</TabButton>
          <TabButton active={tab === 'playlists'} onClick={() => setTab('playlists')}>Playlists</TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>Histórico</TabButton>
          <TabButton active={tab === 'organize'} onClick={() => setTab('organize')}>Organizar</TabButton>
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>Configurações</TabButton>
          <TabButton active={tab === 'help'} onClick={() => setTab('help')}>Ajuda</TabButton>
        </nav>
        <button
          onClick={() => api.openFolder()}
          className="ml-auto rounded bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
          title="Abrir a pasta de downloads no gerenciador de arquivos"
        >
          Abrir pasta
        </button>
      </header>

      {extBusy && (
        <div className="border-b border-neutral-800 bg-neutral-800/50 px-4 py-2 text-xs text-emerald-400">
          Carregando faixas…
        </div>
      )}
      {extError && (
        <div className="flex items-center gap-3 border-b border-red-900/60 bg-red-950/30 px-4 py-2 text-xs text-red-300">
          <span className="min-w-0 flex-1 truncate">{extError}</span>
          <button onClick={() => setExtError(null)} className="shrink-0 rounded bg-neutral-700 px-2 py-0.5 hover:bg-neutral-600">
            Fechar
          </button>
        </div>
      )}

      <main className="relative flex flex-1 flex-col overflow-hidden">
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-emerald-500 bg-neutral-900/80">
            <p className="text-lg font-medium text-emerald-300">Solte o link para carregar as faixas</p>
          </div>
        )}
        {tab === 'download' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <UrlBar
              onResolved={onResolved}
              onSearched={onSearched}
              prefill={clipUrl}
              onConsumePrefill={() => setClipUrl(null)}
            />
            {resolved.length > 0 && (
              <div className="flex min-h-0 flex-1 flex-col border-b border-neutral-800">
                <p className="px-4 pb-2 pt-4 text-xs text-neutral-400">
                  {resolved.length} faixa(s) carregada(s) — desmarque o que não quer e enfileire:
                </p>
                <div className="flex items-center gap-2 px-4 pb-2 text-xs text-neutral-400">
                  <span className="shrink-0">Baixar em:</span>
                  <span className="min-w-0 flex-1 truncate rounded bg-neutral-800 px-2 py-1 text-neutral-200">
                    {downloadDir || '(pasta padrão)'}
                  </span>
                  <button
                    onClick={chooseDownloadDir}
                    className="shrink-0 rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600"
                  >
                    Escolher...
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <TrackSelectList
                    tracks={resolved}
                    onEnqueued={() => setResolved([])}
                    isDownloaded={isDownloaded}
                    outputDir={downloadDir || undefined}
                    onReplace={replaceResolved}
                  />
                </div>
              </div>
            )}
            {searchGroups && (
              <div className="min-h-0 flex-1 overflow-y-auto border-b border-neutral-800 p-4">
                {searchGroups.length === 0 || searchGroups.every((g) => g.tracks.length === 0) ? (
                  <p className="text-sm text-neutral-500">Nenhum resultado para a busca.</p>
                ) : (
                  <SearchResults groups={searchGroups} outputDir={downloadDir || undefined} />
                )}
              </div>
            )}
            <QueueList compact={resolved.length > 0 || !!searchGroups} />
          </div>
        )}
        {tab === 'playlists' && <PlaylistsView />}
        {tab === 'history' && <HistoryView />}
        {tab === 'organize' && <OrganizeView />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'help' && <HelpView onGoToSettings={() => setTab('settings')} />}
      </main>
    </div>
  )
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded px-3 py-1 text-sm ${props.active ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
    >
      {props.children}
    </button>
  )
}
