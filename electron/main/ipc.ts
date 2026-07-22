import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { isSafeToClear, clearDir } from './reset'
import { checkForUpdate } from './updater'
import { findExtended } from './extendedFinder'
import type { TrackMeta } from '../../shared/types'
import type { Resolver } from './resolver'
import type { QueueManager } from './queue'
import type { ConfigStore } from './config'
import type { HistoryStore } from './history'
import type { PlaylistService } from './playlists'
import type { LibraryService } from './library'
import type { OrganizationPlan } from '../../shared/library'

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
  openExternal: 'shell:openExternal',
  historyList: 'history:list',
  historyClear: 'history:clear',
  queueRetry: 'queue:retry',
  queueRetryFailed: 'queue:retryFailed',
  playlistList: 'playlist:list',
  playlistAdd: 'playlist:add',
  playlistRemove: 'playlist:remove',
  playlistSync: 'playlist:sync',
  playlistSyncAll: 'playlist:syncAll',
  playlistClear: 'playlist:clear',
  downloadsClear: 'downloads:clear',
  libraryScanAnalyze: 'library:scanAnalyze',
  libraryPlan: 'library:plan',
  libraryApply: 'library:apply',
  libraryProgress: 'library:progress',
  clipboardLink: 'clipboard:link',
  appVersion: 'app:getVersion',
  appCheckUpdate: 'app:checkUpdate',
  searchFindExtended: 'search:findExtended'
} as const

export function registerIpc(
  win: BrowserWindow,
  deps: {
    resolver: Resolver
    queue: QueueManager
    config: ConfigStore
    history: HistoryStore
    playlists: PlaylistService
    library: LibraryService
  }
): void {
  const { resolver, queue, config, history, playlists, library } = deps

  ipcMain.handle(CH.libraryScanAnalyze, (_e, dir: string) => library.scanAndAnalyze(dir))
  ipcMain.handle(CH.libraryPlan, (_e, dir: string, template: string) => library.plan(dir, template))
  ipcMain.handle(CH.libraryApply, (_e, plan: OrganizationPlan) => library.apply(plan))
  ipcMain.handle(CH.appVersion, () => app.getVersion())
  ipcMain.handle(CH.appCheckUpdate, () => checkForUpdate(app.getVersion()))
  ipcMain.handle(CH.searchFindExtended, (_e, track: TrackMeta) => findExtended(resolver, track))
  library.executor.on('progress', (p: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(CH.libraryProgress, p)
  })
  // progresso do enriquecimento (fase 'enrich') vem do próprio LibraryService
  library.on('progress', (p: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(CH.libraryProgress, p)
  })

  ipcMain.handle(CH.resolve, (_e, url: string) => resolver.resolve(url))
  ipcMain.handle(CH.search, (_e, query: string, sourceIds: string[]) =>
    resolver.searchMany(query, sourceIds as any)
  )
  ipcMain.handle(CH.enqueue, (_e, metas, outputDir?: string) =>
    metas.map((m: any) => queue.enqueue(m, outputDir))
  )
  ipcMain.handle(CH.queueList, () => queue.list())
  ipcMain.handle(CH.queueRetry, (_e, itemId: string) => queue.retry(itemId))
  ipcMain.handle(CH.queueRetryFailed, () => queue.retryFailed())
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

  ipcMain.handle(CH.historyList, () => history.list())
  ipcMain.handle(CH.historyClear, () => history.clear())

  ipcMain.handle(CH.playlistList, () => playlists.list())
  ipcMain.handle(CH.playlistAdd, (_e, url: string) => playlists.add(url))
  ipcMain.handle(CH.playlistRemove, (_e, url: string) => playlists.remove(url))
  ipcMain.handle(CH.playlistSync, (_e, url: string) => playlists.sync(url))
  ipcMain.handle(CH.playlistSyncAll, () => playlists.syncAll())
  ipcMain.handle(CH.playlistClear, () => playlists.clear())

  // apaga o conteudo da pasta de downloads (irreversivel), com guardas de seguranca
  ipcMain.handle(CH.downloadsClear, async () => {
    const dir = config.get().outputDir
    if (!isSafeToClear(dir, app.getPath('home'))) {
      return { ok: false, error: `Pasta invalida ou protegida: ${dir || '(vazia)'}` }
    }
    try {
      const removed = await clearDir(dir)
      return { ok: true, removed }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Push de atualizacoes de progresso da fila para o renderer.
  queue.on('update', (item) => {
    if (!win.isDestroyed()) win.webContents.send(CH.queueUpdate, item)
  })
}
