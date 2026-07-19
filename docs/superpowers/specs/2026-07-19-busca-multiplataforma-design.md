# Busca Multi-plataforma (Design)

- **Data:** 2026-07-19
- **Contexto:** app DownMusic (Electron + TS). Ver design base em `2026-07-19-downmusic-desktop-design.md`.
- **Objetivo:** na aba Busca, permitir pesquisar em várias plataformas (Spotify, Deezer, YouTube, SoundCloud) com multi-seleção por checkboxes e resultados agrupados por plataforma.

## Escopo

- **Plataformas:** Spotify, Deezer, YouTube, SoundCloud. (Bandcamp fica de fora — `yt-dlp` não oferece busca para ele.)
- **Interação:** checkboxes para marcar 1..N plataformas; busca só nas marcadas; resultados agrupados por fonte.
- **Fora de escopo:** dedupe entre plataformas; download nativo FLAC do Deezer (ARL/decrypt permanece como possível fase 2).

## Modelo de fontes (reuso da interface `Source`)

Cada fonte implementa `search()`. Duas naturezas:

- **Fontes de metadados → áudio do YouTube** (não baixam da própria plataforma):
  - **Spotify** — `search` via Web API oficial (já implementado). `fetchAudio` casa por ISRC/artista+título no YouTube (já implementado).
  - **Deezer** — `search`/`resolve` via **API pública** `api.deezer.com` (sem login). `fetchAudio` casa por artista+título no YouTube (mesma estratégia do Spotify, via `yt-dlp`). Substitui o stub de fase 2 por uma fonte funcional de metadados; o download nativo (ARL/FLAC) continua futuro.
- **Fontes diretas** (baixam o áudio da própria plataforma via `yt-dlp`):
  - **YouTube** — `search` via `yt-dlp` `ytsearch`.
  - **SoundCloud** — `search` via `yt-dlp` `scsearch`.

## Decisões técnicas (refinadas na análise ultrathink)

1. **Busca do `yt-dlp` usa `--flat-playlist` (desempenho).** `ytsearchN:`/`scsearchN:` com `--flat-playlist --dump-json` retorna entradas leves (id/título/uploader/duração/url) **sem resolver cada vídeo** — muito mais rápido que o dump completo. O metadado completo só é necessário no download (por URL), que já ocorre no `fetchAudio`.
2. **Construção explícita da `sourceUrl` nos resultados de busca (correção crítica).** Entradas `--flat-playlist` **não trazem `webpage_url`**; para YouTube o campo `url` costuma ser só o id. Como `fetchAudio` de YouTube/SoundCloud baixa por `sourceUrl`, cada fonte constrói a URL correta na busca:
   - YouTube: `https://www.youtube.com/watch?v=<id>`.
   - SoundCloud: usa `url`/`webpage_url` (o `yt-dlp` já retorna URL absoluta do SoundCloud).
   Há teste garantindo que resultado de busca tem `sourceUrl` válida e baixável.
3. **Duração do Deezer vem em segundos** (diferente do Spotify, que é ms). O mapeador do Deezer usa `duration` diretamente como `durationSec`.
4. **HTTP compartilhado.** Extrair `HttpClient`/`FetchHttpClient`/`httpError` de `spotifyClient.ts` para `electron/net/http.ts`. Spotify e Deezer passam a importar de lá (evita acoplar Deezer ao módulo do Spotify).
5. **Limite de 8 resultados por plataforma** (evita poluição/lentidão).

## Arquitetura / fronteiras

- **`electron/net/http.ts`** — `HttpClient` (interface), `FetchHttpClient` (fetch global), `httpError` (mensagem com corpo). Reuso por Spotify e Deezer.
- **`electron/sources/deezerClient.ts`** — `DeezerClient` com `HttpClient` injetável:
  - `search(query, limit=8)` → `GET api.deezer.com/search?q=...` → `TrackMeta[]`.
  - `resolveUrl(url)` → `track`/`album`/`playlist` via `api.deezer.com/{tipo}/{id}` (coerência ao colar link do Deezer).
  - Puras: `parseDeezerUrl`, `deezerTrackToMeta`.
