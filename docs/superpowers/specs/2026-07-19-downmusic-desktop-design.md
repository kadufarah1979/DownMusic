# DownMusic — App Desktop (Design)

- **Data:** 2026-07-19
- **Plataforma-alvo:** Linux (AppImage) no MVP; Windows/macOS em fase futura
- **Stack:** Electron + TypeScript, UI React + Tailwind
- **Origem/inspiração:** família DeezLoader/deemix (gist `nzec/f366c7694fe50d7c69f8654579112da5`) + modelo spotDL (metadados oficiais + `yt-dlp`)

## Nota legal

O foco é o caminho **defensável**: usar a **API oficial do Spotify apenas para metadados** e baixar o áudio de **fontes públicas** (YouTube/Bandcamp/SoundCloud via `yt-dlp`). Não implementamos captura de stream com DRM. Baixar catálogo comercial sem licença pode ser ilegal; o uso é responsabilidade do usuário e deve respeitar direitos e Termos de Serviço.

## Objetivo

App desktop para resolver links/buscas de música de múltiplas fontes e baixar o áudio com tags e organização de arquivos, com uma fila de downloads gerenciável.

## Arquitetura

Electron em 3 camadas, comunicando por IPC tipado (via `contextBridge`/preload):

```
RENDERER (React + Tailwind) — UI, sem lógica de negócio
  Busca · Colar URL · Fila/progresso · Configurações
        │ IPC tipado
MAIN (Node)
  Queue Manager (concorrência + retry) · Config Store · Resolver (roteia p/ fonte) · Tagger (tags+capa via ffmpeg)
        │ interface Source (plugin)
  spotify (meta API → youtube) · youtube (yt-dlp) · bandcamp/soundcloud (yt-dlp) · deezer (fase 2: ARL+decrypt)
        │
  binários externos: yt-dlp, ffmpeg
```

### Interface `Source` (fronteira central de módulos)

Cada fonte é um plugin que implementa a mesma interface, tornando "Spotify" apenas mais um plugin e permitindo adicionar/remover fontes sem tocar no resto do sistema.

```ts
interface Source {
  id: 'spotify' | 'youtube' | 'bandcamp' | 'soundcloud' | 'deezer'
  matches(url: string): boolean               // reconhece o link
  search(q: string): Promise<TrackMeta[]>     // busca por texto
  resolve(url: string): Promise<TrackMeta[]>  // link → 1..N faixas (playlist expande)
  fetchAudio(t: TrackMeta, opts: FetchOptions): Promise<AudioResult> // baixa o áudio bruto
}
```

- **spotify**: `search`/`resolve` usam a Web API oficial (Client ID/Secret) só para metadados; `fetchAudio` delega ao motor `yt-dlp` buscando por `ISRC`/nome+artista.
- **youtube/bandcamp/soundcloud**: `resolve` e `fetchAudio` via `yt-dlp` direto.
- Um `ytdlpEngine` compartilhado é injetado nos plugins — não é reimplementado em cada um.
- **deezer** (fase 2): mesma interface, motor próprio (decrypt Blowfish + ARL).

O `Resolver` recebe uma URL, pergunta a cada `Source.matches()` e roteia. A `Queue` chama `fetchAudio` respeitando concorrência, e passa o resultado ao `Tagger`.

## Fluxo de dados

```
URL/busca
  → Resolver (roteia p/ Source)
  → TrackMeta[]  (playlist expande em N faixas)
  → Queue (N simultâneos, retry em falha)
  → Source.fetchAudio (yt-dlp) → arquivo de áudio bruto
  → Tagger (ffmpeg: converte p/ formato-alvo, embute tags + capa)
  → grava no template de pasta/nome
Progresso reportado por evento IPC → UI atualiza a fila.
```

## Componentes (Main)

