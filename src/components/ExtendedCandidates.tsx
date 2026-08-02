import { api } from '../ipc'
import { isDurationVerified } from '@shared/extended'
import type { SourceId, TrackMeta } from '@shared/types'
import type { ExtendedStatus } from '../lib/useExtendedSearch'

/**
 * Rotulo por fonte. Mapa proprio em vez de `platformLabel`: aquele cai no id cru
 * para bandcamp/generic, e aqui o rotulo aparece para o usuario.
 */
const SRC_LABEL: Record<SourceId, string> = {
  spotify: 'Spotify', deezer: 'Deezer', youtube: 'YouTube',
  soundcloud: 'SoundCloud', bandcamp: 'Bandcamp', generic: 'Outros'
}

/** Formata segundos como m:ss. */
function fmtDur(sec?: number): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Resultado da busca de versao extended de UMA faixa: o aviso de "nenhuma
 * encontrada"/"falhou" ou a lista de candidatas com a opcao de trocar.
 *
 * Compartilhado entre a lista resolvida (`TrackSelectList`) e a aba Playlists
 * (`PlaylistTracks`) — inclusive o selo de "tempo nao conferido" da TASK-1633,
 * que e a parte que ninguem lembraria de replicar na segunda tela.
 */
export function ExtendedCandidates({
  track,
  status,
  candidates,
  onSwap
}: {
  track: TrackMeta
  status?: ExtendedStatus
  candidates?: Partial<Record<SourceId, TrackMeta>>
  onSwap: (original: TrackMeta, replacement: TrackMeta) => void
}) {
  if (status === 'empty') {
    return (
      <p className="mt-2 pl-8 text-xs text-neutral-500">
        Nenhuma versão extended encontrada — versões pouco mais longas que a original ou
        desproporcionalmente longas (DJ sets, megamixes) são descartadas.
      </p>
    )
  }
  if (status === 'error') {
    return <p className="mt-2 pl-8 text-xs text-red-400">Falha ao buscar a versão extended desta faixa.</p>
  }
  if (!candidates) return null

  return (
    <div className="mt-2 space-y-1 border-l-2 border-emerald-800/70 pl-3">
      <p className="text-xs text-neutral-500">Versões extended encontradas — escolha para trocar:</p>
      {(Object.entries(candidates) as [SourceId, TrackMeta][]).map(([src, cand]) => (
        <div key={src} className="flex items-center gap-2 text-xs">
          <span className="shrink-0 rounded bg-neutral-700 px-1.5 py-0.5 text-neutral-300">{SRC_LABEL[src]}</span>
          <span className="min-w-0 flex-1 truncate text-neutral-300">
            {cand.title}
            {cand.durationSec ? ` · ${fmtDur(cand.durationSec)}` : ''}
          </span>
          {!isDurationVerified({ originalTitle: track.title, originalDurationSec: track.durationSec }, cand) && (
            <span
              title={
                track.durationSec
                  ? 'Esta versão não informa a duração — só o nome foi conferido.'
                  : 'A faixa original não informa a duração — só o nome foi conferido.'
              }
              className="shrink-0 rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-300"
            >
              ⚠ tempo não conferido
            </span>
          )}
          <button
            onClick={() => cand.sourceUrl && api.openExternal(cand.sourceUrl)}
            disabled={!cand.sourceUrl}
            title="Ouvir esta versão"
            className="shrink-0 rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-30"
          >
            ↗
          </button>
          <button
            onClick={() => onSwap(track, cand)}
            className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 hover:bg-emerald-500"
          >
            Trocar
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Botao "buscar extended desta faixa". `pending` (esta faixa) e `disabled`
 * (ex.: busca em lote em andamento) sao separados de proposito: durante o lote
 * o botao fica inerte, mas so a faixa em andamento mostra o "…".
 */
export function ExtendedButton({
  pending,
  disabled,
  onClick
}: {
  pending: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending || disabled}
      title="Procurar a versão extended desta faixa"
      className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-30"
    >
      {pending ? '…' : '⏱'}
    </button>
  )
}
