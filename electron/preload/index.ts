import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, QueueItem, TrackMeta } from '../../shared/types'

/** Nomes de canais espelhados de main/ipc.ts. */
const CH = {
  resolve: 'resolve',
  search: 'search',
  enqueue: 'enqueue',
  queueList: 'queue:list',
  queueUpdate: 'queue:update',
  configGet: 'config:get',
  configUpdate: 'config:update'
} as const

/** API tipada exposta ao renderer via contextBridge. */
const api = {
  resolve: (url: string): Promise<TrackMeta[]> => ipcRenderer.invoke(CH.resolve, url),
  search: (query: string, sourceId?: string): Promise<TrackMeta[]> =>
    ipcRenderer.invoke(CH.search, query, sourceId),
  enqueue: (metas: TrackMeta[]): Promise<QueueItem[]> => ipcRenderer.invoke(CH.enqueue, metas),
  queueList: (): Promise<QueueItem[]> => ipcRenderer.invoke(CH.queueList),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(CH.configGet),
  updateConfig: (patch: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(CH.configUpdate, patch),
  onQueueUpdate: (cb: (item: QueueItem) => void): (() => void) => {
    const listener = (_e: unknown, item: QueueItem) => cb(item)
    ipcRenderer.on(CH.queueUpdate, listener)
    return () => ipcRenderer.removeListener(CH.queueUpdate, listener)
  }
}

contextBridge.exposeInMainWorld('downmusic', api)

export type DownMusicApi = typeof api
