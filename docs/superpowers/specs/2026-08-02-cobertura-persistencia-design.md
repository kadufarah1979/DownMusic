# Cobertura das camadas de persistência e orquestração — Design + Plano

- **Data:** 2026-08-02
- **Cards:** TASK-1614 (Fase 1), TASK-1615 (Fase 2), TASK-1616 (Fase 3), TASK-1617 (Fase 4)
- **Origem:** quatro cards de cobertura criados no levantamento inicial do projeto.
- **Objetivo:** cobrir o que decide o que vai para o disco e o que o usuário recebe — sem que nenhum teste toque os dados reais do usuário.

## Diagnóstico

A lógica pura tem teste (`shared/history.ts`, `shared/playlist.ts`, `shared/extended.ts`). O que não tem é a camada que **decide o que é gravado** (`HistoryStore`, `ConfigStore`, `PlaylistStore`) e a que **decide o que o usuário recebe** (`PlaylistService`, `extendedFinder`, `downloadCover`, `FetchHttpClient`).

### O obstáculo comum: as três stores constroem a própria persistência

```ts
export class HistoryStore {
  constructor() { this.store = new Store({ name: 'history', defaults: { entries: [] } }) }
```

`ConfigStore` e `PlaylistStore` fazem igual. Um teste que instancie qualquer uma delas hoje escreve **no `~/.config/downmusic` real** — exatamente o histórico e as playlists do usuário. Não é hipótese: é o comportamento do `electron-store` quando não recebe `cwd`.

`ConfigStore` ainda chama `app.getPath('music')` (`config.ts:28`). Fora do Electron isso não existe; só não explode porque há um `try/catch` que devolve `''`. Ou seja, hoje o default de `outputDir` num teste seria string vazia — um detalhe que passaria despercebido e viraria expectativa errada.

O card TASK-1614 já aponta a saída: *"store injetado ou stub em memória"*.

### Um caso em que o card pede teste de comportamento que não existe

TASK-1615 exige: *"`syncAll()`: soma os resultados e **isola falha de uma playlist** (não derruba as demais)"*.

O código não faz isso (`playlists.ts:106-115`):

```ts
for (const sub of this.list()) {
  const r = await this.sync(sub.url)   // sem try/catch
  added += r.added
```

Uma playlist com URL morta, privada ou fora do ar interrompe o laço: as playlists seguintes não sincronizam, e as anteriores perdem a contagem — o `await` rejeita e ninguém recebe o parcial. Com dez assinaturas, uma quebrada anula as outras nove.

Escrever o teste "conforme o comportamento atual" enfiaria esse bug num teste e o tornaria permanente. Escrever o teste que o card descreve exige mudar produção.

## Decisões

**Injeção com padrão, não `vi.mock`.** Cada store passa a receber a persistência por construtor, com o `new Store(...)` real como valor padrão — nenhuma chamada existente muda. Precedente no repo: o `QueueManager` recebeu o `QueueStore` assim na TASK-1634. `vi.mock('electron-store')` resolveria o mesmo problema amarrando o teste ao módulo interno, e não ajudaria em nada com o `app.getPath`.

**Um fake em memória compartilhado**, em `electron/testSupport/memoryStore.ts` — a mesma pasta criada na TASK-1625, que o vitest não coleta como teste. Três arquivos de teste usam o mesmo objeto em vez de inventar três.

**`safeDownloadsDir` também entra por parâmetro** no `ConfigStore`, para o teste afirmar o default sem depender de o Electron existir.

**`syncAll` passa a isolar falhas — e a contá-las.** Engolir a exceção em silêncio troca um problema por outro: o usuário veria "0 novas" sem saber que metade das playlists nem foi consultada. `SyncResult` ganha `failed`, e a mensagem da `PlaylistsView` menciona a contagem só quando houver. É a menor mudança que faz o card ser verdade.

**`extendedFinder` não precisa de mudança.** O card pede "erro da engine tratado sem lançar", e `Resolver.searchMany` já isola por fonte com `Promise.allSettled` (`resolver.ts:33-44`): fonte que falha vira `{tracks: [], error}`. O teste prova o contrato existente em vez de inventar outro.

**Nada de rede real.** `downloadCover` e `FetchHttpClient` usam o `fetch` global; os testes o substituem com `vi.stubGlobal`.

## Fronteiras

| Arquivo | Papel |
|---|---|
| `electron/testSupport/memoryStore.ts` | **novo** — fake em memória com a fatia de API do electron-store que as stores usam |
| `electron/main/history.ts`, `config.ts`, `playlists.ts` | persistência injetável (padrão inalterado) |
| `electron/main/playlists.ts` | `syncAll` isola e conta falhas; `SyncResult.failed` |
| `src/components/PlaylistsView.tsx` | menciona falhas na mensagem quando houver |
| `electron/main/{history,config,playlists,extendedFinder,cover}.test.ts`, `electron/net/http.test.ts` | **novos** |

---

## Fase 1 — TASK-1614: HistoryStore e ConfigStore

`HistoryStore`: `list` devolve o que está gravado; `add` delega o dedup a `addToHistory` (por ISRC e por `nameKey`) e grava; `clear` zera. O dedup em si já tem teste em `shared/history.test.ts` — aqui o que se prova é que a store **usa** essa função e persiste o resultado, não a regra de dedup de novo.

`ConfigStore`: defaults (incluindo `outputDir` derivado); `update` faz merge parcial preservando o resto; `update` devolve o estado já mesclado.

## Fase 2 — TASK-1615: PlaylistStore e PlaylistService

Store: `upsert` substitui pela URL (não duplica), `update` altera só a assinatura certa, `remove`, `clear`.

Service: `add` deriva nome/`sourceId`/`trackCount` da primeira faixa e rejeita playlist vazia; `sync` enfileira só o que não está no histórico, atualiza `lastSyncedAt`/`trackCount` e devolve `{added, total}`; `syncAll` soma e **continua depois de uma falha**, reportando `failed`; `clear` remove todas.

## Fase 3 — TASK-1616: extendedFinder

Resolver falso registrando a query recebida. Cobre: query montada com artistas + título + `extended mix`; melhor candidata por fonte; fonte sem candidata qualificada é omitida; fonte que devolve erro não derruba as demais nem lança.

## Fase 4 — TASK-1617: net/http e cover

`httpError`: mensagem com método, URL e status; extrai `{"error":"x"}` e `{"error":{"message":"x"}}`; corpo não-JSON entra cru; corpo ilegível não quebra.
`FetchHttpClient`: `getJson` devolve JSON e lança em não-2xx; `postForm` envia `application/x-www-form-urlencoded` com o corpo codificado; `getText` manda User-Agent de navegador.
`downloadCover`: grava e devolve o caminho; `undefined` para URL vazia, esquema não-http, resposta não-ok e erro de rede — nenhum desses lança (o Tagger conta com isso).

## Fora de escopo

- Testes de componente React (o projeto não tem `@testing-library`).
- Trocar `electron-store` por outra coisa.
- Cobertura de `updater.ts`, `clipboardWatcher.ts` e das fontes (já têm teste próprio).
