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
npm test           # testes unitarios (Vitest) — pula o smoke
npm run dist       # gera AppImage (Linux)

# Smoke test real (rede + yt-dlp + ffmpeg): resolve -> download -> convert/tag
SMOKE=1 YTDLP_BIN="$HOME/.local/bin/yt-dlp" npx vitest run electron/smoke
```

## Distribuicao (AppImage)

```bash
bash scripts/fetch-binaries.sh   # baixa yt-dlp + ffmpeg estaticos p/ resources/bin
npm run dist                     # gera dist/DownMusic-<versao>.AppImage
```

O `yt-dlp` e o `ffmpeg` sao **embarcados** no AppImage (via `extraResources`),
entao o app empacotado NAO depende deles no PATH. Em desenvolvimento
(`npm run dev`) ainda usa o `yt-dlp`/`ffmpeg` do PATH.

Rodar o AppImage no Linux:

```bash
chmod +x dist/DownMusic-*.AppImage
./dist/DownMusic-*.AppImage
```

Requisitos de runtime (distros recentes, ex. Ubuntu 24.04):

- **libfuse2** (para montar o AppImage): `sudo apt install libfuse2`
  — ou rode com `--appimage-extract-and-run` (nao precisa de FUSE).
- **Sandbox do Chromium:** por padrao o Ubuntu 24.04+ restringe user
  namespaces (AppArmor), o que quebra o sandbox. Escolha uma:
  - manter o sandbox: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
    (persistir em `/etc/sysctl.d/`); ou
  - rodar com `--no-sandbox` (desliga o sandbox).

`yt-dlp` e `ffmpeg` ja vem embarcados no AppImage — nao precisa instalar nada.

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
