import PQueue from 'p-queue'
import { EventEmitter } from 'node:events'
import type { Resolver } from './resolver'
import type { Tagger } from './tagger'
import type { AppConfig, FetchOptions, QueueItem, TrackMeta } from '../../shared/types'
import { fromSnapshot, toSnapshot, type QueueSnapshot } from '../../shared/queueSnapshot'

/**
 * Gerencia a fila de downloads: concorrencia limitada, retry com backoff,
 * estados por item e emissao de eventos de progresso (consumidos via IPC).
 */
/** Enriquece uma faixa com metadados extras (genero, ano, etc). Falha -> {} pelo chamador. */
export type EnrichFn = (meta: TrackMeta) => Promise<Partial<TrackMeta>>

/** Persistencia da fila (arquivo queue.json). Injetada para o teste usar um duplo. */
export interface QueueSnapshotStore {
  load(): unknown
  save(snapshot: QueueSnapshot): void
}

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
    private readonly enrich?: EnrichFn,
    private readonly store?: QueueSnapshotStore
  ) {
    super()
    this.queue = new PQueue({ concurrency: cfg.concurrency })
    this.restore()
  }

  /**
   * Carrega a fila do disco. Os itens voltam PARADOS: retomar sozinho no launch
   * faria o app consumir rede sem o usuario pedir, ao contrario do resto do app
   * (sync de playlist e opt-in, a aba Organizar nao move nada sem confirmacao).
   */
  private restore(): void {
    const restored = fromSnapshot(this.store?.load())
    for (const item of restored.items) {
      this.items.set(item.itemId, item.state === 'queued' ? { ...item, stalled: true } : item)
    }
    this.outputDirs = restored.outputDirs
    this.enriched = restored.enriched
    this.seq = restored.seq
  }

  private persist(): void {
    this.store?.save(toSnapshot(this.list(), this.outputDirs, this.enriched))
  }

  /**
   * Entrega o item ao PQueue e tira a marca de parado. Nao ha guarda contra
   * agendamento duplo aqui: `resume` so pega item marcado (a marca cai neste
   * metodo) e `retry` so pega item em `error` (o estado muda antes de agendar).
   */
  private schedule(item: QueueItem): void {
    // avisa a UI ja no agendamento: com concorrencia 3 e 10 itens retomados, so
    // 3 emitem `running` de imediato — os outros 7 continuariam marcados como
    // parados na tela, e o botao "Retomar (N)" seguiria oferecendo o que ja foi.
    if (item.stalled) {
      delete item.stalled
      this.emitUpdate(item)
    }
    void this.queue.add(() => this.run(item))
  }

  /** Quantos itens vieram do disco e estao parados (alimenta o botao "Retomar (N)"). */
  stalledCount(): number {
    return this.list().filter((i) => i.stalled).length
  }

  /** Re-enfileira os itens restaurados que estao parados. Acionado por "Retomar". */
  resume(): void {
    for (const item of this.items.values()) {
      if (item.stalled && item.state === 'queued') this.schedule(item)
    }
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
    this.persist()
    this.schedule(item)
    return item
  }

  /** Re-executa um item que falhou (estado `error`). */
  retry(itemId: string): void {
    const item = this.items.get(itemId)
    if (!item || item.state !== 'error') return
    this.patch(item, { state: 'queued', progress: 0, error: undefined })
    this.schedule(item)
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

  /**
   * `patch` roda a cada tick de progresso do download — gravar aqui seria escrita
   * em disco dezenas de vezes por segundo. So transicao de estado persiste; o
   * progresso de um item restaurado nao tem valor, nasce em 0.
   */
  private patch(item: QueueItem, patch: Partial<QueueItem>): void {
    Object.assign(item, patch)
    this.emitUpdate(item)
    if (patch.state !== undefined) this.persist()
  }

  private emitUpdate(item: QueueItem): void {
    this.emit('update', { ...item })
  }
}
