import type { TrackMeta, SourceId } from './types'
import { normalizeText } from './text'

/** Uma entrada do historico de downloads (independe do arquivo existir). */
export interface HistoryEntry {
  title: string
  artists: string[]
  isrc?: string
  /** "artistas + titulo" normalizado, para casar a mesma musica entre plataformas. */
  nameKey: string
  sourceId: SourceId
  /** Nome da playlist de origem (quando a faixa veio de uma playlist). */
  playlist?: string
  /** ISO 8601 de quando baixou. */
  downloadedAt: string
  /** Caminho no momento do download (pode nao existir mais). */
  outputPath: string
}

/** Chave normalizada (sem acento/maiuscula) de "artistas + titulo". */
export function nameKey(t: { title: string; artists: string[] }): string {
  return normalizeText(`${t.artists.join(' ')} ${t.title}`)
}

/** Constroi uma entrada de historico a partir de uma faixa baixada. */
export function entryFromTrack(track: TrackMeta, outputPath: string, downloadedAt: string): HistoryEntry {
  return {
    title: track.title,
    artists: track.artists,
    isrc: track.isrc,
    nameKey: nameKey(track),
    sourceId: track.sourceId,
    playlist: track.playlist,
    downloadedAt,
    outputPath
  }
}

/** Duas entradas sao a mesma musica se tem o mesmo ISRC (ambos) ou o mesmo nameKey. */
function sameSong(a: HistoryEntry, b: HistoryEntry): boolean {
  if (a.isrc && b.isrc) return a.isrc === b.isrc
  return a.nameKey === b.nameKey
}

/** Adiciona uma entrada ao historico com dedup (mantem a primeira ocorrencia). */
export function addToHistory(entries: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  if (entries.some((e) => sameSong(e, entry))) return entries
  return [...entries, entry]
}

/** Indice para consulta rapida de "ja baixado". */
export interface DownloadedIndex {
  isrcs: Set<string>
  names: Set<string>
}

export function buildDownloadedIndex(entries: HistoryEntry[]): DownloadedIndex {
  const isrcs = new Set<string>()
  const names = new Set<string>()
  for (const e of entries) {
    if (e.isrc) isrcs.add(e.isrc)
    names.add(e.nameKey)
  }
  return { isrcs, names }
}

/** Uma faixa ja foi baixada se seu ISRC ou seu nameKey estao no indice. */
export function isDownloaded(track: TrackMeta, index: DownloadedIndex): boolean {
  if (track.isrc && index.isrcs.has(track.isrc)) return true
  return index.names.has(nameKey(track))
}
