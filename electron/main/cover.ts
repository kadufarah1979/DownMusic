import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

/** Baixa a capa (http/https) para um arquivo temporário; retorna undefined se falhar. */
export async function downloadCover(url?: string): Promise<string | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return undefined
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    const file = join(tmpdir(), `downmusic-cover-${randomUUID()}.jpg`)
    await writeFile(file, buf)
    return file
  } catch {
    return undefined
  }
}
