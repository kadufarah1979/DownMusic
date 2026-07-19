import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { ConfigStore } from './config'
import { Resolver } from './resolver'
import { QueueManager } from './queue'
import { Tagger } from './tagger'
import { registerIpc } from './ipc'
import { HistoryStore } from './history'
import { YtDlpEngine } from '../engines/ytdlp'
import { FfmpegEngine } from '../engines/ffmpeg'
import { SpotifySource } from '../sources/spotify'
import { SpotifyClient } from '../sources/spotifyClient'
import { YouTubeSource } from '../sources/youtube'
import { BandcampSource } from '../sources/bandcamp'
import { SoundCloudSource } from '../sources/soundcloud'
import { DeezerSource } from '../sources/deezer'
import { DeezerClient } from '../sources/deezerClient'

/** Monta o grafo de dependencias (composition root). */
function buildCore() {
  const config = new ConfigStore()
  const cfg = config.get()

  const ytdlp = new YtDlpEngine()
  const ffmpeg = new FfmpegEngine()

  const sources = [
    // provider dinamico: le as credenciais atuais da config a cada chamada,
    // refletindo o que o usuario salva em Configuracoes sem reiniciar.
    new SpotifySource(ytdlp, new SpotifyClient(() => config.get().spotify)),
    new YouTubeSource(ytdlp),
    new BandcampSource(ytdlp),
    new SoundCloudSource(ytdlp),
    new DeezerSource(ytdlp, new DeezerClient())
  ]

  const resolver = new Resolver(sources)
  const tagger = new Tagger(ffmpeg)
  const queue = new QueueManager(resolver, tagger, cfg)
  const history = new HistoryStore()

  // registra no historico quando um download conclui
  queue.on('update', (item) => {
    if (item.state === 'done') history.add(item.meta, item.outputPath ?? '')
  })

  return { config, resolver, queue, history, ytdlp, ffmpeg }
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

// Obs: em dev, o --no-sandbox e passado como argumento real de lancamento
// pelos scripts npm (electron-vite ... -- --no-sandbox), o que evita o erro
// do chrome-sandbox (setuid) no Linux sem precisar de sudo. Em producao
// (AppImage empacotado pelo electron-builder) o sandbox permanece ATIVO.

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
