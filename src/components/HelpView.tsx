import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { UpdateInfo } from '@shared/version'

const RELEASES_URL = 'https://github.com/kadufarah1979/DownMusic/releases'
const SPOTIFY_DASHBOARD = 'https://developer.spotify.com/dashboard'

/** Aba Ajuda: versao/atualizacao, guia de uso e como configurar o Spotify. */
export function HelpView({ onGoToSettings }: { onGoToSettings: () => void }) {
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    api.getVersion().then(setVersion)
  }, [])

  async function check() {
    setChecking(true)
    setUpdate(null)
    setUpdate(await api.checkUpdate())
    setChecking(false)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl space-y-6">
        {/* Versao / atualizacao */}
        <Section title="Sobre & Atualizacoes">
          <p className="text-sm text-neutral-300">
            DownMusic <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-100">v{version || '—'}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={check}
              disabled={checking}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-500 disabled:opacity-40"
            >
              {checking ? 'Verificando…' : 'Verificar atualizacao'}
            </button>
            <button
              onClick={() => api.openExternal(RELEASES_URL)}
              className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600"
            >
              Ver todas as versoes
            </button>
          </div>

          {update && update.error && (
            <p className="mt-3 text-sm text-amber-400">
              Nao foi possivel verificar agora ({update.error}). Tente novamente ou veja em “Ver todas as versoes”.
            </p>
          )}
          {update && !update.error && update.isNewer && (
            <div className="mt-3 rounded border border-emerald-800/60 bg-emerald-950/40 p-3 text-sm">
              <p className="text-emerald-300">🎉 Nova versao <strong>v{update.latest}</strong> disponivel (voce tem v{update.current}).</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {update.downloadUrl && (
                  <button
                    onClick={() => api.openExternal(update.downloadUrl!)}
                    className="rounded bg-emerald-600 px-3 py-1.5 hover:bg-emerald-500"
                  >
                    Baixar para o meu sistema
                  </button>
                )}
                {update.notesUrl && (
                  <button
                    onClick={() => api.openExternal(update.notesUrl!)}
                    className="rounded bg-neutral-700 px-3 py-1.5 hover:bg-neutral-600"
                  >
                    Ver novidades
                  </button>
                )}
              </div>
            </div>
          )}
          {update && !update.error && !update.isNewer && update.latest && (
            <p className="mt-3 text-sm text-emerald-400">✓ Voce esta na versao mais recente (v{update.latest}).</p>
          )}
        </Section>

        {/* Como usar */}
        <Section title="Como usar">
          <ul className="space-y-2 text-sm text-neutral-300">
            <li><strong className="text-neutral-100">Download:</strong> cole um link ou <em>canal</em> (YouTube, Spotify, SoundCloud, TikTok, Vimeo…) — ou arraste o link para a janela —, revise as faixas e enfileire.</li>
            <li><strong className="text-neutral-100">Busca:</strong> pesquise por texto em varias fontes ao mesmo tempo.</li>
            <li><strong className="text-neutral-100">Playlists:</strong> cadastre uma playlist ou canal para sincronizar e baixar automaticamente os itens novos.</li>
            <li><strong className="text-neutral-100">Organizar:</strong> analise uma pasta, enriqueca as tags (Deezer) e aplique a reorganizacao por genero (estilo Rekordbox).</li>
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            💡 O monitor de area de transferencia sugere resolver links copiados — ligue/desligue em Configuracoes.
          </p>
        </Section>

        {/* Spotify */}
        <Section title="Configurar o Spotify (Client ID e Client Secret)">
          <p className="text-sm text-neutral-300">
            O Spotify e usado apenas para <strong>metadados</strong> (titulo, artista, capa, genero). O audio e baixado
            de fontes publicas via YouTube. Para resolver links do Spotify, informe suas credenciais:
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
            <li>Acesse o <button onClick={() => api.openExternal(SPOTIFY_DASHBOARD)} className="text-emerald-400 underline hover:text-emerald-300">Dashboard do Spotify</button> e faca login.</li>
            <li>Clique em <strong>Create app</strong>. Preencha nome e descricao (quaisquer).</li>
            <li>Em <strong>Redirect URI</strong>, coloque <code className="rounded bg-neutral-800 px-1">http://localhost:8888/callback</code> (o formulario exige, mas nao e usado) e marque <strong>Web API</strong>.</li>
            <li>Abra o app criado → <strong>Settings</strong> e copie o <strong>Client ID</strong> e o <strong>Client Secret</strong>.</li>
            <li>Cole em <strong>Configuracoes → Credenciais Spotify</strong> e clique em <strong>Salvar</strong>.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => api.openExternal(SPOTIFY_DASHBOARD)} className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600">
              Abrir Dashboard do Spotify
            </button>
            <button onClick={onGoToSettings} className="rounded bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-500">
              Ir para Configuracoes
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Sem credenciais, as demais fontes (YouTube, SoundCloud, Bandcamp, Deezer e links diretos) seguem funcionando normalmente.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-neutral-800 p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-100">{title}</h2>
      {children}
    </section>
  )
}
