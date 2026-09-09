# M13 — transparência (bloco 1)

Datasets abertos de **despesa** (TR 7.3) e **receita** (TR 7.4), a reexposição do **§3º**
da ordem cronológica (TR 5.34) e o **export CSV** (TR 7.48, RFC 4180).

## Requisitos TR cobertos

- **7.3.1** grão = FASE (empenho, liquidação, pagamento) · **7.3.2** classificação completa
- **7.3.4** beneficiário (máscara e exceção) · **7.3.6** processo licitatório · **7.3.7** descrição
- **7.4.1** previsão · **7.4.2** agregação (sigilo fiscal) · **7.4.3** arrecadado líquido · **7.4.4** classificação
- **5.34** ordem cronológica publicada · **7.48** dado aberto legível por máquina

## Invariantes (NUNCA violar)

- **ZERO ESCRITA e ZERO ARITMÉTICA — e o `t8` roda o grep.** Um portal que *grava* pode
  corromper o que publica; um portal que *soma* pode divergir do balanço — e é o portal
  que o cidadão lê. Cada número daqui tem uma **função de dono** nomeada no comentário.
  Provado por mutação: uma linha com `.update(` no módulo derruba o teste.
- **`Decimal` serializa como STRING.** Um `float` não representa 2.500,10 exatamente, e
  um dataset público que arredonda é um dataset que mente.
- **Corte pela data do FATO** (`data` do empenho/liquidação/pagamento; `dataArrecadacao`),
  nunca `criadoEm`. Um empenho de março digitado em maio pertence a março.

## O beneficiário — LGPD × 7.3.4

`identificarDocumento` é **fail-closed de exposição: na dúvida, não expõe.**

| Caso | Saída |
|---|---|
| CNPJ (14 dígitos) | **INTEIRO**, formatado. Quem contrata com o ente aceita o escrutínio (STF, ARE 652.777). |
| CPF (11 dígitos) | `***.NNN.NNN-**` — dá para **conferir**, não dá para **descobrir**. |
| Qualquer outra coisa | **OMITIDO**, com motivo `DOCUMENTO_INVALIDO`. |
| Elemento de folha/previdência | **OMITIDO**, com motivo `FOLHA_OU_PREVIDENCIA`. |

O motivo é **estruturado**, nunca um campo vazio mudo: um vazio silencioso não se
distingue de um bug.

**⚠️ Não validamos os dígitos verificadores, e isso é deliberado.** Um DV inválido é erro
de **cadastro** (M05); escondê-lo aqui — no portal — faria o portal mentir para tapar o
buraco do cadastro. O guard do DV, se vier, nasce **onde o dado entra**.

### A exceção do 7.3.4 é por ELEMENTO, e o Record é EXAUSTIVO

`EXPOSICAO_DO_BENEFICIARIO` cobre os **78 elementos oficiais** de
`prisma/seed/dados/elementos.ts` (Anexo II da Portaria 163/2001), e
`conferirCoberturaDosElementos()` prova que não falta nenhum nem sobra um inventado. Um
elemento novo **não passa** sem que alguém decida se o beneficiário dele é identificado.

**O critério, escrito:** OMITE quando o crédito é **pessoal ou previdenciário** — o
beneficiário é pessoa física na condição de **servidor**, **pensionista** ou **segurado**
(elementos 01, 03, 04, 05, 09, 11, 12, 16, 17, 53, 54, 55, 56, 57, 58). IDENTIFICA em
todo o resto — **inclusive** quando o pagamento vai a pessoa física que *prestou serviço*
(elemento 36): aí ela não é servidor, é **fornecedor**. IDENTIFICA é o **default**: a
transparência é a regra; a omissão, a exceção nomeada.

**⚠️ PENDÊNCIA DECLARADA — os benefícios ASSISTENCIAIS ficam FORA da exceção.** Os
elementos **06** (Benefício Mensal ao Deficiente e ao Idoso), **08** (Outros Benefícios
Assistenciais), **18** (Auxílio Financeiro a Estudantes) e **48** (Outros Auxílios
Financeiros a Pessoas Físicas) pagam pessoas físicas que **não** são servidores nem
previdenciários — e a exceção que o TR 7.3.4 nomeia é *"folha ou previdência"*, não
*"assistência"*. Alargá-la por conta própria seria **esconder pagamento público com base
numa regra que ninguém escreveu**. Eles saem identificados (com o CPF mascarado, como
todos). Se o jurídico do ente decidir que a LGPD os alcança, a mudança é **uma linha** no
Record — e é assim que tem de ser.

