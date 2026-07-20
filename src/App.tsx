import { useEffect, useState } from 'react'
import { UrlBar } from './components/UrlBar'
import { SearchView } from './components/SearchView'
import { QueueList } from './components/QueueList'
import { SettingsView } from './components/SettingsView'
import { HistoryView } from './components/HistoryView'
import { OrganizeView } from './components/OrganizeView'
import { PlaylistsView } from './components/PlaylistsView'
import { TrackSelectList } from './components/TrackSelectList'
import { useDownloadedChecker } from './lib/downloaded'
import { api } from './ipc'
import type { TrackMeta } from '@shared/types'

type Tab = 'download' | 'search' | 'playlists' | 'history' | 'organize' | 'settings'

export function App() {
  const [tab, setTab] = useState<Tab>('download')
  const [resolved, setResolved] = useState<TrackMeta[]>([])
  const [downloadDir, setDownloadDir] = useState('')
  const isDownloaded = useDownloadedChecker()

  // pasta padrao (Configuracoes) — usada como ponto de partida de cada lista
  useEffect(() => {
    api.getConfig().then((c) => setDownloadDir(c.outputDir))
  }, [])

  // ao resolver uma nova lista, recomeca na pasta padrao atual
  function onResolved(tracks: TrackMeta[]) {
    setResolved(tracks)
    api.getConfig().then((c) => setDownloadDir(c.outputDir))
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
          <TabButton active={tab === 'search'} onClick={() => setTab('search')}>Busca</TabButton>
          <TabButton active={tab === 'playlists'} onClick={() => setTab('playlists')}>Playlists</TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>Historico</TabButton>
          <TabButton active={tab === 'organize'} onClick={() => setTab('organize')}>Organizar</TabButton>
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>Configuracoes</TabButton>
        </nav>
        <button
          onClick={() => api.openFolder()}
          className="ml-auto rounded bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
          title="Abrir a pasta de downloads no gerenciador de arquivos"
        >
          Abrir pasta
        </button>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        {tab === 'download' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <UrlBar onResolved={onResolved} />
            {resolved.length > 0 && (
              <div className="flex min-h-0 flex-1 flex-col border-b border-neutral-800">
                <p className="px-4 pb-2 pt-4 text-xs text-neutral-400">
                  {resolved.length} faixa(s) resolvida(s) — desmarque o que nao quer e enfileire:
                </p>
                <div className="flex items-center gap-2 px-4 pb-2 text-xs text-neutral-400">
                  <span className="shrink-0">Baixar em:</span>
                  <span className="min-w-0 flex-1 truncate rounded bg-neutral-800 px-2 py-1 text-neutral-200">
                    {downloadDir || '(pasta padrao)'}
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
                  />
                </div>
              </div>
            )}
            <QueueList compact={resolved.length > 0} />
          </div>
        )}
        {tab === 'search' && <SearchView />}
        {tab === 'playlists' && <PlaylistsView />}
        {tab === 'history' && <HistoryView />}
        {tab === 'organize' && <OrganizeView />}
        {tab === 'settings' && <SettingsView />}
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
