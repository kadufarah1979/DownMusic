import type { DownMusicApi } from '../electron/preload'

/** Acesso tipado a API exposta pelo preload (window.downmusic). */
declare global {
  interface Window {
    downmusic: DownMusicApi
  }
}

export const api = window.downmusic
