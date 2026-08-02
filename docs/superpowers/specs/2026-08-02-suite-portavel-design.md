# Saúde e portabilidade da suíte de testes — Design + Plano

- **Data:** 2026-08-02
- **Cards:** TASK-1625 (Fase 1), TASK-1619 (Fase 2), TASK-1620 (Fase 3)
- **Origem:** dois sintomas independentes — `npm test` vermelho em clone novo, e dois dos três instaladores publicados saindo do CI sem nenhum teste ter rodado.
- **Objetivo:** a suíte fica verde em clone limpo, roda igual nos três sistemas, e o CI para de publicar Windows/macOS às cegas.

## Diagnóstico

### 1. O fixture de mp3 depende de um binário que o repo não tem

`electron/main/libraryScanner.test.ts:39` gera o mp3 de fixture assim:

```ts
const p = spawn('resources/bin/ffmpeg', [...])
p.on('close', (c) => (c === 0 ? res() : rej(...)))
```

Três problemas empilhados:

- **Caminho relativo fixo.** `resources/bin/ffmpeg` só existe depois de `bash scripts/fetch-binaries.sh`, que não é pré-requisito documentado — o README manda rodar `npm test` logo após `npm install`.
- **Contradiz a própria produção.** `binPath()` (`electron/main/binaries.ts:33`) usa `resources/bin/<name>` **apenas quando empacotado**; em desenvolvimento usa o nome puro, resolvido pelo PATH. O teste é mais exigente que o app.
- **O ENOENT nunca é tratado.** O `spawn` que falha emite `error`, não `close`. Só `close` tem listener, então a Promise nunca resolve nem rejeita: o teste morre no timeout de 5s, com "Test timed out" em vez de "ffmpeg não encontrado". Foi assim que apareceu — um vermelho que não diz o que fazer.

O `smoke/pipeline.test.ts` já resolve isso do jeito certo (`process.env.FFMPEG_BIN || 'ffmpeg'`, mais `describe.skipIf`). O fixture ficou para trás.

### 2. A justificativa do CI para não rodar testes está, na maior parte, errada

O comentário em `.github/workflows/build.yml` diz que "vários assumem caminhos POSIX", e a TASK-1619 lista cinco arquivos. Conferindo um a um:

| Arquivo | Veredito |
|---|---|
| `electron/engines/ffmpeg.test.ts` | **Portável.** `'/in.mp3'`, `'/out.mp3'` são strings opacas que entram e saem de um argv — nada de `fs`, nada de semântica de caminho. |
| `electron/main/queue.test.ts` | **Portável.** `'/pasta/escolhida'` só é empurrado num array e comparado. |
| `electron/main/resolver.test.ts` | **Portável.** `outputExtension('mp3', '/tmp/1.webm')` mexe em extensão, não em caminho. |
| `electron/main/library.test.ts` | **Portável.** O `home: '/home/x'` sequer é lido nesse teste (o executor é um `{}`). |
| `electron/main/reset.test.ts` | **Não portável, e por um motivo de produção** — abaixo. |

Enquanto isso, **três arquivos que a lista não menciona quebram de verdade no Windows**:

