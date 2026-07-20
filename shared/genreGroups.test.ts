import { describe, it, expect } from 'vitest'
import { groupByGenre } from './genreGroups'
import type { HistoryEntry } from './history'

const e = (title: string, genre?: string): HistoryEntry => ({
  title,
  artists: ['A'],
  nameKey: title.toLowerCase(),
  sourceId: 'deezer',
  genre,
  downloadedAt: '2026-01-01T00:00:00Z',
  outputPath: '/x.mp3'
})

describe('groupByGenre', () => {
  it('agrupa por genero, ordenado, com "Sem genero" por ultimo', () => {
    const groups = groupByGenre([e('a', 'Reggae'), e('b', 'Pop'), e('c'), e('d', 'Reggae')])
    expect(groups.map((g) => g.genre)).toEqual(['Pop', 'Reggae', 'Sem genero'])
    expect(groups.find((g) => g.genre === 'Reggae')?.entries).toHaveLength(2)
    expect(groups.find((g) => g.genre === 'Sem genero')?.entries).toHaveLength(1)
  })

  it('lista vazia -> nenhum grupo', () => {
    expect(groupByGenre([])).toEqual([])
  })
})
