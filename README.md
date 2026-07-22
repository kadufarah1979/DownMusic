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

## Instalacao (usuarios finais)

📥 **Baixe a ultima versao:**
**[Releases (latest)](https://github.com/kadufarah1979/DownMusic/releases/latest)**
— ou use os links diretos por plataforma abaixo. `yt-dlp` e `ffmpeg` ja vem
embarcados no app; nao precisa instalar mais nada.

| Plataforma | Download direto |
|---|---|
| 🪟 Windows | [DownMusic.Setup.0.1.2.exe](https://github.com/kadufarah1979/DownMusic/releases/download/v0.1.2/DownMusic.Setup.0.1.2.exe) |
| 🍎 macOS Apple Silicon | [DownMusic-0.1.2-arm64.dmg](https://github.com/kadufarah1979/DownMusic/releases/download/v0.1.2/DownMusic-0.1.2-arm64.dmg) |
| 🍎 macOS Intel | [DownMusic-0.1.2-x64.dmg](https://github.com/kadufarah1979/DownMusic/releases/download/v0.1.2/DownMusic-0.1.2-x64.dmg) |
| 🐧 Linux | [DownMusic-0.1.2.AppImage](https://github.com/kadufarah1979/DownMusic/releases/download/v0.1.2/DownMusic-0.1.2.AppImage) |

> Os links diretos apontam para a `v0.1.2`. Para sempre pegar a mais nova, use a
> pagina **[Releases (latest)](https://github.com/kadufarah1979/DownMusic/releases/latest)**.
> Os instaladores sao gerados pelo GitHub Actions (`.github/workflows/build.yml`).

### Windows

1. Baixe o **[DownMusic.Setup.0.1.2.exe](https://github.com/kadufarah1979/DownMusic/releases/download/v0.1.2/DownMusic.Setup.0.1.2.exe)**.
2. Execute. Como o instalador **nao e assinado**, o **SmartScreen** pode avisar:
   clique em **Mais informacoes → Executar assim mesmo**.
3. Siga o assistente — da para escolher a pasta de instalacao. No fim, o
   DownMusic aparece no Menu Iniciar e na area de trabalho.

### macOS

> O CI gera duas builds: **Apple Silicon** (`-arm64`, M1/M2/M3+) e **Intel**
> (`-x64`). Baixe a que corresponde ao seu Mac (menu Apple → Sobre este Mac).

1. Baixe o **[DownMusic-0.1.2-arm64.dmg](https://github.com/kadufarah1979/DownMusic/releases/download/v0.1.2/DownMusic-0.1.2-arm64.dmg)**
   (Apple Silicon) ou
   **[DownMusic-0.1.2-x64.dmg](https://github.com/kadufarah1979/DownMusic/releases/download/v0.1.2/DownMusic-0.1.2-x64.dmg)**
   (Intel), abra e arraste o **DownMusic** para a pasta **Applications**.
2. Como o app **nao e assinado/notarizado**, o Gatekeeper bloqueia na primeira
   abertura. Contorne de uma destas formas:
   - **Clique com o botao direito no app → Abrir** e confirme em **Abrir**; ou
   - remova a quarentena pelo Terminal:
     ```bash
     xattr -dr com.apple.quarantine /Applications/DownMusic.app
     ```
3. Se o macOS disser que o "app esta danificado", use o comando `xattr` acima —
   o aviso e por falta de assinatura, nao corrupcao.

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