**⚠️ O NOME do beneficiário só existe no CONTRATO.** `Empenho` tem `credorCpfCnpj` e **não
tem** `credorNome`. Empenho avulso (diária, sentença, folha) sai com o documento e sem
nome — inventar um "nome do credor" a partir do documento seria fabricar dado. Quando o
cadastro de credores existir, o dataset o absorve sem mudar de forma.

## A receita é AGREGADA, e a garantia é o TIPO

Publicar *"IPTU, 12.345,67, 03/03, guia 987"* é publicar **quem pagou** para quem tem o
cadastro imobiliário ao lado. O sigilo fiscal (CTN, art. 198) não é dispensado pela
transparência — por isso `LinhaReceita` **não tem campo de contribuinte**, e o teste prova
isso em **tempo de compilação** (`@ts-expect-error`), não em runtime.

**⚠️ O grão é natureza × fonte — o CO ficou de fora, e o motivo é aritmético.** A
`ReceitaPrevista` (M02) **não tem** código de acompanhamento: a LOA prevê por natureza e
fonte. Uma linha por CO repetiria a **mesma** previsão em várias linhas, e a coluna
passaria a mentir na primeira vez que alguém a somasse. **Um dataset aberto não publica
número que estoura ao ser somado.** Quando a `ReceitaPrevista` ganhar CO, o grão desce.

## A ordem cronológica é IDENTIDADE, não cópia

`datasetOrdemCronologica === ordemCronologicaMensal` — a **mesma função**, e o `t7` prova
por referência. Não há wrapper que "adapte" nada, porque **o wrapper é o lugar onde a
cópia começa**: um dia alguém filtra ali, ou reordena, e o portal passa a publicar uma
fila que não é a fila.

**⚠️ ACHADO DO PASSO 0: o dataset do §3º carrega `credorCpfCnpj` EM CLARO.** Faz sentido —
ele é um relatório **interno** (o TCE e o controle interno precisam do documento inteiro
para apurar preterição, §2º). Reexpor esse objeto **cru** num portal público vazaria CPF
de pessoa física, em lote, ordenado por quem ainda não recebeu. A fronteira é aqui: **quem
publica, mascara** (`serializarOrdemCronologica`). O relatório do M12 continua íntegro para
quem tem direito a ele.

## CSV — RFC 4180

Separador vírgula; terminador **CRLF** (§2.1), inclusive na última linha; campo com
vírgula, aspas ou quebra vai **entre aspas** (§2.6); aspas internas **duplicadas** (§2.7);
cabeçalho na primeira linha (§2.3). `null` vira campo **vazio** — num CSV, vazio é a
ausência, e a string `"null"` seria um dado.

**⚠️ SEM BOM, e é uma escolha.** O BOM UTF-8 faz o Excel abrir com acento certo — e faz
**todo** parser conforme (`csv-parse`, `pandas`, `awk`) ver três bytes de lixo no primeiro
cabeçalho. O TR 7.48 pede **dado aberto, legível por máquina**; o conforto do Excel é
problema de quem exporta para o Excel, não do dado.

**Uma verdade, dois formatos:** o JSON e o CSV saem do **mesmo objeto serializado**. Um
`paraCsv` que reformatasse números ou datas teria a própria noção de "2.500,00", e os dois
divergiriam no dia em que alguém mexesse num só.

## Arquivos deste módulo

- `dominio.ts` — máscara, `EXPOSICAO_DO_BENEFICIARIO` (78 elementos), `paraCsv`. **Sem I/O.**
- `datasets.ts` — `datasetDespesa`, `datasetReceita`. **Só leitura.**
- `ordem-cronologica.ts` — a reexposição do §3º + a serialização que mascara.
- `m13.test.ts` — 10 testes (inclui o **grep do módulo**, t8).

## Estendido nos donos (extensão, nunca reimplementação)

- `m04-receita/consultas.ts` → `arrecadadoPorNaturezaFonte` (outro **grão**, o mesmo
  `SINAL_RECEITA_REALIZADA`).
