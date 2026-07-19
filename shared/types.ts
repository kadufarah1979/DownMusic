// Modelos compartilhados entre main, preload e renderer.

export type SourceId = 'spotify' | 'youtube' | 'bandcamp' | 'soundcloud' | 'deezer'

export type AudioFormat = 'mp3' | 'flac' | 'm4a' | 'opus' | 'best'
export type AudioQuality = '128' | '192' | '256' | '320' | 'lossless' | 'best'

/** Metadados de uma faixa, agnostico de fonte. */
export interface TrackMeta {
  id: string
  title: string
  artists: string[]
  album?: string
  coverUrl?: string
  isrc?: string
  durationSec?: number
  sourceId: SourceId
  sourceUrl: string
}

/** Opcoes passadas ao baixar/converter uma faixa. */
export interface FetchOptions {
  format: AudioFormat
  quality: AudioQuality
  outputDir: string
  /** Template de nome, ex: "%artist%/%album%/%track% - %title%". */
  nameTemplate: string
}

/** Resultado bruto de fetchAudio antes do tagging/conversao final. */
export interface AudioResult {
  rawPath: string
  sourceCodec?: string
}

export type QueueItemState = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface QueueItem {
  itemId: string
  meta: TrackMeta
  state: QueueItemState
  /** 0..100 */
  progress: number
  error?: string
  outputPath?: string
}

/** Configuracao persistida (electron-store). */
export interface AppConfig {
  outputDir: string
  nameTemplate: string
  format: AudioFormat
  quality: AudioQuality
  concurrency: number
  maxRetries: number
  spotify: {
    clientId?: string
    clientSecret?: string
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  outputDir: '',
  nameTemplate: '%artist%/%album%/%track% - %title%',
  format: 'mp3',
  quality: '320',
  concurrency: 3,
  maxRetries: 2,
  spotify: {}
}