- **`electron/sources/deezer.ts`** — `DeezerSource` (metadados → YouTube): `matches` (deezer.com), `search`/`resolve` delegam ao `DeezerClient`; `fetchAudio` via `yt-dlp` (artista+título).
- **Engine `yt-dlp`** — função pura `buildSearchListArgs(query, prefix, n)` (monta `"<prefix><n>:<query>" --flat-playlist --dump-json --no-download`) + método `searchList(query, prefix, n)` que roda e faz parse do JSON linha a linha (reaproveita o parsing de `dumpJson`). Usado por YouTube (`ytsearch`) e SoundCloud (`scsearch`).
- **`electron/main/resolver.ts`** — `searchMany(query, sourceIds[])`: executa `source.search()` das fontes em **paralelo** (`Promise.allSettled`), preservando a ordem pedida e isolando erro por fonte. Retorna `SearchGroup[] = { sourceId, tracks, error? }`.
- **IPC** (`ipc.ts` + `preload`): canal `search` passa a receber `sourceIds: SourceId[]` e retornar `SearchGroup[]`.
- **UI `SearchView.tsx`** — checkboxes das 4 plataformas (todas marcadas por padrão), busca → seções por plataforma (contagem, itens com `[+]`, botão "Enfileirar todos" por grupo, mensagem de erro por grupo).

## Modelos

```ts
// shared/types.ts
interface SearchGroup {
  sourceId: SourceId
  tracks: TrackMeta[]
  error?: string
}
```
`TrackMeta` já existente é suficiente para os resultados (title/artists/album/coverUrl/durationSec/sourceId/sourceUrl).

## Fluxo de dados

```
UI (checkboxes marcadas + query)
  → api.search(query, sourceIds[])
  → Resolver.searchMany  (Promise.allSettled por fonte)
      ├─ SpotifySource.search   (Web API)
      ├─ DeezerSource.search    (api.deezer.com)
      ├─ YouTubeSource.search   (yt-dlp ytsearch flat) → sourceUrl = watch?v=<id>
      └─ SoundCloudSource.search(yt-dlp scsearch flat)
  → SearchGroup[]  (agrupado, erro isolado por fonte)
  → UI renderiza seções; [+] enfileira → fila roteia p/ fetchAudio da fonte
```

## Tratamento de erros

- Erro por fonte isolado no `searchMany` (allSettled): fonte que falha vira `{ sourceId, tracks: [], error }`; as demais aparecem normalmente.
- Sem credenciais Spotify → só o grupo Spotify mostra o aviso "Credenciais ausentes".
- `yt-dlp` ausente → grupos YouTube/SoundCloud mostram erro acionável; Spotify/Deezer seguem.
- Query vazia: UI não dispara busca.

## Estratégia de testes (TDD)

- **`buildSearchListArgs`** (puro): monta `ytsearch8:<q> --flat-playlist --dump-json --no-download`.
- **YouTubeSource.search / SoundCloudSource.search** (engine com runner falso devolvendo JSON de busca): mapeia e **garante `sourceUrl` válida/baixável** (watch URL para YouTube; URL absoluta para SoundCloud).
- **DeezerClient.search / resolveUrl** (HttpClient injetado com JSON da API pública): mapeia campos (artist.name, album.title, cover, duration em segundos, isrc quando houver em resolve).
- **`Resolver.searchMany`**: paralelo, ordem estável, isolamento de erro por fonte (uma fonte lançando não derruba o resultado).
- **UI**: validada ao vivo (headless driver), como nas etapas anteriores.

## Faseamento da implementação

1. **`net/http` compartilhado** (extrair de spotifyClient; atualizar imports/tests).
2. **Deezer** (DeezerClient search+resolve + DeezerSource metadados→YouTube; registrar na composição).
3. **Busca `yt-dlp`** (engine `searchList` + YouTube/SoundCloud `search` com `sourceUrl` correta).
4. **`Resolver.searchMany` + IPC + preload/client tipado.**
5. **UI `SearchView`** (checkboxes, grupos, enfileirar-todos, erros por grupo).
6. **Verificação** (typecheck, testes, build) + **validação ao vivo**.
