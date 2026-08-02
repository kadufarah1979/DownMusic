import type { QueueItem, QueueItemState, TrackMeta } from './types'

/**
 * Serializacao da fila para disco. Existe separada do `QueueManager` porque e
 * logica pura (e porque o `vitest.config.ts` so coleta `electron/**` e `shared/**`).
 */
export interface QueueSnapshot {
  version: 1
  items: QueueItem[]
  outputDirs: Record<string, string>
  enriched: string[]
}

/** Versao do formato em disco. Arquivo de outra versao e ignorado, nao migrado. */
const SNAPSHOT_VERSION = 1

/** Padrao dos ids gerados pelo `QueueManager`: `q` + numero. */
const ITEM_ID = /^q(\d+)$/

const STATES: readonly QueueItemState[] = ['queued', 'running', 'done', 'error', 'canceled']

export interface RestoredQueue {
  items: QueueItem[]
  outputDirs: Map<string, string>
  enriched: Set<string>
  /** Contador de ids: o proximo item enfileirado sera `q${seq + 1}`. */
  seq: number
}

/**
 * Fila vazia. Funcao, nao constante: devolver a mesma instancia faria dois
 * `QueueManager` restaurados de arquivo invalido compartilharem o mesmo Map e
 * o mesmo Set — um vazando `outputDirs` e `enriched` no outro.
 */
function empty(): RestoredQueue {
  return { items: [], outputDirs: new Map(), enriched: new Set(), seq: 0 }
}

export function toSnapshot(
  items: readonly QueueItem[],
  outputDirs: ReadonlyMap<string, string>,
  enriched: ReadonlySet<string>
): QueueSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    items: [...items],
    outputDirs: Object.fromEntries(outputDirs),
    enriched: [...enriched]
  }
}

/**
 * Deriva o contador de ids do maior id restaurado. Nao ha `seq` persistido a
 * parte de proposito: um contador menor que os ids existentes faria o proximo
 * `enqueue` SOBRESCREVER um item restaurado (mesma chave no Map), junto com
 * suas entradas em `outputDirs` e `enriched`.
 */
export function seqFromIds(itemIds: readonly string[]): number {
  let max = 0
  for (const id of itemIds) {
    const n = Number(ITEM_ID.exec(id)?.[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

function isTrackMeta(v: unknown): v is TrackMeta {
  const m = v as TrackMeta | null
  return Boolean(m && typeof m === 'object' && typeof m.id === 'string' && typeof m.title === 'string')
}

/** Normaliza um item cru. `null` quando nao tem a forma minima de `QueueItem`. */
function normalizeItem(raw: unknown): QueueItem | null {
  const it = raw as Partial<QueueItem> | null
  if (!it || typeof it !== 'object') return null
  if (typeof it.itemId !== 'string' || !isTrackMeta(it.meta)) return null

  const state = STATES.includes(it.state as QueueItemState) ? (it.state as QueueItemState) : 'queued'
  // `running` restaurado seria mentira: o processo morreu no meio do download e o
  // arquivo parcial nao existe mais. Volta como `queued` — houve interrupcao, nao
  // falha, e marcar como `error` poluiria a contagem do que deu problema de verdade.
  const restored: QueueItemState = state === 'running' ? 'queued' : state
  const progress = restored === 'done' ? 100 : typeof it.progress === 'number' && restored !== 'queued' ? it.progress : 0

  return {
    itemId: it.itemId,
    meta: it.meta,
    state: restored,
    progress,
    ...(it.error ? { error: it.error } : {}),
    ...(it.outputPath ? { outputPath: it.outputPath } : {})
  }
}

/**
 * Le um snapshot vindo do disco. Qualquer coisa irreconhecivel (arquivo
 * corrompido, versao futura, JSON de outro formato) devolve fila vazia: um app
 * que nao abre por causa do proprio cache e pior que um app que esqueceu a fila.
 */
export function fromSnapshot(raw: unknown): RestoredQueue {
  const snap = raw as Partial<QueueSnapshot> | null
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return empty()
  if (snap.version !== SNAPSHOT_VERSION || !Array.isArray(snap.items)) return empty()

  const items = snap.items.map(normalizeItem).filter((i): i is QueueItem => i !== null)
  const ids = new Set(items.map((i) => i.itemId))

  // entradas sem item correspondente sao lixo: sem isso os dois mapas crescem
  // indefinidamente no arquivo, invisiveis na UI.
  const outputDirs = new Map<string, string>()
  for (const [id, dir] of Object.entries(snap.outputDirs ?? {})) {
    if (ids.has(id) && typeof dir === 'string') outputDirs.set(id, dir)
  }
  const enriched = new Set<string>(
    Array.isArray(snap.enriched) ? snap.enriched.filter((id) => typeof id === 'string' && ids.has(id)) : []
  )

  return { items, outputDirs, enriched, seq: seqFromIds([...ids]) }
}
