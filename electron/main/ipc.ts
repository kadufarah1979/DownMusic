import { ipcMain, BrowserWindow } from 'electron'
import type { Resolver } from './resolver'
import type { QueueManager } from './queue'
import type { ConfigStore } from './config'

/**
 * Canais IPC entre renderer e main. Nomes centralizados aqui e no preload.
 */
export const CH = {
  resolve: 'resolve',
  search: 'search',
  enqueue: 'enqueue',
  queueList: 'queue:list',
  queueUpdate: 'queue:update',
  configGet: 'config:get',
  configUpdate: 'config:update'
} as const

export function registerIpc(
  win: BrowserWindow,
  deps: { resolver: Resolver; queue: QueueManager; config: ConfigStore }
): void {
  const { resolver, queue, config } = deps

  ipcMain.handle(CH.resolve, (_e, url: string) => resolver.resolve(url))
  ipcMain.handle(CH.search, (_e, query: string, sourceIds: string[]) =>
    resolver.searchMany(query, sourceIds as any)
  )
  ipcMain.handle(CH.enqueue, (_e, metas) => metas.map((m: any) => queue.enqueue(m)))
  ipcMain.handle(CH.queueList, () => queue.list())
  ipcMain.handle(CH.configGet, () => config.get())
  ipcMain.handle(CH.configUpdate, (_e, patch) => {
    const cfg = config.update(patch)
    queue.setConfig(cfg)
    return cfg
  })

  // Push de atualizacoes de progresso da fila para o renderer.
  queue.on('update', (item) => {
    if (!win.isDestroyed()) win.webContents.send(CH.queueUpdate, item)
  })
}
