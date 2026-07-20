import type { HistoryEntry } from './history'

export interface GenreGroup {
  genre: string
  entries: HistoryEntry[]
}

const NO_GENRE = 'Sem genero'

/** Agrupa entradas do historico por genero, ordenado (sem genero por ultimo). */
export function groupByGenre(entries: HistoryEntry[]): GenreGroup[] {
  const map = new Map<string, HistoryEntry[]>()
  for (const e of entries) {
    const g = e.genre?.trim() || NO_GENRE
    const arr = map.get(g)
    if (arr) arr.push(e)
    else map.set(g, [e])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === NO_GENRE ? 1 : b === NO_GENRE ? -1 : a.localeCompare(b, 'pt-BR')))
    .map(([genre, entries]) => ({ genre, entries }))
}
