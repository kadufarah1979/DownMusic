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

/** Pontuação por passar palavra-chave + relevância de título. */
const BASE_SCORE = 10
/** Piso proporcional: abaixo disso é remaster/master com silêncio, não extended. */
const MIN_RATIO = 1.2
/** Piso absoluto, para faixas longas em que 1,2x seria exigir minutos a mais. */
const MIN_GAIN_SEC = 60
/** Teto: acima disso é DJ set, continuous mix ou megamix contendo a faixa. */
const MAX_RATIO = 3
/** Proporção de uma extended típica — onde o bônus é máximo. */
const PEAK_RATIO = 1.5
/** Bônus máximo de duração, atingido em `PEAK_RATIO`. */
const DURATION_BONUS_MAX = 20
/** Casas decimais da pontuação: sem isso o ruído de ponto flutuante desempata sozinho. */
const SCORE_PRECISION = 1e4

/**
 * True quando dá para comparar as durações. Sem uma das duas o candidato
 * qualifica só pelo nome — a UI precisa avisar que o tempo não foi conferido.
 */
export function isDurationVerified(input: ScoreInput, cand: TrackMeta): boolean {
  return Boolean(input.originalDurationSec && cand.durationSec)
}

/**
 * Bônus de duração, ou `null` quando a candidata é reprovada pelo piso (pouco
 * mais longa) ou pelo teto (desproporcionalmente longa). Cresce até `PEAK_RATIO`
 * e decresce depois, para uma faixa 3x não valer mais que uma extended típica.
 */
function durationBonus(od: number, cd: number): number | null {
  const ratio = cd / od
  if (ratio > MAX_RATIO) return null
  if (ratio < MIN_RATIO && cd - od < MIN_GAIN_SEC) return null
  const t =
    ratio <= PEAK_RATIO
      ? (ratio - 1) / (PEAK_RATIO - 1)
      : (MAX_RATIO - ratio) / (MAX_RATIO - PEAK_RATIO)
  return DURATION_BONUS_MAX * Math.max(0, Math.min(1, t))
}

/**
 * Pontua um candidato como versão extended. Retorna 0 (não qualificado) quando
 * falta palavra-chave, o título não bate, ou a duração não passa no piso/teto.
 * Sem duração dos dois lados fica só com a pontuação base — ver `isDurationVerified`.
 */
export function scoreExtendedCandidate(input: ScoreInput, cand: TrackMeta): number {
  if (!isExtendedTitle(cand.title)) return 0
  if (!titleMatches(input.originalTitle, cand.title)) return 0

  const od = input.originalDurationSec
  const cd = cand.durationSec
  if (!od || !cd) return BASE_SCORE

  const bonus = durationBonus(od, cd)
  if (bonus === null) return 0
  return Math.round((BASE_SCORE + bonus) * SCORE_PRECISION) / SCORE_PRECISION
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
