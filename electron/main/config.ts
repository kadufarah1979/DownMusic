import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'node:path'
import { DEFAULT_CONFIG, type AppConfig } from '../../shared/types'

/**
 * A fatia do electron-store que esta classe usa. Injetavel para o teste: fora
 * do Electron o electron-store grava em `~/.config/electron-store-nodejs/`, e o
 * estado sobrevive entre execucoes da suite.
 */
export interface ConfigBackend {
  readonly store: AppConfig
  set(patch: Partial<AppConfig>): void
}

/** Defaults da primeira execucao. Puro, para o teste afirmar sem depender do Electron. */
export function configDefaults(musicDir: string): AppConfig {
  return { ...DEFAULT_CONFIG, outputDir: musicDir }
}

/** Config persistida via electron-store. Credenciais ficam aqui (cofre do app). */
export class ConfigStore {
  private store: ConfigBackend

  constructor(store?: ConfigBackend) {
    this.store =
      store ?? new Store<AppConfig>({ name: 'config', defaults: configDefaults(safeDownloadsDir()) })
  }

  get(): AppConfig {
    return this.store.store
  }

  update(patch: Partial<AppConfig>): AppConfig {
    this.store.set({ ...this.store.store, ...patch })
    return this.store.store
  }
}

function safeDownloadsDir(): string {
  try {
    return join(app.getPath('music'), 'DownMusic')
  } catch {
    return ''
  }
}
