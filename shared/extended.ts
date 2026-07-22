import type { TrackMeta, SourceId } from './types'

/** Palavras-chave que indicam uma versão estendida. */
const KEYWORDS = /(extended|club mix|long version|extended mix|extended version|12["”])/i

/** True se o título indica uma versão extended. */
export function isExtendedTitle(title: string): boolean {
  return KEYWORDS.test(title)
}

/** Normaliza para comparar títulos: minúsculas, sem acentos e só alfanumérico. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** True se o candidato parece ser a MESMA faixa do original (evita falso-positivo). */
export function titleMatches(originalTitle: string, candidateTitle: string): boolean {
  const o = norm(originalTitle)
  const c = norm(candidateTitle)
  if (!o) return true
  if (c.includes(o)) return true
  // fallback: todas as palavras relevantes (>2 letras) do original aparecem no candidato
  const words = o.split(' ').filter((w) => w.length > 2)
  return words.length > 0 && words.every((w) => c.includes(w))
}

export interface ScoreInput {
  originalTitle: string
  originalDurationSec?: number
}

/**
 * Pontua um candidato como versão extended. Retorna 0 (não qualificado) quando
 * falta palavra-chave, o título não bate, ou a duração não é maior que a original.
 */
export function scoreExtendedCandidate(input: ScoreInput, cand: TrackMeta): number {
  if (!isExtendedTitle(cand.title)) return 0
  if (!titleMatches(input.originalTitle, cand.title)) return 0

  let score = 10 // passou palavra-chave + relevância
  const od = input.originalDurationSec
  const cd = cand.durationSec
  if (od && cd) {
    if (cd <= od) return 0 // extended tem que ser MAIS longa
    score += Math.min(20, ((cd - od) / od) * 20) // bônus proporcional ao quão mais longa
  } else if (cd) {
    score += 5 // sem duração original: pequeno bônus por ter duração conhecida
  }
  return score
}

/** Escolhe a melhor candidata extended de cada fonte (apenas as qualificadas). */
export function pickBestPerSource(
  input: ScoreInput,
  groups: { sourceId: SourceId; tracks: TrackMeta[] }[]
): Partial<Record<SourceId, TrackMeta>> {
  const out: Partial<Record<SourceId, TrackMeta>> = {}
  for (const g of groups) {
    let best: TrackMeta | undefined
    let bestScore = 0
    for (const t of g.tracks) {
      const s = scoreExtendedCandidate(input, t)
      if (s > bestScore) {
        bestScore = s
        best = t
      }
    }
    if (best) out[g.sourceId] = best
  }
  return out
}
