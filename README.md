# DownMusic

App desktop (Electron + React + TypeScript) para baixar musica de multiplas
fontes com tags ID3 ricas, capa e organizacao de arquivos por genero — pensado
para quem importa o acervo no **Rekordbox**.

Origem e inspiracao:

- **spotDL** — o modelo adotado: API oficial do Spotify apenas para
  **metadados**, audio vindo de fontes publicas via `yt-dlp`.
- **DeezLoader / deemix** — a familia que originou a ideia.
- **MediaHuman** — de onde vieram multi-site, canais inteiros, monitor de
  clipboard e drag & drop.

> Nota legal: nao ha captura de stream com DRM. Baixar catalogo comercial sem
> licenca pode ser ilegal; o uso e responsabilidade do usuario e deve respeitar
> direitos e Termos de Servico.

## Funcionalidades

- **Omnibox**: cole um link ou digite um texto para buscar — a mesma barra faz
  as duas coisas.
- **Fontes**: YouTube, Spotify (metadados), Deezer (metadados), Bandcamp,
  SoundCloud e **qualquer um dos 1800+ sites do `yt-dlp`** (TikTok, Vimeo,
  Dailymotion, Facebook, Twitch...) pela fonte generica.
- **Playlists, albuns e canais inteiros**: resolve tudo e lista faixa a faixa,
  com filtro por texto e selecao individual.
- **Fila** com concorrencia configuravel, progresso em tempo real, retry por
  item e "tentar todas as que falharam".
- **Playlists cadastradas**: sincronizacao manual (ou ao abrir o app) que baixa
  so o que ainda nao esta no historico. Expandir mostra o status por faixa.
- **Historico persistente**: reconhece por ISRC ou artista+titulo, mesmo em
  outra plataforma, e marca "✓ Baixado" nas listagens em tempo real.
- **Tags para Rekordbox**: enriquecimento automatico via Deezer (genero, ano,
  gravadora, nº de faixa/disco, capa em alta) e arquivos organizados em pastas
  por genero. BPM e tonalidade nao sao escritos de proposito — o Rekordbox
  calcula na importacao.
- **Versoes extended**: procura a versao estendida de cada faixa resolvida e
  permite trocar antes de baixar.
- **Organizar**: aponte uma pasta existente e o app varre, le as tags, aponta
  problemas (tags faltando, duplicados, baixa qualidade), enriquece os buracos
  e propoe uma reorganizacao por template — com previa e aprovacao. Nada e
  alterado no disco sem confirmacao.
- **Clipboard e drag & drop**: copiar um link suportado gera uma sugestao
  discreta; arrastar um link para a janela tambem funciona.
- **Aviso de dependencias**: se `yt-dlp` ou `ffmpeg` nao responderem, o app
  avisa na abertura em vez de falhar so no primeiro download.

## Instalacao (usuarios finais)