- **Resolver** (`resolver.ts`): roteamento URL → Source; expande playlists.
- **Queue Manager** (`queue.ts`): `p-queue` com limite de concorrência, estados por item (queued/running/done/error), retry com backoff, emissão de progresso.
- **Config Store** (`config.ts`): `electron-store` — pasta destino, template de nome, formato/qualidade, credenciais (Spotify Client ID/Secret).
- **Tagger** (`tagger.ts`): via `ffmpeg` converte para formato-alvo e embute tags (título, artista, álbum, capa).
- **Engines** (`engines/ytdlp.ts`, `engines/ffmpeg.ts`): wrappers `execa` sobre binários externos, com parsing de progresso.
- **Sources** (`sources/*.ts`): plugins implementando `Source`.
- **IPC** (`ipc.ts` + `preload/index.ts`): superfície tipada exposta ao renderer.

## Componentes (Renderer)

- **UrlBar**: colar link → dispara resolve/enfileira.
- **SearchView**: busca por texto → lista de resultados → enfileira selecionados.
- **QueueList**: itens da fila com status/progresso, retry/cancelar.
- **SettingsView**: pasta destino, template, formato/qualidade, credenciais Spotify.
- **ipc.ts**: cliente tipado que fala com o preload.

## Modelos compartilhados (`shared/types.ts`)

- `TrackMeta` — id, título, artista(s), álbum, capa (URL), isrc, duração, sourceId, sourceUrl.
- `FetchOptions` — formato, qualidade, pasta destino, template.
- `AudioResult` — caminho do arquivo bruto, formato/codec de origem.
- `QueueItem` — TrackMeta + estado + progresso + erro.

## Stack e dependências

- **Electron** + **electron-vite** (build) + **electron-builder** (AppImage).
- **React** + **Tailwind CSS**; **TypeScript** em todo o código.
- **electron-store** (config/credenciais), **p-queue** (concorrência), **execa** (subprocessos).
- Binários **yt-dlp** e **ffmpeg**: resolvidos do sistema (`PATH`) no MVP; empacotamento próprio em fase futura.

## Tratamento de erros

- Falha de resolução (link inválido / fonte não reconhecida): erro claro na UI, item não entra na fila.
- Falha de download: item marcado `error` com mensagem; retry manual e retry automático com backoff (limite configurável).
- Binário ausente (`yt-dlp`/`ffmpeg` não no PATH): checagem na inicialização com aviso acionável.
- Credenciais Spotify ausentes/ inválidas: busca/resolve Spotify desabilitados com instrução de configuração.

## Estratégia de testes

- **Unit (Vitest):** `Resolver.matches` roteia URLs corretamente; `Queue` respeita concorrência e transita estados; parsing de progresso do `ytdlp`; expansão de template de nome.
- **Sources:** testes com mocks dos engines/HTTP (sem rede real).
- Testes E2E de UI ficam fora do MVP.

## Escopo e faseamento

### MVP (fase 1)
- Colar URL + busca por texto.
- Fila com progresso, concorrência e retry.
- Config de formato/qualidade, pasta destino e template de organização; tags + capa.
- Fontes via `yt-dlp`: **Spotify→YouTube, YouTube, Bandcamp, SoundCloud**.

### Fase 2
- Plugin **Deezer** (ARL + decrypt Blowfish) implementando a mesma interface `Source`.
- Empacotamento de binários e cross-platform (Windows/macOS).

## Esqueleto de projeto

```
DownMusic/
├─ package.json, tsconfig.json, electron.vite.config.ts, .gitignore
├─ electron/
│  ├─ main/     index.ts · queue.ts · resolver.ts · tagger.ts · config.ts · ipc.ts
│  ├─ engines/  ytdlp.ts · ffmpeg.ts
│  ├─ sources/  types.ts · spotify.ts · youtube.ts · bandcamp.ts · soundcloud.ts · deezer.ts (stub)
│  └─ preload/  index.ts (API tipada exposta)
├─ src/ (renderer)
│  ├─ App.tsx · main.tsx · index.css
│  ├─ components/ UrlBar · SearchView · QueueList · SettingsView
│  └─ ipc.ts (client tipado)
└─ shared/ types.ts
```

No esqueleto, motor `yt-dlp`, fila, resolver, tipos e UI têm estrutura funcional mínima (stubs compiláveis com TODOs) prontos para implementação real. `deezer.ts` entra como stub.
