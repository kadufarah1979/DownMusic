import type { TrackMeta } from './types'

/** Uma faixa lida do disco (tags existentes + qualidade). */
export interface ScannedTrack {
  path: string
  title?: string
  artists: string[]
  album?: string
  genre?: string
  year?: string
  label?: string
  trackNumber?: number
  discNumber?: number
  isrc?: string
  hasCover: boolean
  format: string
  bitrate?: number // kbps
  lossless: boolean
  durationSec?: number
  fileSize: number
}

export interface TrackIssue {
  path: string
  missing: string[] // subconjunto de ['genre','year','label','track','cover']
  lowQuality?: boolean
  unidentified?: boolean // sem título ou sem artista nas tags
}

export interface DuplicateGroup {
  key: string
  keeper: string
  others: string[]
}

export interface AnalysisReport {
  total: number
  genres: { genre: string; count: number }[]
  missingGenre: number
  missingCover: number
  lowQuality: number
  unidentified: number
  duplicates: DuplicateGroup[]
  issues: TrackIssue[]
}

/** Faixa já enriquecida: `filled` são as tags que estavam faltando e foram preenchidas. */
export interface PlannedInput {
  track: ScannedTrack
  filled: Partial<TrackMeta>
}

export interface PlanEntry {
  from: string
  to: string
  needsRetag: boolean
  tags?: Partial<TrackMeta>
  duplicate?: boolean
}

export interface OrganizationPlan {
  rootDir: string
  entries: PlanEntry[]
  collisions: string[]
}

/** Abaixo disto (e não-lossless) é considerado baixa qualidade. */
export const LOW_KBPS = 256
/** Campos que o Rekordbox usa e que valem enriquecer. */
export const REKORDBOX_FIELDS = ['genre', 'year', 'label', 'track', 'cover'] as const
/** Pasta de quarentena para duplicados. */
export const DUP_DIR = '_Duplicados'

/** Ranqueia qualidade: lossless domina; senão, maior bitrate. */
export function qualityRank(t: ScannedTrack): number {
  if (t.lossless) return 1_000_000 + (t.bitrate ?? 0)
  return t.bitrate ?? 0
}
