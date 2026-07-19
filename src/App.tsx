import { useState } from 'react'
import { UrlBar } from './components/UrlBar'
import { SearchView } from './components/SearchView'
import { QueueList } from './components/QueueList'
import { SettingsView } from './components/SettingsView'
import { TrackSelectList } from './components/TrackSelectList'
import type { TrackMeta } from '@shared/types'

type Tab = 'download' | 'search' | 'settings'

export function App() {
  const [tab, setTab] = useState<Tab>('download')
  const [resolved, setResolved] = useState<TrackMeta[]>([])

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="flex items-center gap-4 border-b border-neutral-800 px-4 py-3">
        <h1 className="text-lg font-semibold">DownMusic</h1>
        <nav className="flex gap-1">
          <TabButton active={tab === 'download'} onClick={() => setTab('download')}>Download</TabButton>
          <TabButton active={tab === 'search'} onClick={() => setTab('search')}>Busca</TabButton>
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>Configuracoes</TabButton>
        </nav>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        {tab === 'download' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <UrlBar onResolved={setResolved} />
            {resolved.length > 0 && (
              <div className="border-b border-neutral-800 p-4">
                <p className="mb-2 text-xs text-neutral-400">
                  {resolved.length} faixa(s) resolvida(s) — desmarque o que nao quer e enfileire:
                </p>
                <TrackSelectList tracks={resolved} onEnqueued={() => setResolved([])} />
              </div>
            )}
            <QueueList />
          </div>
        )}
        {tab === 'search' && <SearchView />}
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