- `electron/main/libraryScanner.test.ts:31-32` faz `t.path.replace(dir, '')` e espera `['/a.mp3', '/sub/b.flac']`. Com separador `\`, a comparação falha.
- `electron/main/organizationPlan.test.ts:14,26,32,37,57` espera `'/root/House/A - Song.mp3'`, mas a produção monta o caminho com `join()` (`organizationPlan.ts:38,43`) — no Windows sai `\root\House\...`. O caso "idempotente" (linha 42) é pior que os outros: a entrada também é literal, então no Windows ela deixa de bater com o destino calculado e o teste passa a afirmar o contrário do que quer.
- `electron/main/binaries.test.ts:6-7` (encontrado durante a Fase 2, depois desta tabela ser escrita) chama `binPath` **sem** passar `platform`, então no Windows a função usa a do processo e devolve `\app\resources\bin\yt-dlp.exe` — separador e sufixo diferentes do literal esperado.

Ou seja: substituir literais em massa nos cinco arquivos citados resolveria pouco e mexeria em muito. O critério certo não é "o teste tem uma barra" — é "o teste afirma algo dependente de plataforma".

### 3. `isSafeToClear` está quebrada no Windows — em produção, não no teste

```ts
const d = normalize(dir).replace(/\/+$/, '') || '/'
if (d.split('/').filter(Boolean).length < 2) return false
```

No Windows, `normalize('C:\\Users\\x\\Music')` devolve `C:\Users\x\Music`; o `split('/')` produz **um** elemento, a contagem cai abaixo de 2 e a função retorna `false`. Para **qualquer** caminho. O "limpar pasta de downloads" do diálogo de reset nunca funciona no Windows — silenciosamente, com a mensagem de "não é seguro".

Isso é bug de produção, e a TASK-1619 restringe o escopo a testes ("código de produção inalterado"). Fica registrado na **TASK-1640**, criada por causa desta análise. Enquanto ela não entra, os casos POSIX do `reset.test.ts` são marcados como POSIX-only — o critério de aceite da própria 1619 prevê essa saída.

## Decisões

**O fixture procura o ffmpeg na mesma ordem que o resto do repo.** `process.env.FFMPEG_BIN` → `resources/bin/ffmpeg` (`.exe` no Windows) → PATH. Nada encontrado: o bloco é pulado com motivo explícito. A ordem espelha o `smoke/pipeline.test.ts`, que já é o precedente do repo.

**A procura é só de sistema de arquivos, sem `spawn`.** `existsSync` no caminho local e uma varredura das entradas de `PATH`. É o que permite cumprir "detectar antes de spawnar": um `spawnSync -version` de sonda também custaria processo e ainda poderia travar. Efeito colateral bom: a decisão de pular é síncrona e determinística, não depende de timeout.

**O `spawn` do fixture passa a tratar `error`.** Mesmo com a procura antes, um binário presente mas inexecutável (arquitetura errada, sem permissão) tem que falhar em milissegundos com a mensagem certa, não no timeout.

**Nada de pular no CI.** O job baixa os binários antes de `npm test`, então o teste continua rodando de verdade — a condição de pulo é ausência de binário, não presença de CI.

**No macOS, a suíte roda só na perna arm64.** A matriz baixa `ffmpeg-darwin-x64` para o build x64 e o host é ARM: rodar a suíte ali apostaria em Rosetta para executar o ffmpeg de fixture. O código testado é o mesmo nas duas pernas — a aposta não compra nada.

**Correção por afirmação, não por literal.** Só muda o que afirma algo dependente de plataforma: expectativa passa a ser montada com `join()`, comparando caminho com caminho.

## Fronteiras

| Arquivo | Papel |
|---|---|
| `electron/testSupport/ffmpegBin.ts` | **novo** — resolve o ffmpeg do fixture (não é `*.test.ts`, o vitest não coleta) |
| `electron/main/libraryScanner.test.ts` | usa o resolvedor, trata `error`, compara caminhos com `join` |
| `electron/main/organizationPlan.test.ts` | expectativas (e a entrada do caso idempotente) via `join` |
| `electron/main/binaries.test.ts` | `platform` explicito no caso empacotado; expectativa via `join` |
| `electron/main/reset.test.ts` | casos POSIX marcados como POSIX-only, apontando a TASK-1640 |
| `.github/workflows/build.yml` | `npm test` nos jobs Windows e macOS (arm64) |

Os outros quatro arquivos da lista original **não são tocados** — mexer neles seria churn sem defeito correspondente.

---

## Fase 1 — TASK-1625: fixture não derruba clone novo

`electron/testSupport/ffmpegBin.ts`:

```ts
/** Caminho do ffmpeg utilizável nos testes, ou null quando não há nenhum. */
export function findFfmpeg(env = process.env, platform = process.platform): string | null
```

Ordem: `env.FFMPEG_BIN` (se existir no disco) → `resources/bin/ffmpeg[.exe]` → cada entrada de `env.PATH` → `null`.

Recebe `env` e `platform` por parâmetro para o teste exercitar Windows e PATH vazio sem tocar no processo.

No `libraryScanner.test.ts`: `describe.skipIf(!FFMPEG)` com nome que diz como habilitar (`scripts/fetch-binaries.sh` ou ffmpeg no PATH), e `p.on('error', rej)` no spawn.

Testes de `findFfmpeg`: acha no PATH; prefere `FFMPEG_BIN`; `.exe` no `win32`; PATH vazio → `null`; entrada de PATH inexistente não quebra.

## Fase 2 — TASK-1619: portabilidade real

- `libraryScanner.test.ts`: comparar `tracks.map(t => t.path).sort()` com `[join(dir,'a.mp3'), join(dir,'sub','b.flac')].sort()`.
- `organizationPlan.test.ts`: cada `toBe('/root/...')` vira `toBe(join('/root', ...))`.
- `reset.test.ts`: o `describe` dos casos de `isSafeToClear` ganha `skipIf(process.platform === 'win32')` e um comentário com o porquê e o número do card.
- Os outros quatro arquivos: nenhuma alteração, com a justificativa registrada no card.

## Fase 3 — TASK-1620: CI nos três sistemas

- Windows: `- run: npm test` depois do download dos binários e antes do `dist:win`.
- macOS: idem, com `if: matrix.arch == 'arm64'`.
- ~~`npm run typecheck` e `npm run lint` também passam a rodar nos dois.~~ **Revisto na implementação:** os dois são independentes de plataforma (mesmo `tsconfig`, mesmo `eslint.config.js`, nenhuma regra consulta `process.platform`). Rodá-los três vezes gastaria minuto de runner para produzir o mesmo veredito — e o próprio card pede para não duplicar tempo sem justificativa. Só `npm test` roda nos três.
- O comentário obsoleto sobre "caminhos POSIX" sai.

## Testes

Unidade nova para `findFfmpeg` (lógica pura sobre `env`/`platform`). Para o resto, o teste é a própria suíte rodando: verde no Linux sem `resources/bin`, e verde nos jobs Windows/macOS do CI — que é a verificação que a Fase 3 existe para criar.

## Fora de escopo

- Corrigir `isSafeToClear` no Windows (TASK-1640).
- Cobertura nova de módulos sem teste (TASK-1614 a TASK-1617).
- Rodar o smoke test no CI (continua atrás de `SMOKE=1`).
- Testes de componente React — o projeto não tem `@testing-library`.
