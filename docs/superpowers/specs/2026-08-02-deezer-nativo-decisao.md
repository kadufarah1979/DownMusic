# Download nativo do Deezer (ARL + decrypt) — Decisão

- **Data:** 2026-08-02
- **Card:** TASK-1621 (spike)
- **Recomendação: descartar.** Não implementar, e tirar a promessa do código e do design.
- **Status: aguardando aprovação do proprietário.** A limpeza descrita no fim só entra depois do "ok" — o card exige a aprovação antes de fechar, e presumi-la seria decidir no lugar de quem decide.

## O que estava previsto

O design original (`2026-07-19-downmusic-desktop-design.md`, linhas 27, 49, 119-120) previa um plugin Deezer com download nativo em FLAC: autenticar com um **ARL** — o cookie de sessão de uma conta Deezer — e decriptar o stream, que vem cifrado em Blowfish por trecho.

Nunca foi implementado. Hoje `DeezerSource` usa o Deezer como **fonte de metadados** e busca o áudio no YouTube via yt-dlp (`electron/sources/deezer.ts:12` ainda registra o nativo como "possível fase 2").

## Por que descartar

### 1. É o oposto exato da linha que o projeto já traçou

O README diz, em duas linhas (15-17): *"não há captura de stream com DRM"*. Decriptar o stream do Deezer com o ARL de uma conta **é** captura de stream com DRM. Não é uma zona cinzenta que dê para navegar com um aviso — é a única frase da nota legal que o recurso contradiz diretamente.

E não é só postura. Contornar uma medida técnica de proteção tem tratamento próprio na lei, separado da questão de direito autoral em si (DMCA §1201 nos EUA, artigo 6 da Diretiva 2001/29 na UE, artigo 107 da Lei 9.610/98 no Brasil). O "uso é responsabilidade do usuário" cobre quem baixa de fonte pública o que não devia; não cobre o app que embarca o mecanismo de contorno.

### 2. O custo prático é permanente, não pontual

- O ARL é cookie de sessão: expira, rotaciona, e o usuário teria que extraí-lo do navegador manualmente e recolocá-lo — o pior fluxo de configuração do app, oferecido justamente para o recurso mais arriscado.
- A derivação de chave já mudou mais de uma vez do lado do Deezer. Cada mudança quebra o download **em produção**, no instalador que o usuário já tem. Vira manutenção reativa sem prazo.
- Um ARL guardado é credencial de conta com acesso total. O `ConfigStore` é o "cofre do app" (`config.ts:6`), mas hoje guarda no `config.json` em claro — guardar credencial de terceiro ali é uma superfície nova que ninguém pediu.

### 3. O risco recai sobre a distribuição, não só sobre o código

O projeto publica instaladores em GitHub Releases. Repositórios cujo recurso central é contornar DRM de serviço de streaming são alvo conhecido de notificação e remoção. Perder o repositório e os releases custaria mais do que o recurso entrega.

### 4. O que se ganha é menor do que parece

O ganho real é qualidade: FLAC do Deezer contra ~256 kbps de origem YouTube. Para uso de DJ isso é uma diferença legítima — mas o app já tem dois caminhos para chegar lá sem cruzar a linha:

- **Bandcamp já é fonte suportada** e vende lossless. O que falta é tratar isso como caminho de primeira classe, não um efeito colateral.
- A aba **Organizar** já lida com biblioteca local: quem comprou o FLAC em qualquer loja tem o arquivo organizado e taguedo pelo app.

Ou seja, a lacuna é de *aquisição legítima de lossless*, e ela tem resposta melhor que decriptar catálogo licenciado.

## Alternativas consideradas

| Opção | Veredito |
|---|---|
| Implementar como está no design | Descartada — itens 1 a 3. |
| Implementar atrás de flag "avançado", desligada por padrão | Descartada. Flag não muda o que o binário contém nem quem distribui; só transfere a culpa para quem clica. |
| Deixar como plugin externo, fora do repo | Descartada por ora. Reduz o risco da distribuição, mas exige um sistema de plugins que não existe — custo alto para viabilizar justamente o que não se quer viabilizar. |
| **Descartar e melhorar o caminho legítimo de lossless** | **Recomendada.** |
| Adiar de novo | Descartada. Está "em avaliação" desde o design original; manter o "fase 2" no código é prometer o que não vem. |

## Se aprovado, o que muda no repositório

Nenhuma linha de comportamento — só as promessas:

1. `electron/sources/deezer.ts:12`: trocar "o download nativo (ARL + decrypt FLAC) permanece como possível fase 2" pela decisão e o motivo.
2. `docs/superpowers/specs/2026-07-19-downmusic-desktop-design.md`: linhas 27, 49 e 119-120 — marcar como descartado, com link para este documento (o design é registro histórico; não se apaga, anota-se).
3. `README.md:173-179`: o item "em aberto" vira decisão tomada, mantendo a explicação de por que o Deezer é fonte de metadados.

## Se recusado

Se o proprietário quiser seguir com a implementação, os pré-requisitos técnicos, na ordem, seriam: decidir o armazenamento seguro do ARL (o `config.json` em claro não serve); isolar a decriptação atrás da interface `Source` já existente, para que a falha fique contida; definir a política de atualização quando a derivação de chave mudar; e revisar a nota legal do README, que hoje afirma o contrário do que o app faria. Nesse caso as tasks de implementação seriam abertas a partir desta lista, e não de um card único.
