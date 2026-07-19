import PQueue from 'p-queue'
import { EventEmitter } from 'node:events'
import type { Resolver } from './resolver'
import type { Tagger } from './tagger'
import type { AppConfig, FetchOptions, QueueItem, TrackMeta } from '../../shared/types'

/**
 * Gerencia a fila de downloads: concorrencia limitada, retry com backoff,
 * estados por item e emissao de eventos de progresso (consumidos via IPC).
 */
export class QueueManager extends EventEmitter {
  private queue: PQueue
  private items = new Map<string, QueueItem>()
  private seq = 0

  constructor(
    private readonly resolver: Resolver,
    private readonly tagger: Tagger,
    private cfg: AppConfig
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

  /** Enfileira uma faixa ja resolvida. */
  enqueue(meta: TrackMeta): QueueItem {
    const itemId = `q${++this.seq}`
    const item: QueueItem = { itemId, meta, state: 'queued', progress: 0 }
    this.items.set(itemId, item)
    this.emitUpdate(item)
    void this.queue.add(() => this.run(item))
    return item
  }

  private fetchOptions(): FetchOptions {
    return {
      format: this.cfg.format,
      quality: this.cfg.quality,
      outputDir: this.cfg.outputDir,
      nameTemplate: this.cfg.nameTemplate
    }
  }

  private async run(item: QueueItem): Promise<void> {
    const source = this.resolver.getSource(item.meta.sourceId)
    if (!source) return this.fail(item, `Fonte indisponivel: ${item.meta.sourceId}`)

    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      try {
        this.patch(item, { state: 'running', progress: 0, error: undefined })
        const raw = await source.fetchAudio(item.meta, this.fetchOptions(), (p) =>
          this.patch(item, { progress: p })
        )
        const outputPath = await this.tagger.finalize(item.meta, raw, this.fetchOptions())
        this.patch(item, { state: 'done', progress: 100, outputPath })
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (attempt === this.cfg.maxRetries) return this.fail(item, message)
        // TODO: backoff exponencial real entre tentativas.
      }
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
