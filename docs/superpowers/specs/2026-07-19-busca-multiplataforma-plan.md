# Plano — Busca Multi-plataforma

Spec: `2026-07-19-busca-multiplataforma-design.md`. Cada tarefa segue TDD (teste falha → implementa → verde). Ao final: typecheck + suíte + build + validação ao vivo.

## Fase 1 — HTTP compartilhado
- **1.1** Criar `electron/net/http.ts` movendo `HttpClient`, `FetchHttpClient`, `httpError` de `spotifyClient.ts` (incluir `getJson`, `postForm`, `getText`).
- **1.2** `spotifyClient.ts` importa de `../net/http`; remover as definições locais. Atualizar `spotifyClient.test.ts` (import de `HttpClient`).
- **Verde:** suíte inteira continua passando (sem mudança de comportamento).

## Fase 2 — Deezer (metadados → YouTube)
- **2.1** `deezerClient.ts`: puras `parseDeezerUrl(url)` (track/album/playlist) e `deezerTrackToMeta(obj)` (id, title, artist.name, album.title, album.cover_big→coverUrl, duration→durationSec **em segundos**, isrc quando houver, sourceUrl link deezer). Testes RED→GREEN.
- **2.2** `DeezerClient` com `HttpClient` injetável: `search(q, limit=8)` (`/search?q=`), `resolveUrl(url)` (track/album/playlist via `/{tipo}/{id}`; álbum/playlist paginam via `next`/`data`). Testes com HttpClient falso.
- **2.3** `DeezerSource` (substitui stub): `matches` (deezer.com), `search`/`resolve` delegam ao client, `fetchAudio` via `yt-dlp` (artista+título, igual Spotify). Teste do `matches`/`search` com engine+client falsos.
- **2.4** Registrar no composition root (`main/index.ts`): `new DeezerSource(ytdlp, new DeezerClient())`.

## Fase 3 — Busca via yt-dlp (YouTube + SoundCloud)
- **3.1** `ytdlp.ts`: `buildSearchListArgs(query, prefix, n)` puro (`"<prefix><n>:<query>" --flat-playlist --dump-json --no-download`) + método `searchList(query, prefix, n)` (parse JSON linha a linha). Testes RED→GREEN (inclui parse de várias linhas).
- **3.2** `YouTubeSource.search`: `searchList(q,'ytsearch',8)` → mapeia com `ytdlpInfoToTrack`, **sobrescrevendo `sourceUrl` = `https://www.youtube.com/watch?v=<id>`**. Teste garante `sourceUrl` = watch URL (baixável).
- **3.3** `SoundCloudSource.search`: `searchList(q,'scsearch',8)` → mapeia; `sourceUrl` = `url`/`webpage_url` da entrada. Teste garante `sourceUrl` não vazia.

## Fase 4 — Resolver.searchMany + IPC
- **4.1** `shared/types.ts`: adicionar `SearchGroup { sourceId, tracks, error? }`.
- **4.2** `Resolver.searchMany(query, sourceIds[])`: `Promise.allSettled` por fonte, ordem estável, erro→`{sourceId,tracks:[],error}`. Substitui/《complementa》o `search` atual. Testes: paralelo + isolamento de erro + ordem.
- **4.3** IPC (`ipc.ts`): handler `search` recebe `(query, sourceIds)` e chama `searchMany`. `preload/index.ts` + `src/ipc.ts`: `search(query, sourceIds): Promise<SearchGroup[]>`.

## Fase 5 — UI SearchView
- **5.1** `SearchView.tsx`: estado das checkboxes (Spotify/Deezer/YouTube/SoundCloud, todas marcadas), campo de busca, chamada `api.search(query, marcadas)`.
- **5.2** Render: uma seção por grupo (nome da plataforma + contagem), itens com `[+]` (enfileira 1), botão "Enfileirar todos" (enfileira o grupo), e mensagem de erro por grupo. Estados de loading/vazio.

## Fase 6 — Verificação e validação
- **6.1** `npm run typecheck` limpo; `npx vitest run` verde; `npm run build` OK.
- **6.2** Validação ao vivo (driver headless): buscar um termo em Deezer+YouTube+SoundCloud (e Spotify se credenciais), conferir grupos e enfileirar um item de cada, baixando ≥1 faixa até `done`.
- **6.3** Commits por fase; limpar drivers temporários.
