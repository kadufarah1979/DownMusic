# DownMusic

App desktop (Electron + TypeScript) para resolver links/buscas de musica de
multiplas fontes e baixar o audio com tags e organizacao de arquivos.

Inspirado na familia DeezLoader/deemix e no modelo **spotDL**: usa a API oficial
do Spotify apenas para **metadados** e baixa o audio de fontes publicas
(YouTube/Bandcamp/SoundCloud) via `yt-dlp`.

> Nota legal: nao ha captura de stream com DRM. Baixar catalogo comercial sem
> licenca pode ser ilegal; o uso e responsabilidade do usuario e deve respeitar
> direitos e Termos de Servico.

## Requisitos

- Node.js 18+
- `yt-dlp` e `ffmpeg` no PATH

## Setup

```bash
npm install
npm run dev        # roda o app em modo desenvolvimento
npm run typecheck  # checa tipos
npm test           # testes (Vitest)
npm run dist       # gera AppImage (Linux)
```

## Arquitetura

Ver `docs/superpowers/specs/2026-07-19-downmusic-desktop-design.md`.

```
electron/
  main/     index · queue · resolver · tagger · config · ipc
  engines/  ytdlp · ffmpeg          (wrappers de binarios externos)
  sources/  types · spotify · youtube · bandcamp · soundcloud · deezer(stub)
  preload/  index                   (API tipada exposta ao renderer)
src/        App + components (UrlBar, SearchView, QueueList, SettingsView)
shared/     types                   (TrackMeta, QueueItem, AppConfig...)
```

Cada fonte implementa a interface `Source` (`matches/search/resolve/fetchAudio`),
o que torna cada provedor (inclusive Spotify) apenas mais um plugin.

## Status

- **MVP (fase 1):** esqueleto criado. Logica real dos plugins/engines marcada
  com `TODO`, pronta para implementacao.
- **Fase 2:** plugin Deezer (ARL + decrypt) e empacotamento cross-platform.
