import Store from 'electron-store'
import { addToHistory, entryFromTrack, type HistoryEntry } from '../../shared/history'
import type { TrackMeta } from '../../shared/types'

interface HistoryData {
  entries: HistoryEntry[]
}

/** Persistencia do historico de downloads (arquivo history.json, separado da config). */
export class HistoryStore {
  private store: Store<HistoryData>

  constructor() {
    this.store = new Store<HistoryData>({ name: 'history', defaults: { entries: [] } })
  }

  list(): HistoryEntry[] {
    return this.store.get('entries')
  }

  /** Registra uma faixa baixada (dedup por ISRC/nome via addToHistory). */
  add(track: TrackMeta, outputPath: string): void {
    const entry = entryFromTrack(track, outputPath, new Date().toISOString())
    this.store.set('entries', addToHistory(this.list(), entry))
  }

  clear(): void {
    this.store.set('entries', [])
  }
}
