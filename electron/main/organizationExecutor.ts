import { EventEmitter } from 'node:events'
import { rename, mkdir, copyFile, rm } from 'node:fs/promises'
import { dirname, resolve, sep, extname } from 'node:path'
import { isSafeToClear } from './reset'
import { downloadCover } from './cover'
import { buildRetagArgs } from '../engines/ffmpeg'
import type { FfmpegEngine } from '../engines/ffmpeg'
import type { OrganizationPlan, PlanEntry } from '../../shared/library'

/** Interface mínima do ffmpeg usada aqui (facilita o teste). */
export interface Retagger {
  retag(inPath: string, outPath: string, coverPath?: string, args?: string[]): Promise<void>
}

export interface ApplyResult {
  moved: number
  retagged: number
  quarantined: number
  failed: { path: string; error: string }[]
}

const COVER_OK = new Set(['.mp3', '.flac', '.m4a', '.aac'])

/** Move/renomeia e retagueia arquivos segundo um plano aprovado. */
export class OrganizationExecutor extends EventEmitter {
  constructor(private readonly ffmpeg: Retagger | FfmpegEngine) {
    super()
  }

  async apply(plan: OrganizationPlan, home: string): Promise<ApplyResult> {
    const root = resolve(plan.rootDir)
    if (!isSafeToClear(root, home)) throw new Error(`Diretório inseguro para reorganizar: ${root}`)

    let moved = 0,
      retagged = 0,
      quarantined = 0
    const failed: { path: string; error: string }[] = []
    let done = 0

    for (const e of plan.entries) {
      try {
        if (resolve(e.to) !== e.to || !resolve(e.to).startsWith(root + sep)) {
          throw new Error('destino fora da raiz')
        }
        await mkdir(dirname(e.to), { recursive: true })
        if (e.needsRetag) {
          await this.retag(e)
          retagged++
        } else {
          await move(e.from, e.to)
          if (e.duplicate) quarantined++
          else moved++
        }
      } catch (err) {
        failed.push({ path: e.from, error: err instanceof Error ? err.message : String(err) })
      }
      this.emit('progress', { done: ++done, total: plan.entries.length, current: e.from })
    }
    return { moved, retagged, quarantined, failed }
  }

  private async retag(e: PlanEntry): Promise<void> {
    const wantCover = e.tags?.coverUrl && COVER_OK.has(extname(e.to).toLowerCase())
    const coverPath = wantCover ? await downloadCover(e.tags!.coverUrl) : undefined
    try {
      const args = buildRetagArgs(e.from, e.to, e.tags ?? {}, coverPath)
      await (this.ffmpeg as Retagger).retag(e.from, e.to, coverPath, args)
      await rm(e.from, { force: true })
    } finally {
      if (coverPath) await rm(coverPath, { force: true }).catch(() => {})
    }
  }
}

/** rename com fallback copy+unlink (EXDEV entre volumes). */
async function move(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err
    await copyFile(from, to)
    await rm(from, { force: true })
  }
}
