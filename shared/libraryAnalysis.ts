import { nameKey } from './history'
import { qualityRank, LOW_KBPS, type ScannedTrack, type DuplicateGroup, type TrackIssue, type AnalysisReport } from './library'

const NO_GENRE = 'Sem genero'

/** Agrupa duplicados por ISRC (senão por artista+título) e elege a de maior qualidade. */
export function findDuplicates(tracks: ScannedTrack[]): DuplicateGroup[] {
  const map = new Map<string, ScannedTrack[]>()
  for (const t of tracks) {
    if (!t.title || t.artists.length === 0) continue // não identificado não entra em grupo
    const key = t.isrc ? `isrc:${t.isrc.toLowerCase()}` : `name:${nameKey({ title: t.title, artists: t.artists })}`
    const arr = map.get(key)
    if (arr) arr.push(t)
    else map.set(key, [t])
  }
  const groups: DuplicateGroup[] = []
  for (const [key, arr] of map) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => qualityRank(b) - qualityRank(a) || a.path.localeCompare(b.path))
    groups.push({ key, keeper: sorted[0].path, others: sorted.slice(1).map((t) => t.path) })
  }
  return groups
}

/** Analisa o acervo: faltantes, qualidade, não identificados, duplicados, gêneros. */
export function analyzeLibrary(tracks: ScannedTrack[]): AnalysisReport {
  const issues: TrackIssue[] = []
  const genreCount = new Map<string, number>()
  let missingGenre = 0
  let missingCover = 0
  let lowQuality = 0
  let unidentified = 0

  for (const t of tracks) {
    const g = t.genre?.trim() || NO_GENRE
    genreCount.set(g, (genreCount.get(g) ?? 0) + 1)

    const missing: string[] = []
    if (!t.genre) missing.push('genre')
    if (!t.year) missing.push('year')
    if (!t.label) missing.push('label')
    if (t.trackNumber == null) missing.push('track')
    if (!t.hasCover) missing.push('cover')

    const low = !t.lossless && t.bitrate != null && t.bitrate < LOW_KBPS
    const unid = !t.title || t.artists.length === 0

    if (!t.genre) missingGenre++
    if (!t.hasCover) missingCover++
    if (low) lowQuality++
    if (unid) unidentified++

    if (missing.length || low || unid) {
      issues.push({ path: t.path, missing, ...(low && { lowQuality: true }), ...(unid && { unidentified: true }) })
    }
  }

  const genres = [...genreCount.entries()]
    .sort(([a], [b]) => (a === NO_GENRE ? 1 : b === NO_GENRE ? -1 : a.localeCompare(b, 'pt-BR')))
    .map(([genre, count]) => ({ genre, count }))

  return { total: tracks.length, genres, missingGenre, missingCover, lowQuality, unidentified, duplicates: findDuplicates(tracks), issues }
}
