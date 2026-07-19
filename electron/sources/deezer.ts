import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'

/**
 * FASE 2 (stub): fonte Deezer.
 * Motor proprio: autenticacao por ARL token, API interna do Deezer,
 * download cifrado (Blowfish, chave = MD5 do id da faixa) com decrypt local.
 * NAO implementado no MVP — presente apenas para fixar a interface.
 */
export class DeezerSource implements Source {
  readonly id = 'deezer' as const

  matches(url: string): boolean {
    return /deezer\.com/i.test(url)
  }

  async search(): Promise<TrackMeta[]> {
    throw new Error('Fonte Deezer sera implementada na fase 2.')
  }

  async resolve(): Promise<TrackMeta[]> {
    throw new Error('Fonte Deezer sera implementada na fase 2.')
  }

  async fetchAudio(_t: TrackMeta, _o: FetchOptions, _p: ProgressFn): Promise<AudioResult> {
    throw new Error('Fonte Deezer sera implementada na fase 2.')
  }
}
