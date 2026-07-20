import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, access } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { OrganizationExecutor } from './organizationExecutor'
import type { OrganizationPlan } from '../../shared/library'

const exists = (p: string) => access(p).then(() => true, () => false)

// ffmpeg falso: "retag" cria o arquivo de saída
const fakeFfmpeg = { async retag(_in: string, out: string) { await writeFile(out, 'retagged') } } as any

describe('OrganizationExecutor.apply', () => {
  it('move por rename, retagueia quando preciso e quarentena duplicados', async () => {
    const root = await mkdtemp(join(tmpdir(), 'org-'))
    await writeFile(join(root, 'a.mp3'), 'aaa')
    await writeFile(join(root, 'b.mp3'), 'bbb')
    await writeFile(join(root, 'dup.mp3'), 'ddd')

    const plan: OrganizationPlan = {
      rootDir: root,
      collisions: [],
      entries: [
        { from: join(root, 'a.mp3'), to: join(root, 'House', 'A - Song.mp3'), needsRetag: false },
        { from: join(root, 'b.mp3'), to: join(root, 'Techno', 'B - Song.mp3'), needsRetag: true, tags: { genre: 'Techno' } },
        { from: join(root, 'dup.mp3'), to: join(root, '_Duplicados', 'dup.mp3'), needsRetag: false, duplicate: true }
      ]
    }

    const res = await new OrganizationExecutor(fakeFfmpeg).apply(plan, homedir())

    expect(await exists(join(root, 'House', 'A - Song.mp3'))).toBe(true)
    expect(await exists(join(root, 'a.mp3'))).toBe(false)
    expect(await exists(join(root, 'Techno', 'B - Song.mp3'))).toBe(true)
    expect(await exists(join(root, '_Duplicados', 'dup.mp3'))).toBe(true)
    expect(res).toMatchObject({ moved: 1, retagged: 1, quarantined: 1, failed: [] })
  })

  it('recusa raiz insegura', async () => {
    const plan: OrganizationPlan = { rootDir: homedir(), collisions: [], entries: [] }
    await expect(new OrganizationExecutor(fakeFfmpeg).apply(plan, homedir())).rejects.toThrow()
  })
})
