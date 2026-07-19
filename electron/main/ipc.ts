import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
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
  configUpdate: 'config:update',
  pickFolder: 'dialog:pickFolder',
  openFolder: 'shell:openFolder',
  openExternal: 'shell:openExternal'
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

  // Dialogo nativo de selecao de pasta; retorna o caminho ou null se cancelado.
  ipcMain.handle(CH.pickFolder, async () => {
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: config.get().outputDir || undefined
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  // Abre a pasta de downloads no gerenciador de arquivos; cria se ainda nao existe.
  // Retorna string de erro (vazia = sucesso).
  ipcMain.handle(CH.openFolder, async () => {
    const dir = config.get().outputDir
    if (!dir) return 'Pasta de destino nao configurada.'
    try {
      await mkdir(dir, { recursive: true })
    } catch {
      /* segue e tenta abrir mesmo assim */
    }
    return shell.openPath(dir)
  })

  // Abre uma URL http(s) no navegador padrao (ex: pagina da faixa na plataforma).
  // So aceita http/https por seguranca. Retorna string de erro (vazia = sucesso).
  ipcMain.handle(CH.openExternal, async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return 'URL invalida.'
    await shell.openExternal(url)
    return ''
  })

  // Push de atualizacoes de progresso da fila para o renderer.
  queue.on('update', (item) => {
    if (!win.isDestroyed()) win.webContents.send(CH.queueUpdate, item)
  })
}
