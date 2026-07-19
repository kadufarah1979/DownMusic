# Link "Ouvir na plataforma" — Design

- **Data:** 2026-07-19
- **Contexto:** app DownMusic (Electron + TS). Cada resultado (`TrackMeta`) ja carrega `sourceUrl` (URL da faixa na plataforma de origem).
- **Objetivo:** permitir ouvir a musica antes de baixar, abrindo a pagina da faixa na propria plataforma (Spotify/Deezer/YouTube/SoundCloud) no navegador padrao. Sem player embutido nem busca de preview.

## Comportamento

- Icone **"↗" (abrir externo)** por faixa na listagem, que abre `track.sourceUrl` no navegador padrao:
  - Spotify → open.spotify.com/track/...
  - Deezer → deezer.com/track/...
  - YouTube → youtube.com/watch?v=...
  - SoundCloud → soundcloud.com/...
- As URLs ja existem no `sourceUrl` de cada resultado — nada novo a buscar.

## Onde

- No componente `TrackSelectList` (usado na aba Busca e na lista de playlist resolvida na aba Download). Cada linha: `[checkbox] Artista — Titulo   [↗]`.

## Tecnico

- **Main (`ipc.ts`):** handler `shell:openExternal` → valida que a URL comeca com `http://`/`https://` e chama `shell.openExternal(url)`. Retorna string de erro (vazia = sucesso).
- **Preload/client:** `api.openExternal(url: string): Promise<string>`.
- **UI (`TrackSelectList`):** botao com icone que chama `api.openExternal(track.sourceUrl)`; desabilitado se `sourceUrl` vazio.

## Bordas / testes

- `sourceUrl` vazio: botao desabilitado.
- URL nao-http: ignorada no main (seguranca — evita abrir esquemas arbitrarios).
- So front-end/IPC; fila e download **inalterados**.
- `shell.openExternal` roda no main → **validacao ao vivo com stub**: confirma que abre a URL correta da faixa. Suite existente verde; typecheck e build OK.
