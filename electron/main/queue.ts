import PQueue from 'p-queue'
import { EventEmitter } from 'node:events'
import type { Resolver } from './resolver'
import type { Tagger } from './tagger'
import type { AppConfig, FetchOptions, QueueItem, TrackMeta } from '../../shared/types'

/**
 * Gerencia a fila de downloads: concorrencia limitada, retry com backoff,
 * estados por item e emissao de eventos de progresso (consumidos via IPC).
 */
/** Enriquece uma faixa com metadados extras (genero, ano, etc). Falha -> {} pelo chamador. */
export type EnrichFn = (meta: TrackMeta) => Promise<Partial<TrackMeta>>

export class QueueManager extends EventEmitter {
  private queue: PQueue
  private items = new Map<string, QueueItem>()
  private outputDirs = new Map<string, string>() // override de pasta por item (por lista)
  private enriched = new Set<string>() // itens ja enriquecidos (nao repetir no retry)
  private seq = 0

  constructor(
    private readonly resolver: Resolver,
    private readonly tagger: Tagger,
    private cfg: AppConfig,
    private readonly enrich?: EnrichFn
  ) {
    super()
    this.queue = new PQueue({ concurrency: cfg.concurrency })
  }

  setConfig(cfg: AppConfig): void {
    this.cfg = cfg
    this.queue.concurrency = cfg.concurrency
  }

  list(): QueueItem[] {
    return [...this.items.values()]
  }

  /** Enfileira uma faixa ja resolvida. `outputDir` sobrepoe a pasta padrao (por lista). */
  enqueue(meta: TrackMeta, outputDir?: string): QueueItem {
    const itemId = `q${++this.seq}`
    const item: QueueItem = { itemId, meta, state: 'queued', progress: 0 }
    this.items.set(itemId, item)
    if (outputDir) this.outputDirs.set(itemId, outputDir)
    this.emitUpdate(item)
    void this.queue.add(() => this.run(item))
    return item
  }

  /** Re-executa um item que falhou (estado `error`). */
  retry(itemId: string): void {
    const item = this.items.get(itemId)
    if (!item || item.state !== 'error') return
    this.patch(item, { state: 'queued', progress: 0, error: undefined })
    void this.queue.add(() => this.run(item))
  }

  /** Re-executa todos os itens que falharam. */
  retryFailed(): void {
    for (const item of this.items.values()) {
      if (item.state === 'error') this.retry(item.itemId)
    }
  }

  private fetchOptions(item: QueueItem): FetchOptions {
    return {
      format: this.cfg.format,
      quality: this.cfg.quality,
      outputDir: this.outputDirs.get(item.itemId) ?? this.cfg.outputDir,
      nameTemplate: this.cfg.nameTemplate
    }
  }

  private async run(item: QueueItem): Promise<void> {
    const source = this.resolver.getSource(item.meta.sourceId)
    if (!source) return this.fail(item, `Fonte indisponivel: ${item.meta.sourceId}`)

    // enriquece os metadados 1x por item (genero/ano/label/capa) antes do 1o download.
    // Nunca quebra o download: falha/sem match apenas mantem o meta original.
    await this.enrichOnce(item)

    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      try {
        this.patch(item, { state: 'running', progress: 0, error: undefined })
        const opts = this.fetchOptions(item)
        const raw = await source.fetchAudio(item.meta, opts, (p) => this.patch(item, { progress: p }))
        const outputPath = await this.tagger.finalize(item.meta, raw, opts)
        this.patch(item, { state: 'done', progress: 100, outputPath })
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (attempt === this.cfg.maxRetries) return this.fail(item, message)
        // TODO: backoff exponencial real entre tentativas.
      }
    }
  }

  private async enrichOnce(item: QueueItem): Promise<void> {
    if (!this.enrich || this.enriched.has(item.itemId)) return
    this.enriched.add(item.itemId)
    try {
      const tags = await this.enrich(item.meta)
      if (tags && Object.keys(tags).length) {
        Object.assign(item.meta, tags)
        this.emitUpdate(item)
      }
    } catch {
      // enriquecimento e best-effort; download segue com o meta original
    }
  }

  private fail(item: QueueItem, error: string): void {
    this.patch(item, { state: 'error', error })
  }

  private patch(item: QueueItem, patch: Partial<QueueItem>): void {
    Object.assign(item, patch)
    this.emitUpdate(item)
  }

  private emitUpdate(item: QueueItem): void {
    this.emit('update', { ...item })
  }
}
