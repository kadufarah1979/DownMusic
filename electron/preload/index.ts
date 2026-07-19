import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, QueueItem, TrackMeta, SearchGroup, SourceId } from '../../shared/types'
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
  historyClear: 'history:clear'
} as const

/** API tipada exposta ao renderer via contextBridge. */
const api = {
  resolve: (url: string): Promise<TrackMeta[]> => ipcRenderer.invoke(CH.resolve, url),
  search: (query: string, sourceIds: SourceId[]): Promise<SearchGroup[]> =>
    ipcRenderer.invoke(CH.search, query, sourceIds),
  enqueue: (metas: TrackMeta[]): Promise<QueueItem[]> => ipcRenderer.invoke(CH.enqueue, metas),
  queueList: (): Promise<QueueItem[]> => ipcRenderer.invoke(CH.queueList),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(CH.configGet),
  updateConfig: (patch: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(CH.configUpdate, patch),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(CH.pickFolder),
  openFolder: (): Promise<string> => ipcRenderer.invoke(CH.openFolder),
  openExternal: (url: string): Promise<string> => ipcRenderer.invoke(CH.openExternal, url),
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(CH.historyList),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(CH.historyClear),
  onQueueUpdate: (cb: (item: QueueItem) => void): (() => void) => {
    const listener = (_e: unknown, item: QueueItem) => cb(item)
    ipcRenderer.on(CH.queueUpdate, listener)
    return () => ipcRenderer.removeListener(CH.queueUpdate, listener)
  }
}

contextBridge.exposeInMainWorld('downmusic', api)

export type DownMusicApi = typeof api
