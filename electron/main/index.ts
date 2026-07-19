import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { ConfigStore } from './config'
import { Resolver } from './resolver'
import { QueueManager } from './queue'
import { Tagger } from './tagger'
import { registerIpc } from './ipc'
import { YtDlpEngine } from '../engines/ytdlp'
import { FfmpegEngine } from '../engines/ffmpeg'
import { SpotifySource } from '../sources/spotify'
import { YouTubeSource } from '../sources/youtube'
import { BandcampSource } from '../sources/bandcamp'
import { SoundCloudSource } from '../sources/soundcloud'
import { DeezerSource } from '../sources/deezer'

/** Monta o grafo de dependencias (composition root). */
function buildCore() {
  const config = new ConfigStore()
  const cfg = config.get()

  const ytdlp = new YtDlpEngine()
  const ffmpeg = new FfmpegEngine()

  const sources = [
    new SpotifySource(ytdlp, cfg.spotify),
    new YouTubeSource(ytdlp),
    new BandcampSource(ytdlp),
    new SoundCloudSource(ytdlp),
    new DeezerSource() // fase 2 (stub)
  ]

  const resolver = new Resolver(sources)
  const tagger = new Tagger(ffmpeg)
  const queue = new QueueManager(resolver, tagger, cfg)

  return { config, resolver, queue, ytdlp, ffmpeg }
}

function createWindow(core: ReturnType<typeof buildCore>): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  registerIpc(win, core)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const core = buildCore()

  // TODO: avisar na UI se yt-dlp/ffmpeg nao estiverem no PATH.
  void core.ytdlp.available()
  void core.ffmpeg.available()

  createWindow(core)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(core)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
