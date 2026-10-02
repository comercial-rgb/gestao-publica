# M15 — SAGRES TXT (TCE-PB, Contabilidade 2026 v1.1)

**Requisito POC 12.1** (SAGRES Diário + Mensal) · **Missão POC, Sessão S1**. Status: **fatia vertical
verde** — registry declarativa + formatadores + serializador posicional + nomenclatura oficial +
golden byte a byte, com **Dotacao, Empenhos e Liquidacao** gerados de origem real.

Fonte oficial: `docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html` (sha256 no
`MANIFEST.json`). **Nada de campo, posição ou domínio foi inventado** (PATCH §4): cada posição foi
copiada do layout local; onde a origem falta, a entidade é declarada "não suportada" — nunca uma
linha vazia falsa.

## A máquina, não o arquivo

O que a S1 entrega é a MÁQUINA de gerar SAGRES, provada numa fatia:

- **`registry.ts`** — o layout é DADO, não código. Cada arquivo é uma lista de `CampoLayout` com a
  posição oficial (`posInicial`/`posFinal`), o tipo, a obrigatoriedade, a origem e a função de
  transformação (`extrair`). Um serializador só, guiado pela lista — nenhum `substring` espalhado. E a
  lista se **auto-valida** (`validarLayout`): posições têm de ser contíguas a partir de 1; um erro de
  transcrição do layout falha no teste, não no arquivo que vai ao TCE.
- **`formatadores.ts`** — a fronteira, num lugar só, fail-closed nomeando o campo: numérico (zeros à
  esquerda), valor (`13 int + vírgula + 2 dec`, a vírgula ocupa 1 posição), data (`ddmmaaaa` UTC),
  caractere (espaços à direita, **sem truncar em silêncio**), reservado (= ZEROS).
- **`serializarArquivo`** — devolve `Buffer` **UTF-8 sem BOM** (não `string`): a codificação é decisão
  da fronteira. É a diferença deliberada para o MANAD (M14), que é Latin-1 + delimitado por pipe. Aqui
  é largura fixa + UTF-8 (layout §3).
- **`gerador.ts`** — LEITURA PURA do Prisma (nenhum `create`/`update`/`aggregate`; teste-invariante
  prova) → DTO → arquivo, com nome oficial e contagem de registros.

## Fatos oficiais conferidos (0b — "o arquivo local manda", PATCH §4)

Conferidos contra o layout local, **sem divergência**: UTF-8; valor `0000002547625,21` (16 = 13+`,`+2);
data `ddmmaaaa`; campo não exigido = zeros (numérico) / espaços (caractere); nomenclatura
`[codUG][ddmmaaaa|mmaaaa|aaaa][Nome].txt` (os exemplos do §3 são os golden da nomenclatura). Domínios
copiados: TipoEmpenho §5.17 (1=Ordinário, **2=Estimativo, 3=Global** — a ordem não é alfabética),
NaturezaContratacao §5.19 (art. 141), TipoNotaFiscal §5.30 (00=Sem NF), Modalidades §6.2 (9=Sem Licitação).

## V23 (2026-09-29) — de 13 para 19 das 58 tabelas, e a reconciliação com o leiaute inteiro