📥 **[Baixe a ultima versao na pagina de Releases](https://github.com/kadufarah1979/DownMusic/releases/latest)**
— `yt-dlp` e `ffmpeg` ja vem embarcados no app; nao precisa instalar mais nada.

| Plataforma | Arquivo na pagina de releases |
|---|---|
| 🪟 Windows | `DownMusic.Setup.<versao>.exe` |
| 🍎 macOS Apple Silicon (M1/M2/M3+) | `DownMusic-<versao>-arm64.dmg` |
| 🍎 macOS Intel | `DownMusic-<versao>-x64.dmg` |
| 🐧 Linux | `DownMusic-<versao>.AppImage` |

Os instaladores sao gerados pelo GitHub Actions (`.github/workflows/build.yml`)
a cada tag `v*`.

### Windows

1. Baixe o `DownMusic.Setup.<versao>.exe` na pagina de releases.
2. Execute. Como o instalador **nao e assinado**, o **SmartScreen** pode avisar:
   clique em **Mais informacoes → Executar assim mesmo**.
3. Siga o assistente — da para escolher a pasta de instalacao. No fim, o
   DownMusic aparece no Menu Iniciar e na area de trabalho.

### macOS

> O CI gera duas builds: **Apple Silicon** (`-arm64`) e **Intel** (`-x64`).
> Baixe a que corresponde ao seu Mac (menu Apple → Sobre este Mac).

1. Baixe o `.dmg` da sua arquitetura, abra e arraste o **DownMusic** para a
   pasta **Applications**.
2. Como o app **nao e assinado/notarizado**, o Gatekeeper bloqueia na primeira
   abertura. Contorne de uma destas formas:
   - **Clique com o botao direito no app → Abrir** e confirme em **Abrir**; ou
   - remova a quarentena pelo Terminal:
     ```bash
     xattr -dr com.apple.quarantine /Applications/DownMusic.app
     ```
3. Se o macOS disser que o "app esta danificado", use o comando `xattr` acima —
   o aviso e por falta de assinatura, nao corrupcao.

### Linux

```bash
chmod +x DownMusic-*.AppImage
./DownMusic-*.AppImage
```

Requisitos de runtime (distros recentes, ex. Ubuntu 24.04):

- **libfuse2** (para montar o AppImage): `sudo apt install libfuse2`
  — ou rode com `--appimage-extract-and-run` (nao precisa de FUSE).
- **Sandbox do Chromium:** por padrao o Ubuntu 24.04+ restringe user
  namespaces (AppArmor), o que quebra o sandbox. Escolha uma:
  - manter o sandbox: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
    (persistir em `/etc/sysctl.d/`); ou
  - rodar com `--no-sandbox` (desliga o sandbox).

## Desenvolvimento

Requisitos: Node.js 18+ e `yt-dlp`/`ffmpeg` no PATH (so em desenvolvimento — no
app empacotado eles vao embarcados).

```bash
npm install
npm run dev        # roda o app em modo desenvolvimento
npm run typecheck  # checa tipos
npm test           # testes unitarios (Vitest) — pula o smoke

# Smoke test real (rede + yt-dlp + ffmpeg): resolve -> download -> convert/tag
SMOKE=1 YTDLP_BIN="$HOME/.local/bin/yt-dlp" npx vitest run electron/smoke
```

### Empacotamento

```bash
bash scripts/fetch-binaries.sh   # baixa yt-dlp + ffmpeg estaticos p/ resources/bin
npm run dist                     # AppImage (Linux)
npm run dist:win                 # instalador NSIS (Windows)
npm run dist:mac                 # dmg + zip (macOS)
```

Os binarios sao **embarcados** no pacote (via `extraResources`), entao o app
distribuido nao depende deles no PATH.

## Arquitetura

Design completo em `docs/superpowers/specs/` — um documento datado por feature,
com o raciocinio por tras de cada decisao.

```
electron/
  main/      index · ipc · config · queue · resolver · tagger · cover
             history · playlists · metadataEnricher · extendedFinder
             library · libraryScanner · organizationPlan · organizationExecutor
             binaries · clipboardWatcher · updater · reset
  engines/   ytdlp · ffmpeg                (wrappers dos binarios externos)
  sources/   types · spotify/spotifyClient · deezer/deezerClient
             youtube · bandcamp · soundcloud · generic · ytdlpMap
  net/       http                          (HttpClient compartilhado)
  preload/   index                         (API tipada exposta ao renderer)
  smoke/     pipeline.test.ts              (teste real, sob SMOKE=1)
src/         App · main · ipc
  components/ UrlBar · SearchResults · TrackSelectList · QueueList
              PlaylistsView · PlaylistTracks · HistoryView · OrganizeView
              SettingsView · ResetDialog · HelpView
  lib/        downloaded · queueStatus · platforms
shared/      types · url · text · playlist · history · trackFilter · trackStatus
             queueProgress · genreGroups · library · libraryAnalysis
             extended · version
```

Fronteiras: `shared/` guarda a logica pura (testada por unidade), `electron/main`
concentra I/O com dependencias injetadas, e o renderer nao tem regra de negocio —
fala com o main so pelo preload tipado.

Cada fonte implementa a interface `Source` (`matches`/`search`/`resolve`/
`fetchAudio`), o que torna cada provedor — inclusive o Spotify — apenas mais um
plugin.

## Status

Funcional e publicado. Versao atual: **0.1.5**, com instaladores para Windows,
macOS (Intel e Apple Silicon) e Linux.

O que ainda esta em aberto:

- **Download nativo do Deezer** (ARL + decrypt FLAC), previsto como "fase 2" no
  design original, nunca foi implementado e esta em avaliacao: ele conflita com
  a nota legal acima, ja que decriptar catalogo licenciado e o oposto de baixar
  de fonte publica. Hoje o Deezer funciona como **fonte de metadados**, com o
  audio vindo do YouTube — mesma estrategia do Spotify.
- Cobertura de teste desigual: a logica pura em `shared/` esta bem coberta; as
  camadas de persistencia do `main` ainda nao.
- Sem lint configurado no repositorio.
