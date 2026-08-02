import Store from 'electron-store'
import { addToHistory, entryFromTrack, type HistoryEntry } from '../../shared/history'
import type { TrackMeta } from '../../shared/types'

interface HistoryData {
  entries: HistoryEntry[]
}

/**
 * A fatia do electron-store que esta classe usa. Existe para o teste injetar um
 * duplo em memoria: instanciado de verdade fora do Electron, o electron-store
 * grava em `~/.config/electron-store-nodejs/` e o estado vaza entre execucoes.
 */
export interface HistoryBackend {
  get(key: 'entries'): HistoryEntry[]
  set(key: 'entries', value: HistoryEntry[]): void
}

/** Persistencia do historico de downloads (arquivo history.json, separado da config). */
export class HistoryStore {
  private store: HistoryBackend

  constructor(store: HistoryBackend = new Store<HistoryData>({ name: 'history', defaults: { entries: [] } })) {
    this.store = store
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
