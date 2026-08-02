import Store from 'electron-store'
import type { QueueSnapshot } from '../../shared/queueSnapshot'

interface QueueData {
  snapshot: QueueSnapshot | null
}

/** Persistencia da fila (arquivo queue.json, ao lado de history.json). */
export class QueueStore {
  private store: Store<QueueData>

  constructor() {
    this.store = new Store<QueueData>({ name: 'queue', defaults: { snapshot: null } })
  }

  /** `unknown` de proposito: o saneamento e do `fromSnapshot`, nao daqui. */
  load(): unknown {
    return this.store.get('snapshot')
  }

  save(snapshot: QueueSnapshot): void {
    this.store.set('snapshot', snapshot)
  }
}
