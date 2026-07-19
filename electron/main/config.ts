import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'node:path'
import { DEFAULT_CONFIG, type AppConfig } from '../../shared/types'

/** Config persistida via electron-store. Credenciais ficam aqui (cofre do app). */
export class ConfigStore {
  private store: Store<AppConfig>

  constructor() {
    const fallbackDir = safeDownloadsDir()
    this.store = new Store<AppConfig>({
      name: 'config',
      defaults: { ...DEFAULT_CONFIG, outputDir: fallbackDir }
    })
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