O leiaute 2026 v1.1 tem **58 tabelas** (§4.1 a §4.59, sem §4.47); a cópia local é idêntica à online
(revisão #4, conferida em 29/09/2026 — não há versão 2026 mais nova). A contagem "13 de 13" abaixo era
da fatia pedida, não do leiaute. Hoje saem **19**; as outras 39 estão listadas, uma a uma, na matriz da
tela (`app/(areas)/integracoes/sagres/page.tsx`, `MATRIZ_SAGRES`).

| # | Tabela | O que é, e de onde vem |
|---|---|---|
| 4.9 | **Estornos** | A anulação (inteira ou parcial) do EMPENHO. Motivo = o histórico da linha de anulação, conferido na entrada (120, uma linha, sem aspas — regra geral do leiaute para caractere). `despesaLiquidada` = liquidado líquido do empenho na data do estorno > 0 (premissa a confirmar no validador). |
| 4.11 | **EstornoLiquidacao** | A anulação da LIQUIDAÇÃO. `Liquidacao.motivo` (coluna aditiva, V23): antes o serviço validava e descartava. O leiaute lista uma "reserva" sem posição depois de `valor`: o registro termina em 180, nenhuma posição inventada. |
| 4.15 | **EstornoRetencao** | O ESTORNO_INGRESSO da retenção, gerado pela anulação do pagamento. |
| 4.19 | **ReceitaExtra** | O INGRESSO (retenção e avulso). Arquivo OU recusa nomeada: depende do plano de contas do Tribunal importado para o exercício (`plano-do-tribunal.ts`). CPF/CNPJ: credor do empenho na retenção; `documentoDoContribuinte` (coluna aditiva) no avulso, exigido pela tela. |
| 4.21 | **EstornoReceitaExtra** | O ESTORNO_INGRESSO, apontando o número da receita extra estornada. Mesmo regime de recusa. |
| 4.22 | **EstornoDespesaExtra** | O ESTORNO_DISPENDIO, apontando o número da despesa extra estornada. Motivo conferido na entrada (255). |

**Defeitos encontrados e corrigidos na V23:** (1) os arquivos Empenhos e Liquidacao incluíam as LINHAS DE
ANULAÇÃO como documentos novos (o de Pagamentos já filtrava); (2) o EstornoPagamento exportava o registro
que DESFAZ uma anulação parcial como estorno de parcela — agora o dia é recusado nomeando, nos três níveis,
porque o leiaute não tem registro para "desfazer anulação"; (3) a numeração derivada dos movimentos
extraorçamentários seguia a DATA: um fato lançado depois com data anterior renumerava o que o tribunal já
recebera. Agora segue a ordem de gravação (`numeracaoNoExercicio`).

**O plano de contas do Tribunal (§5.28).** A planilha oficial tem `exige_retencao`/`exige_receita_extra`
por `ano_conta`. A página de 2026 aponta o `Pcasp_2025.xlsx`: sem linhas de 2026 e com as exigências de
2025 todas em 0 (2024: 42 exigem retenção, 68 exigem receita extra). Qual ano vale é decisão do ente, com
fundamento, na tela (ação IMPORTAR_PLANO_DO_TRIBUNAL; atualização de permissões v41). Com o plano, o
recolhimento numa conta que exige receita extra tem de compor UMA retenção ("não poderá existir uma despesa
extra para várias receitas") — senão recusa nomeando.

**Gaps que continuam, nomeados:** DespesaExtra manda `cpfCnpjFornecedor` e `co` zerados (obrigatórios; a
prévia acusa em Obrigatoriedade); a liquidação de restos a pagar sai no arquivo Liquidacao (o leiaute a quer
em LiquidacaoRestos §4.31, não gerado); as tabelas de restos (§4.28-4.34), PLOA, fornecedores, ordenador e
relacionamentos não são geradas.

## Matriz de cobertura — as 13 entidades da vertical slice pedida

Legenda: ✅ implementada (golden + origem) · 🟡 origem parcial (falta campo estruturado) · ⛔ sem origem no modelo.
**Cobertura: 13 de 13 exportam** (V21: + EstornoPagamento, ConciliacaoBancaria e UnidadeOrcamentaria) (Dotacao, Empenhos, Liquidacao, **Pagamentos**, **ReceitaOrcamentaria**,
CadastroContaBancaria, SaldoMensal, MovimentacaoEntreContasBancarias, **Retencao**, **DespesaExtra**).
As 3 restantes seguem 🟡 (ver linhas) — a S-fechamento levou a matriz de 8 para 10.

| # | Entidade SAGRES | Period. | Status | Origem real / o que falta |
|---|---|---|---|---|
| 4.4 | **Dotacao** | Mensal | ✅ | `FichaOrcamentaria` (+ funcao/subfuncao/programa/acao/naturezaDespesa/fonte). O `@@unique` do modelo é "uq_ficha_sagres" — a ficha FOI desenhada como esta tabela. |
| 4.8 | **Empenhos** | Diário | ✅ | `Empenho` + `Ficha`. `cpfOrdenador` **herdado do `EnteConfig`** (identificação do ente, S6 — gap quitado); `complementacaoHistorico` sem origem → espaços; empenho COM contrato é **recusado nomeando** (modalidade do processo não mapeada nesta fatia — proibido inventar). |
| 4.10 | **Liquidacao** | Diário | ✅ | `Liquidacao` + `Empenho` + `Ficha`. `TipoNotaFiscal` (§5.30) não é guardado no modelo → assume "02" (NF-e) quando há NF; `codAgrupamentoFolha` sem origem → espaços. |
| 4.1 | **UnidadeOrcamentaria** | Mensal | ✅ (V21) | `UnidadeOrcamentaria` (código, descrição) + a `DeclaracaoDaUnidadeOrcamentaria` **VIGENTE no fim do mês** (M02 V21, versionada: o secretário muda, e o mês passado sai com quem estava no cargo; vigência comparada por DIA CIVIL). Natureza jurídica e ato de nomeação por de-para EXAUSTIVO (§5.26, §5.14), conferidos contra as tabelas transcritas. Declarada em `/planejamento/unidades-orcamentarias`. Unidade sem declaração ou com descrição acima de 50: o arquivo fica FORA do pacote e a prévia mostra `Dados da unidade ausentes`. |
| 4.12 | **Pagamentos** | Diário | ✅ (S7) | `Pagamento` + `Liquidacao` + `Empenho` + `Ficha` + a conta pagadora (resolvida pelo CÓDIGO em `Pagamento.contaBancaria`, a tripla da S2). Só pagamentos genuínos (filtra `estornoDe`/`anulacaoParcialDe`). Os 5 campos do CRÉDITO ao credor (cheque/doc/banco-agência-conta) **sem origem** no modelo → espaços (opcionais). |
| 4.13 | **EstornoPagamento** | Diário | ✅ (V21) | O `Pagamento` de ANULAÇÃO — inteira (`estornoDeId`) e parcial (`anulacaoParcialDeId`) — + a parcela anulada + a cadeia até a ficha. **`motivo` ← `Pagamento.motivo`** (coluna nula aditiva, V21): a tela sempre exigiu o texto e o serviço o DESCARTAVA antes do banco; agora as duas anulações o gravam, conferido NA ENTRADA contra o que o leiaute aceita (até 120, sem aspas nem quebra de linha). Anulação sem motivo (anterior à V21) é **recusada nomeando** — nunca texto inventado. `despesaLiquidada`="S" (todo pagamento nasce de liquidação). |
| 4.14 | **Retencao** | Diário | ✅ (S-fechamento) | `MovimentoExtraorcamentario` (m07) com `tipo: INGRESSO` e `pagamentoId != null` — a retenção que NASCEU dentro de um pagamento (o mesmo filtro de `listarRetencoes`). Empenho/UO/exercício pelo drill `pagamento.liquidacao.empenho.ficha`. **`TipoRetencao` (§5.24) é DE-PARA EXPLÍCITO** (`DEPARA_TIPO_RETENCAO_SAGRES`): o rol do m07 é ABERTO (tabela, o ente cria tipos próprios) e o do layout é FECHADO (8 códigos) — um tipo sem mapeamento **falha nomeando**, nunca cai em "5 = Outras" por omissão. O teste IMPORTA o de-para e confere par a par contra o §5.24 transcrito à mão. A cadeia de setembro (TRAVA-2) e a folha importada (TRAVA-4) alimentam. |
| 4.16 | **ReceitaOrcamentaria** | Diária | ✅ (S7) | `ReceitaArrecadada` (m04) + natureza (STN 8) + fonte + co. `tipoLancamento` ← `tipo` (§5.18); `tipoReceita`="1" (§5.23, deduções não modeladas). **A conta arrecadadora é PARÂMETRO de exportação** (designação da UG): o modelo não amarra receita a conta — "a receita é do ENTE" (art. 167, IV), mesmo tratamento de `codUnidadeGestora`. |
| 4.20 | **DespesaExtra** | Diária | ✅ (S-fechamento) | `MovimentoExtraorcamentario` (m07) com `tipo: DISPENDIO` (o filtro de `listarDispendios`) + a conta bancária do movimento (tripla da S2) + `codContaContabil` da partida de **DÉBITO patrimonial** do lançamento (PCASP sem pontos = 9 dígitos). `codDespesaExtra` por de-para §5.3 (CAUÇÃO→20000018 Depósitos; demais→20000017 Consignações). **NUMERAÇÃO derivada**: o §4.20 tem `numero` na chave junto com `exercicio` e o m07 não tem coluna própria → numera 1..N no EXERCÍCIO na ordem determinística (data, id) e **só então** filtra o dia — numerar dentro do dia daria números repetidos no exercício. **3 GAPS NOMEADOS**: `cpfCnpjFornecedor` (o m07 guarda o consignatário como NOME livre, não documento) → zeros; `co` (o dispêndio extra não tem CO no modelo) → zeros; `codFonteRecurso` **é PARÂMETRO de exportação** — o layout exige 860/861/862/869 (STN, movimentação extraorçamentária), dimensão que o `FonteRecurso` do modelo (500, orçamentária) não representa; fonte fora do domínio é **recusada nomeando**. O vínculo com `ReceitaExtra` não é exigido nesta POC → **espaços (ASCII 32)**, como o layout manda. |
| 4.27 | **ConciliacaoBancaria** | Mensal | ✅ (V21) | ⚠️ **NÃO são os `VinculoConciliacao`** (o que já bateu): o registro é o saldo do extrato (§5.15 tipo 1) e as PENDÊNCIAS do fim do mês, do relatório derivado `conciliacaoBancaria` (M09) — extrato sem vínculo: entrada→4, saída→3; razão sem vínculo: entrada→2, saída→5 (`tipoConciliacaoDe`, conferido contra o §5.15 transcrito). Corte = o do SaldoMensal (fim do mês). Tripla da S2. `numero` sequencial por conta. Cheque/doc do débito sem origem → zeros/espaços. **Conta que não fecha ou sem conta contábil**: o arquivo fica FORA do pacote e a prévia mostra a recusa (`CONCILIACAO_NAO_FECHA`) — o pacote não cai por uma conta, e nada é omitido em silêncio. Medido: no banco de apresentação a `CC-500-01` não fecha (arrecadação sem conta, pendência já registrada). |
| 4.23 | **CadastroContaBancaria** | Diário | ✅ (S2) | `ContaBancaria` + a tripla `banco/agencia/digitoAgencia?/conta/digitoConta` (migração aditiva S2). `tipo`=1 (Conta Corrente, POC), `situacao`=1 (ativa), `cnpjGerencia`=EnteConfig. FAIL-CLOSED sem a tripla. |
| 4.26 | **SaldoMensal** | Mensal | ✅ (S2) | Tripla + saldo por **SUM** do `LancamentoExtrato` até o fim do mês, **sem coluna materializada** (calculado na exportação). |
| 4.59 | **MovimentacaoEntreContasBancarias** | Diária | ✅ (S-massa) | `TransferenciaEntreContas` (M09, TR 5.61) — o fato-transferência criado nesta sessão: entidade + serviço `transferirEntreContas` (censo `TRANSFERIR_ENTRE_CONTAS`) + contabilização pelo funil (D/C na conta contábil, balanceada). Larguras assimétricas do layout respeitadas. |

**A trava estrutural — destravada (S2 + S7 + S-fechamento).** A tripla `banco/agencia/digitoAgencia?/conta/digitoConta`
(migração aditiva S2) resolveu os campos bancários; a S7 fechou **Pagamentos** (a conta pagadora vem
pelo código em `Pagamento.contaBancaria`) e **ReceitaOrcamentaria** (a conta arrecadadora é **parâmetro
de exportação** — o modelo não amarra receita a conta, art. 167); a **S-fechamento** fechou **Retencao**
(o de-para §5.24 explícito) e **DespesaExtra** (numeração derivada + fonte STN como parâmetro), levando
a matriz de 8 para 10. Os 3 🟡 que restam têm gaps NOMEADOS, não estruturais-de-conta:
`EstornoPagamento` falta a coluna `motivo` (obrigatória no layout); `UnidadeOrcamentaria` falta
`nomeSecretario`/`cpfSecretario`/`atoAdministrativo`/`tipoNaturezaJuridica`; `ConciliacaoBancaria` fica
para sessão própria. Estruturar `motivo`, o cadastro do secretário, ou vincular receita↔conta por-guia é
**decisão do Winner** — não do executor.

**Os dois estornos que faltam (§4.15 EstornoRetencao, §4.22 EstornoDespesaExtra).** O m07 já modela
`ESTORNO_INGRESSO`/`ESTORNO_DISPENDIO` **desde o dia 1** (simetria deliberada) — o dado existe; falta só
o layout + exporter, que são gêmeos dos dois desta sessão. Não implementados: fora do timebox da
S-fechamento, e a POC não produz massa de estorno extraorçamentário. Nomeado, não escondido.

## Massa POC (S-massa) — subir e passear

`prisma/seed/sagres-poc.ts` planta a história encadeada (UG sintética "PREFEITURA MODELO — POC" →
dotação → empenho → liquidação → pagamento → 2 contas → transferência → extrato BB via
`importarExtratoBb` → conciliação → **receita arrecadada + 2º mês**). Determinístico e idempotente
(guarda pela UG POC). **Não cria usuários** (m16-rollout t5): a identidade que assina (`criadoPor`,
default `admin@cg.pb.gov.br`) tem de pré-existir. Roteiro no dev limpo:

```
1. npx prisma migrate deploy         # aplica as migrations (tripla de conta, transferência, ação)
2. npm run seed:bootstrap            # cria admin@cg.pb.gov.br — a identidade que a massa assina
3. npm run seed:sagres-poc           # a massa POC encadeada (ampliada)
4. npm run dev                       # sobe o app
5. abra /integracoes/sagres?dia=2026-07-14   # prévia dos 8 arquivos, validações e download do pacote
```

**Massa ampliada (S7, F3) — dias/meses elegíveis** (determinística, idempotente, mesmos serviços reais):

| Dia | Movimento (arquivos com registro) |
|---|---|
| **05/07/2026** | ReceitaOrcamentaria (arrecadação 80k) |
| **10/07/2026** | Empenhos (empenho nº1, 50k) |
| **12/07/2026** | Liquidacao (nº1) |
| **14/07/2026** | Pagamentos (nº1, 50k, conta A) |
| **15/07/2026** | MovimentacaoEntreContas (transferência 2,5k) |
| **05/08/2026** | Empenhos (nº2, 20k — 2º mês) |
| **07/08/2026** | Liquidacao (nº2) |
| **08/08/2026** | Pagamentos (nº2, 20k — 2º mês) |
| mensal 07/2026 · 08/2026 | Dotacao (exercício), SaldoMensal, CadastroContaBancaria |

Variante com **erro proposital** (DIRETIVA §5): `semearSagresPoc(prisma, { comErroProposital: true })`
usa um subelemento fora do domínio, que o validador da S2 rejeita nomeando o campo — o teste
`sagres-poc-erro.test.ts` prova a rejeição e a correção (subelemento válido → revalidação limpa).

## Hierarquia de evidência (PATCH §6)

O que esta sessão prova, e o que **não** prova:

| Evidência | Provado aqui? |
|---|---|
| Golden byte a byte | ✅ Dotacao/Empenhos/Liquidacao — determinismo local da formatação |
| Gerador de origem real | ✅ Dotacao (banco de teste → arquivo) |
| Validador local | (S2) |
| Correspondência com o layout oficial | ✅ posições/domínios copiados + auto-validação da registry |
| **Validação no ambiente TCE** | ❌ — exige o validador/ambiente oficial |
| **Recibo do TCE** | ❌ — exige transmissão real (Captura 2.0, S3) |

⚠️ **Golden ≠ aceitação pelo TCE.** A UI e os relatórios (S2/S6) nunca apresentam prova local como
conformidade externa.

## Premissas nomeadas (a confirmar no validador/aceite oficial)

- **Quebra de linha = CRLF.** O layout v1.1 local não especifica CR/LF vs LF; CRLF é a convenção dos
  textos fiscais do TCE-PB e do MANAD. Escolha documentada.
- **Posição = caractere, não byte.** Os campos são preenchidos por CONTAGEM DE CARACTERES e o arquivo é
  UTF-8; um acento (2 bytes) faz o byte-offset divergir do caractere-offset. Os golden usam conteúdo
  ASCII (offset inequívoco); um teste dedicado prova o encoding UTF-8 (ç = `C3 A7`, nunca Latin-1 `E7`).
  A confirmar se o parser do TCE conta byte ou caractere.
- **codUnidadeGestora é parâmetro de exportação** (a UG selecionada) — não há UG de 6 dígitos no
  modelo (`Orgao` tem 2, `UnidadeOrcamentaria` 5, `EnteConfig` traz IBGE/CNPJ).
- **numEmpenho/numLiquidacao** são `Numérico` no SAGRES; o modelo guarda `String` — a numeração da UG
  precisa ser numérica (a massa POC usa numeração numérica).
  - V22 (2026-09-28): os formulários de empenho, liquidação, pagamento e anulação passaram a sugerir
    número só com dígitos (antes o exemplo era `2026NE000001`, que este leiaute recusa). A regra NÃO é
    imposta no domínio.
  - `FOLHA-NUMERO-DE-EMPENHO-FORA-DO-SAGRES` — **RESOLVIDA na V22 rodada 7 (2026-09-29).** O texto determinístico (`FP/2026-05/MAT-A`, `FE/…-E1`,
  `…-AL{n}-…`, `…-AE{n}-…`) deixou de ser gravado como número e passou a ser a CHAVE de uma reserva
  (`NumeroReservado`, `m05-despesa/numerador.ts`): mesma chave, mesmo número, numérico, o próximo do
  exercício acima do maior número numérico já usado na espécie (inclusive o digitado). A retomada
  continua achando o documento pelo número; o documento gravado ANTES continua reconhecido pelo texto.
  O reconhecimento das anulações do ajuste dos encargos lê a apuração da IDENTIDADE (o texto gravado
  antes, ou a chave da reserva), não mais do número. Provas: `m05-numerador.test.ts` (7, com
  concorrência e o oitavo dígito) e `m33-encargos.test.ts` (resposta perdida com número reservado);
  mutação — sem a trava (2 vermelhos), número novo a cada retomada (3), reconhecimento sem a reserva (1).
  O número DIGITADO não passa pelo numerador (a tela orienta), mas NÃO pode ser um número reservado: o
  M05 recusa a quem não traz a chave (`exigirUsoDoNumero`) — sem isso a retomada reconheceria o empenho
  alheio como seu (achado da auditoria dos invariantes; mutação: 3 vermelhos).
    Histórico: o empenho e a liquidação da folha nasciam com
    número gerado pelo M33 (`FP/2026-08/DEMO-0001`, `FE/2026-08/ENC-RGPS-PATR-E1`), e o pacote diário
    do dia da folha é RECUSADO nomeando o campo. Resolver pede decisão de numeração (sequência numérica
    por UG e exercício, compartilhada com o empenho digitado), não ajuste de formato.

## S2 — validação, pacote e tela

- **Validação (`validacao.ts`)** — três camadas, cada violação nomeia arquivo/linha/campo: (1)
  **obrigatoriedade** guiada pela registry (campo `obrigatorio` com origem vazia); (2) **domínio**
  contra os xlsx oficiais (`dominios-2026v11.ts`, gerado de `subelementos_2026`/`relacao_elemento_
  subelemento_2026`/`relacionamento_fonterecursos_co_2026`); (3) **integridade referencial** entre
  arquivos do pacote (a Liquidacao referencia um Empenho que TEM de existir no pacote).
- **Pacote (`pacote.ts`)** — ZIP determinístico (PKWARE, data fixa 1980, entradas ordenadas, sem
  dependência externa) + **manifesto com SHA-256 por arquivo e hash do pacote**. Mesma massa = mesmo
  byte = mesmo hash. O manifesto declara `natureza: FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE` —
  nunca recibo/protocolo (DIRETIVA §7).
- **Tela (`app/(areas)/integracoes/sagres`)** — prévia monoespaçada com **régua de posições**, lista
  de validações (o erro aponta o campo), download do pacote (rota `/download`), e o **banner honesto**
  (DIRETIVA §7): "Formato oficial gerado e validado localmente" / "**Transmissão externa não
  realizada**". A tela consome a **porta** `lib/portas/sagres` — nunca o domínio direto (grep
  trivalente). A UG/competência POC ficam em `lib/portas/sagres-poc.ts` (fictícias).

## Cruzamento PCASP (0d) — `Pcasp_2025.xlsx` × seed M01

As 25 contas `CONTAS_FIXTURE_A_CONFIRMAR` (seed M01), cruzadas com o PCASP oficial (7.982 contas):
**17 confirmadas · 8 divergentes · 0 ausentes.** Classificação das 8 (regra da DIRETIVA: RÓTULO adota,
ESTRUTURAL não altera e reporta):

| code9 | seed | oficial | classe | ação |
|---|---|---|---|---|
| 111120000 | Bancos Conta Movimento | …EM MOEDA NACIONAL - INTRA OFSS | ESTRUTURAL | reportar |
| 115110000 | Almoxarifado | MERCADORIAS PARA REVENDA OU DOAÇÃO | ESTRUTURAL | reportar |
| 221000000 | Obrigações a Longo Prazo | OBRIG. TRABALHISTAS… A LONGO PRAZO | ESTRUTURAL | reportar |
| 221110000 | Dívida Fundada Interna | PESSOAL A PAGAR - CONSOLIDAÇÃO | ESTRUTURAL | reportar |
| 300000000 | Variações Patrimoniais Diminutivas | VARIAÇÃO PATRIMONIAL DIMINUTIVA | RÓTULO | **não auto-aplicado**: o label é referenciado por `m12-dvp.test.ts` — adotar rippla no DVP; decisão do Winner |
| 332110100 | Serviços de Terceiros — PJ | DIARIAS PESSOAL CIVIL | ESTRUTURAL | reportar |
| 411210100 | VPA — Impostos sobre o Patrimônio | IMPOSTO S/ PROPRIEDADE TERRITORIAL RURAL | ESTRUTURAL | reportar |
| 622120000 | Crédito Reservado | CREDITO INDISPONÍVEL | ESTRUTURAL | reportar |

**Seed NÃO alterado** — 7 estruturais (o código oficial denota outra conta que a intenção do seed) +
1 rótulo com ripple no DVP. Divergência de plano de contas é decisão do Winner.

## V25 — fornecedores e relacionamentos (27 → 32 de 58)

| Tabela | Periodicidade | Origem |
|---|---|---|
| §4.24 RelacionamentoCCorrenteFontePagadora | diária | o rol de fontes de cada conta (`FonteDaContaBancaria`), ou a fonte padrão quando o rol está vazio — a mesma regra do guard do movimento. Fonte do FUNDEB (540–543) em mais de uma conta: recusa nomeada. |
| §4.35 Fornecedores | diária | credores dos empenhos do dia e credores cuja pessoa ganhou versão nova no dia; nome da versão vigente no fim do dia. Credor sem cadastro de pessoa: recusa nomeada (o nome é obrigatório e não se inventa). |
| §4.37 RelacionamentoEmpenhoObra | mensal | empenhos genuínos do mês com obra; a UG da obra é a própria. |
| §4.46 RelacionamentoEmpenhoNaturezaContratacao | mensal | todos os empenhos genuínos do mês. |
| §4.58 RelacionamentoLiquidacaoPagamento | mensal | pagamentos genuínos do mês, inclusive os de restos a pagar. |

O número do empenho e o da obra saem **numéricos** nas §4.37 e §4.46, embora a tabela os grafe
"Caractere": são chaves para o Empenhos (§4.8), onde são numéricos.

`gerarArquivosDeRelacionamentos` gera o grupo; a recusa de um arquivo (regra `RELACIONAMENTO_FORA_DO_PACOTE`)
deixa só ele fora do pacote. `m15-leiaute-oficial.test.ts` confere **todos** os leiautes contra o HTML
oficial com um leitor próprio do teste: as 32 tabelas batem em todas as posições.

Ficam para decisão do ente: as tabelas do projeto da LOA (§4.41 a §4.45: o que é o "projeto"), §4.39 (o
código de agrupamento da folha é o do Tribunal ou o interno?), §4.36 Ordenador e §4.48 ResponsavelSiafic
(sem cadastro), §4.2/§4.3 Programas e Ação (sem tela de cadastro), §4.7 ReceitaPrevista (subtipo da
dedução), §4.5/§4.6/§4.49 (ofício e protocolo do TCE não modelados), §4.25 SaldoInicial (definição de
saldo conciliado), §4.38 (modalidade e número do Tramita), §4.17/§4.18 (transferência entre UGs não existe).

## V26 — o que dependia de decisão (32 → 50 de 58; as cinco do projeto da LOA, §4.41 a §4.45, entraram no fim da V26)

As decisões vieram da ordem `docs/lotes/V26-decisoes-da-v25.md`. Todas as tabelas novas estão em
`gerador-v26.ts` (grupo `gerarArquivosDaV26`; a recusa de um arquivo, regra `CADASTRO_FORA_DO_PACOTE`, deixa só
ele fora do pacote).

| Tabela | Periodicidade | Origem e decisão |
|---|---|---|
| §4.2 Programas, §4.3 Acao | mensal | `DeclaracaoDoPrograma`/`DeclaracaoDaAcao`, versionadas por vigência; objetivo da Agenda 2030 (§5.27) declarado, nunca inferido do nome; o 99 só no programa 5000. |
| §4.5 AtualizacaoOrcamentaria | diária | itens dos decretos de crédito do dia civil; tipo de alteração = tipo da lei × origem do recurso (§5.13); o item que anula é 11; superávit exige fonte do exercício anterior. 5, 12/13 e 14/15 (ofício) não saem daqui. |
| §4.6 DecretoseOficios | diária | decretos do dia com o PDF anexado ao decreto (M22, conferido pelo hash na leitura); o PDF viaja no pacote como `Decreto{UG}{NNNNNAAAA}.pdf`. Sem PDF: recusa nomeando o decreto. |
| §4.8 (CPF do ordenador e licitação) | diária | o ordenador designado na data, por escopo (UO sobre o ente); a modalidade e o número da licitação do Tramita (Lei 14.133: 21–25, 30, 32–35). |
| §4.10 (codAgrupamentoFolha) | diária | o código do sistema da folha na liquidação, quando há (`AgrupamentoDaFolhaNaLiquidacao`). |
| §4.17 TransfRecebida, §4.18 TransfConcedida | diária | `TransferenciaEntreUgs` em que esta UG é o lado escriturado aqui; estorno com tipo de lançamento 2 no dia dele; tipo pelo §5.25. |
| §4.23 ReceitaPrevista | anual (janeiro) | linha da LOA com o subtipo da dedução (3/4/5) em `DetalheDaReceitaPrevista`. |
| §4.25 SaldoInicial | anual (janeiro) | saldo contábil sustentado pela conciliação de dezembro encerrada. |
| §4.36 Ordenador, §4.48 ResponsavelSiafic | diária / anual | designações por ato e vigência; o responsável declarado. |
| §4.38 RelacionamentoEmpenhoLicitacao | mensal | empenhos de contrato com a licitação do Tramita. |
| §4.39 RelacionamentoLiquidacaoCodigoAgrupamentoFolhaPagamento | mensal | um para um; liquidação de folha sem código: recusa nomeando. O código é do sistema da folha, nunca gerado aqui. |
| §4.49 NormasOrcamentarias | diária | leis do dia com o protocolo do banco de legislação do TCE-PB (000000/00); lei publicada sem protocolo: recusa nomeando. |

**A unidade gestora da remessa** deixou de ser só o código de demonstração: a tela e o download usam a UG
cadastrada (Contabilidade › Unidades gestoras) e escriturada aqui; com mais de uma, a tela oferece a escolha. Sem
cadastro, o pacote sai com o código de demonstração e a tela diz isso. O CNPJ é o da UG ou o da entidade que a
escritura; sem nenhum, recusa.

**Defeito no instrumento, corrigido:** o leitor do HTML do `m15-leiaute-oficial.test.ts` cortava a seção no próximo
`<h4`; a §4.18 não tem `<h4` antes da §4.19 e lia os campos da ReceitaExtra. Agora corta também no título da
seção seguinte; as 45 tabelas batem, e uma posição mutada na §4.17/§4.18 fica vermelha.

Ficam fora (pendência nomeada): as tabelas do projeto da LOA (§4.41 a §4.45 — o projeto encaminhado não tem os
valores guardados; reconstruí-lo da LOA aprovada é proibido pela ordem); o ofício (tipos 14/15, sem autorização
localizada para Esperança); a realocação no §4.5 (12/13); o recorte de TODOS os arquivos por UG (o razão não tem
a dimensão da entidade: com mais de uma UG escriturada aqui, só as transferências e o agrupamento da folha são
recortados por UG).

## V27 — frota, farmácia, realocação e o pacote de conferência (50 → 58 de 58 com gerador)

- §4.50 a §4.55 (frota) e §4.56/§4.57 (farmácia pública): `gerador-frota-farmacia.ts`, com os dados de M36 e M37.
  - Cadastro (dono, locador, veículo, máquina) no mês do registro, ou no do início se for depois.
  - Situação de todo bem, todo mês: a do dia 1 e cada mudança.
  - Abastecimento somado por combustível, com o registro zerado no combustível principal.
  - Farmácias ativas no fim do mês e o último informe de estoque.
  - Os 8 leiautes conferem com o HTML oficial (58/58).
- §4.5 tipos 12/13 e §4.6: o ato de realocação (M03, desde a V21) passou a ir ao Tribunal.
  - A perna que cede é a origem (12), a que recebe é o destino (13).
  - O decreto vai com o PDF anexado ao ato.
  - O desfazimento no dia deixa o arquivo fora, nomeando o ato.
  - Ofício (14/15) **não**: a Lei 613/2025 de Esperança autoriza a realocação só "mediante Decreto". Memória em
    `docs/operacao/OFICIOS-14-15-E-REALOCACAO-ESPERANCA.md`.
- §4.49: a lei registrada antes do comprovante do Tribunal (com o PDF, sem protocolo) é nomeada até o protocolo
  chegar (`ProtocoloDaNormaNoTce`).
- §4.38/§4.8: o número da licitação pode vir da lista dos dados abertos do Tribunal.
  - O processo escolhe a licitação compatível e grava as 9 posições (NNNNNAAAA), a UG, a modalidade e o protocolo
    "Doc. N/AA".
  - O número digitado como o Tribunal publica (NNNNN/AAAA) também é aceito.
- **Pacote de conferência:** com qualquer pendência na prévia, o download sai `conferencia-incompleto_…zip`, com
  `incompleto: true` e a lista `foraDoPacote` no manifesto. Sem pendência, o pacote de sempre.
- **"58 de 58" é cobertura de GERADOR, não remessa real.** As tabelas da frota e da farmácia dependem do cadastro do
  ente. O veículo depende ainda do número do modelo, da tabela do Tribunal que não está nos documentos obtidos.
