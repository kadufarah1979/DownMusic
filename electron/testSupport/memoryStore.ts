/**
 * Fake em memoria com a fatia da API do electron-store que as stores do app
 * usam (`get(key)`, `set(key, value)`, `set(patch)` e `.store`).
 *
 * Existe porque instanciar `HistoryStore`, `ConfigStore` ou `PlaylistStore` de
 * verdade grava em disco na casa do usuario: fora do Electron o electron-store
 * cai em `~/.config/electron-store-nodejs/<name>.json` (medido, nao suposto).
 * Nao corrompe o dado do app, mas escapa de qualquer sandbox e sobrevive entre
 * execucoes — dois `npm test` seguidos veriam estados diferentes.
 *
 * Nao e um `*.test.ts`: o vitest nao coleta este arquivo.
 */
export interface MemoryStore<T extends object> {
  readonly store: T
  get<K extends keyof T>(key: K): T[K]
  set<K extends keyof T>(key: K, value: T[K]): void
  set(patch: Partial<T>): void
}

export function memoryStore<T extends object>(initial: T): MemoryStore<T> {
  let data = { ...initial }
  return {
    get store() {
      return data
    },
    get: (key: keyof T) => data[key],
    set: (keyOrPatch: unknown, value?: unknown) => {
      data =
        typeof keyOrPatch === 'string'
          ? { ...data, [keyOrPatch]: value }
          : { ...data, ...(keyOrPatch as Partial<T>) }
    }
  } as MemoryStore<T>
}
