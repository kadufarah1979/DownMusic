import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, QueueItem, TrackMeta, SearchGroup, SourceId, PlaylistSubscription } from '../../shared/types'
import type { HistoryEntry } from '../../shared/history'

/** Nomes de canais espelhados de main/ipc.ts. */
const CH = {
  resolve: 'resolve',
  search: 'search',
  enqueue: 'enqueue',
  queueList: 'queue:list',
  queueUpdate: 'queue:update',
  configGet: 'config:get',
  configUpdate: 'config:update',
  pickFolder: 'dialog:pickFolder',
  openFolder: 'shell:openFolder',
  openExternal: 'shell:openExternal',
  historyList: 'history:list',
  historyClear: 'history:clear',
  queueRetry: 'queue:retry',
  queueRetryFailed: 'queue:retryFailed',
  playlistList: 'playlist:list',
  playlistAdd: 'playlist:add',
  playlistRemove: 'playlist:remove',
  playlistSync: 'playlist:sync',
  playlistSyncAll: 'playlist:syncAll'
} as const

/** API tipada exposta ao renderer via contextBridge. */
const api = {
  resolve: (url: string): Promise<TrackMeta[]> => ipcRenderer.invoke(CH.resolve, url),
  search: (query: string, sourceIds: SourceId[]): Promise<SearchGroup[]> =>
    ipcRenderer.invoke(CH.search, query, sourceIds),
  enqueue: (metas: TrackMeta[]): Promise<QueueItem[]> => ipcRenderer.invoke(CH.enqueue, metas),
  queueList: (): Promise<QueueItem[]> => ipcRenderer.invoke(CH.queueList),
  retry: (itemId: string): Promise<void> => ipcRenderer.invoke(CH.queueRetry, itemId),
  retryFailed: (): Promise<void> => ipcRenderer.invoke(CH.queueRetryFailed),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(CH.configGet),
  updateConfig: (patch: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(CH.configUpdate, patch),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(CH.pickFolder),
  openFolder: (): Promise<string> => ipcRenderer.invoke(CH.openFolder),
  openExternal: (url: string): Promise<string> => ipcRenderer.invoke(CH.openExternal, url),
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(CH.historyList),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(CH.historyClear),
  getPlaylists: (): Promise<PlaylistSubscription[]> => ipcRenderer.invoke(CH.playlistList),
  addPlaylist: (url: string): Promise<PlaylistSubscription> => ipcRenderer.invoke(CH.playlistAdd, url),
  removePlaylist: (url: string): Promise<void> => ipcRenderer.invoke(CH.playlistRemove, url),
  syncPlaylist: (url: string): Promise<{ added: number; total: number }> =>
    ipcRenderer.invoke(CH.playlistSync, url),
  syncAllPlaylists: (): Promise<{ added: number; total: number }> => ipcRenderer.invoke(CH.playlistSyncAll),
  onQueueUpdate: (cb: (item: QueueItem) => void): (() => void) => {
    const listener = (_e: unknown, item: QueueItem) => cb(item)
    ipcRenderer.on(CH.queueUpdate, listener)
    return () => ipcRenderer.removeListener(CH.queueUpdate, listener)
  }
}

contextBridge.exposeInMainWorld('downmusic', api)

export type DownMusicApi = typeof api
