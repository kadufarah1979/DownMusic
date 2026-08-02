import { useState } from 'react'
import { api } from '../ipc'
import { pruneCandidates } from '@shared/trackListState'
import type { SourceId, TrackMeta } from '@shared/types'

/** Chave de faixa usada em todos os mapas por faixa. */
export const keyOf = (t: TrackMeta) => `${t.sourceId}:${t.id}`

/** Resultado da busca por faixa: em andamento, sem candidata, ou falha. */
export type ExtendedStatus = 'pending' | 'empty' | 'error'

/**
 * Maquina de estado da busca de versao extended POR FAIXA, compartilhada pelas
 * telas que oferecem a busca (lista resolvida/busca por texto e aba Playlists).
 *
 * Ficou num hook em vez de duplicada porque e o pedaco que apodrece: sao tres
 * transicoes (pending -> candidatas | empty | error) que precisam se comportar
 * igual nas duas telas. O que sobra em cada componente e so o botao.
 */
export function useExtendedSearch() {
  const [candidates, setCandidates] = useState<Record<string, Partial<Record<SourceId, TrackMeta>>>>({})
  const [status, setStatus] = useState<Record<string, ExtendedStatus>>({})

  /** Busca a extended de UMA faixa e mescla o resultado, sem tocar nas demais. */
  async function find(t: TrackMeta): Promise<void> {
    const k = keyOf(t)
    setStatus((p) => ({ ...p, [k]: 'pending' }))
    try {
      const found = await api.findExtended(t)
      if (found && Object.keys(found).length > 0) {
        setCandidates((prev) => ({ ...prev, [k]: found }))
        setStatus((p) => {
          const n = { ...p }
          delete n[k]
          return n
        })
      } else {
        setStatus((p) => ({ ...p, [k]: 'empty' }))
      }
    } catch {
      setStatus((p) => ({ ...p, [k]: 'error' }))
    }
  }

  /** Descarta o que sobrou de faixas que sairam da lista. */
  function prune(keys: string[]): void {
    setCandidates((prev) => pruneCandidates(prev, keys))
    setStatus((prev) => pruneCandidates(prev, keys))
  }

  /** Lista de verdade nova (nenhuma faixa em comum): comeca do zero. */
  function reset(): void {
    setCandidates({})
    setStatus({})
  }

  /** Depois de trocar, as candidatas da faixa original nao valem mais. */
  function dropFor(t: TrackMeta): void {
    const k = keyOf(t)
    setCandidates((prev) => {
      const n = { ...prev }
      delete n[k]
      return n
    })
  }

  return { candidates, status, find, prune, reset, dropFor }
}