- `m02-planejamento/consultas.ts` → `previsaoPorNaturezaFonte` (outro **grão**, o mesmo
  `SINAL_PREVISAO`).

## Fora de escopo aqui (bloco 2)

- Portal/HTTP, paginação, cache, versionamento de dataset.
- Datasets de **licitações e contratos** (7.5), **pessoal** (7.6), **diárias**.
- **Emendas parlamentares**, **obras**, **convênios**.

---

# 7.15 — Publicação: PDF, CSV e a área pública

O eixo de publicação (TR 7.5 / 7.48 / 5.120) ganhou três peças, todas server-side e testadas.

## PDF — headless print, sem porta a abrir

`lib/pdf/documento.ts` (PURO: dados → HTML A4 + hash SHA-256 do conteúdo + rodapé) e
`lib/pdf/gerar.ts` (puppeteer: HTML → PDF). ⚠️ **O Chromium NUNCA navega uma rota**: recebe o HTML
por `setContent`, montado dos MESMOS motores via porta. Não há request HTTP ao app — logo não há
sessão-de-serviço, header interno nem bypass: **não existe porta a abrir**. A autenticação vive na
camada que dispara o download. O hash é do CONTEÚDO (estável); os bytes carregam a hora e variam. O
rodapé imprime a honestidade: `documento não assinado digitalmente — assinatura ICP-Brasil pendente`.

## CSV — o CSV é a tela (TR 7.48)

`lib/csv/csv.ts` (`paraCsv`): separador `;`, decimal vírgula, UTF-8 com BOM, CRLF — o Excel BR abre
certo. As linhas/colunas são as MESMAS da tabela (montadas server-side dos mesmos dados, não uma
segunda consulta). Nas quatro listas de execução (empenhos, liquidações, pagamentos, arrecadações).

## Área pública — fora do shell autenticado

`/transparencia/demonstrativos` mora em `app/transparencia/**`, sob o layout RAIZ (como `/login`),
então NÃO passa por `exigirSessao`: relatório oficial é público por lei (LC 131/2009). A separação é
ESTRUTURAL (onde o arquivo mora), não um `if` — e por isso **NÃO se mexeu no middleware**: neste
projeto o middleware não controla sessão (só põe `x-pathname`); quem barra é o layout de `(areas)`.
A rota de PDF pública (`.../pdf/route.ts`, nodejs) gera sob demanda.

## As pendências nomeadas (dado/decisão do Winner)

| Pendência | O que falta | A sessão futura |
|---|---|---|
| **DOCUMENTO-PUBLICADO-PERSISTIDO** | schema: `DocumentoPublicado { arquivo/blob, hash, publicadoPor, publicadoEm, slug, período }` | a publicação FORMAL exige guarda (o TCE confere o que foi publicado, quando, por quem). Hoje o PDF é gerado sob demanda e não guardado — reprodutível pelo hash, mas não arquivado. Migração + serviço `publicar` (ato do censo) + a área pública passa a listar o que foi PUBLICADO, não o que é gerável. |
| **ICP-BRASIL-CERTIFICADO** | o e-CNPJ / certificado ICP-Brasil do ente (dado do Winner) | assinar o PDF (PAdES) troca a frase de honestidade pela assinatura real. Precisa do certificado + a lib de assinatura. |
| **PORTAL-EXTERNO-LAYOUT** | layout/credenciais do portal real do ente | a integração 7.1 (empurrar os demonstrativos ao portal oficial) espera o layout e o acesso — hoje a área pública é interna ao app. |
| **IDENTIFICACAO-DO-ENTE** | cadastro do ente (nome, CNPJ, brasão) | o nome do ente no cabeçalho do PDF é constante (`Campina Grande`); vira leitura quando o cadastro existir. |

## O que ficou representativo (e o padrão que estende)

O PDF está wired no RREO Anexo 1 (o `DEMONSTRATIVOS_PUBLICOS`/`lista-publica.ts` é o registro; cada
novo demonstrativo é um `montar(params) → DocumentoPdf`). O botão "Baixar PDF" das páginas de
relatório aponta a MESMA rota pública (o dado é público). RGF e livros seguem o mesmo builder —
acrescentar cada um é um item no registro, sem motor novo.
