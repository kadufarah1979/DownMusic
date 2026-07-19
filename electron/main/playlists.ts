import Store from 'electron-store'
import { buildDownloadedIndex } from '../../shared/history'
import { pickNewTracks } from '../../shared/playlist'
import type { PlaylistSubscription } from '../../shared/types'
import type { Resolver } from './resolver'
import type { QueueManager } from './queue'
import type { HistoryStore } from './history'

interface PlaylistData {
  subs: PlaylistSubscription[]
}

/** Persistencia das playlists cadastradas (arquivo playlists.json). */
export class PlaylistStore {
  private store: Store<PlaylistData>

  constructor() {
    this.store = new Store<PlaylistData>({ name: 'playlists', defaults: { subs: [] } })
  }

  list(): PlaylistSubscription[] {
    return this.store.get('subs')
  }

  upsert(sub: PlaylistSubscription): void {
    const subs = this.list().filter((s) => s.url !== sub.url)
    this.store.set('subs', [...subs, sub])
  }

  update(url: string, patch: Partial<PlaylistSubscription>): void {
    this.store.set(
      'subs',
      this.list().map((s) => (s.url === url ? { ...s, ...patch } : s))
    )
  }

  remove(url: string): void {
    this.store.set(
      'subs',
      this.list().filter((s) => s.url !== url)
    )
  }

  clear(): void {
    this.store.set('subs', [])
  }
}

/** Resultado de uma sincronizacao. */
export interface SyncResult {
  added: number
  total: number
}

/**
 * Coordena cadastro e sincronizacao de playlists: resolve a playlist, filtra as
 * faixas ainda nao baixadas (via historico) e enfileira so as novas.
 */
export class PlaylistService {
  constructor(
    private readonly store: PlaylistStore,
    private readonly resolver: Resolver,
    private readonly history: HistoryStore,
    private readonly queue: QueueManager
  ) {}

  list(): PlaylistSubscription[] {
    return this.store.list()
  }

  /** Cadastra uma playlist (resolve para descobrir nome/plataforma/contagem). */
  async add(url: string): Promise<PlaylistSubscription> {
    const tracks = await this.resolver.resolve(url)
    if (tracks.length === 0) throw new Error('Playlist vazia ou nao reconhecida.')
    const sub: PlaylistSubscription = {
      url,
      name: tracks[0].playlist ?? url,
      sourceId: tracks[0].sourceId,
      addedAt: new Date().toISOString(),
      trackCount: tracks.length
    }
    this.store.upsert(sub)
    return sub
  }

  remove(url: string): void {
    this.store.remove(url)
  }

  /** Remove todas as playlists cadastradas. */
  clear(): void {
    this.store.clear()
  }

  /** Sincroniza uma playlist: enfileira as faixas ainda nao baixadas. */
  async sync(url: string): Promise<SyncResult> {
    const tracks = await this.resolver.resolve(url)
    const index = buildDownloadedIndex(this.history.list())
    const news = pickNewTracks(tracks, index)
    for (const t of news) this.queue.enqueue(t)
    this.store.update(url, { lastSyncedAt: new Date().toISOString(), trackCount: tracks.length })
    return { added: news.length, total: tracks.length }
  }

  /** Sincroniza todas as playlists cadastradas. */
  async syncAll(): Promise<SyncResult> {
    let added = 0
    let total = 0
    for (const sub of this.list()) {
      const r = await this.sync(sub.url)
      added += r.added
      total += r.total
    }
    return { added, total }
  }
}
