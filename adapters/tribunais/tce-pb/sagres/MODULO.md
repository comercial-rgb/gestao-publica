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

## Matriz de cobertura — as 13 entidades da vertical slice pedida

Legenda: ✅ implementada (golden + origem) · 🟡 origem parcial (falta campo estruturado) · ⛔ sem origem no modelo.
**Cobertura: 10 de 13 exportam** (Dotacao, Empenhos, Liquidacao, **Pagamentos**, **ReceitaOrcamentaria**,
CadastroContaBancaria, SaldoMensal, MovimentacaoEntreContasBancarias, **Retencao**, **DespesaExtra**).
As 3 restantes seguem 🟡 (ver linhas) — a S-fechamento levou a matriz de 8 para 10.

| # | Entidade SAGRES | Period. | Status | Origem real / o que falta |
|---|---|---|---|---|
| 4.4 | **Dotacao** | Mensal | ✅ | `FichaOrcamentaria` (+ funcao/subfuncao/programa/acao/naturezaDespesa/fonte). O `@@unique` do modelo é "uq_ficha_sagres" — a ficha FOI desenhada como esta tabela. |
| 4.8 | **Empenhos** | Diário | ✅ | `Empenho` + `Ficha`. `cpfOrdenador` **herdado do `EnteConfig`** (identificação do ente, S6 — gap quitado); `complementacaoHistorico` sem origem → espaços; empenho COM contrato é **recusado nomeando** (modalidade do processo não mapeada nesta fatia — proibido inventar). |
| 4.10 | **Liquidacao** | Diário | ✅ | `Liquidacao` + `Empenho` + `Ficha`. `TipoNotaFiscal` (§5.30) não é guardado no modelo → assume "02" (NF-e) quando há NF; `codAgrupamentoFolha` sem origem → espaços. |
| 4.1 | UnidadeOrcamentaria | Mensal | 🟡 | `UnidadeOrcamentaria` (codigo, descricao) existe, mas os obrigatórios `nomeSecretario`/`cpfSecretario`/`atoAdministrativo`/`tipoNaturezaJuridica` **não existem no modelo**. |
| 4.12 | **Pagamentos** | Diário | ✅ (S7) | `Pagamento` + `Liquidacao` + `Empenho` + `Ficha` + a conta pagadora (resolvida pelo CÓDIGO em `Pagamento.contaBancaria`, a tripla da S2). Só pagamentos genuínos (filtra `estornoDe`/`anulacaoParcialDe`). Os 5 campos do CRÉDITO ao credor (cheque/doc/banco-agência-conta) **sem origem** no modelo → espaços (opcionais). |
| 4.13 | EstornoPagamento | Diário | 🟡 | `Pagamento.estornoDe` existe, mas o campo **`motivo`** (Caractere 120, **obrigatório** no layout) **não tem coluna** no modelo. Reportado (PASSO 0): estruturar `motivo` é decisão do Winner — não implementado. |
| 4.14 | **Retencao** | Diário | ✅ (S-fechamento) | `MovimentoExtraorcamentario` (m07) com `tipo: INGRESSO` e `pagamentoId != null` — a retenção que NASCEU dentro de um pagamento (o mesmo filtro de `listarRetencoes`). Empenho/UO/exercício pelo drill `pagamento.liquidacao.empenho.ficha`. **`TipoRetencao` (§5.24) é DE-PARA EXPLÍCITO** (`DEPARA_TIPO_RETENCAO_SAGRES`): o rol do m07 é ABERTO (tabela, o ente cria tipos próprios) e o do layout é FECHADO (8 códigos) — um tipo sem mapeamento **falha nomeando**, nunca cai em "5 = Outras" por omissão. O teste IMPORTA o de-para e confere par a par contra o §5.24 transcrito à mão. A cadeia de setembro (TRAVA-2) e a folha importada (TRAVA-4) alimentam. |
| 4.16 | **ReceitaOrcamentaria** | Diária | ✅ (S7) | `ReceitaArrecadada` (m04) + natureza (STN 8) + fonte + co. `tipoLancamento` ← `tipo` (§5.18); `tipoReceita`="1" (§5.23, deduções não modeladas). **A conta arrecadadora é PARÂMETRO de exportação** (designação da UG): o modelo não amarra receita a conta — "a receita é do ENTE" (art. 167, IV), mesmo tratamento de `codUnidadeGestora`. |
| 4.20 | **DespesaExtra** | Diária | ✅ (S-fechamento) | `MovimentoExtraorcamentario` (m07) com `tipo: DISPENDIO` (o filtro de `listarDispendios`) + a conta bancária do movimento (tripla da S2) + `codContaContabil` da partida de **DÉBITO patrimonial** do lançamento (PCASP sem pontos = 9 dígitos). `codDespesaExtra` por de-para §5.3 (CAUÇÃO→20000018 Depósitos; demais→20000017 Consignações). **NUMERAÇÃO derivada**: o §4.20 tem `numero` na chave junto com `exercicio` e o m07 não tem coluna própria → numera 1..N no EXERCÍCIO na ordem determinística (data, id) e **só então** filtra o dia — numerar dentro do dia daria números repetidos no exercício. **3 GAPS NOMEADOS**: `cpfCnpjFornecedor` (o m07 guarda o consignatário como NOME livre, não documento) → zeros; `co` (o dispêndio extra não tem CO no modelo) → zeros; `codFonteRecurso` **é PARÂMETRO de exportação** — o layout exige 860/861/862/869 (STN, movimentação extraorçamentária), dimensão que o `FonteRecurso` do modelo (500, orçamentária) não representa; fonte fora do domínio é **recusada nomeando**. O vínculo com `ReceitaExtra` não é exigido nesta POC → **espaços (ASCII 32)**, como o layout manda. |
| 4.27 | ConciliacaoBancaria | Mensal | 🟡 | `VinculoConciliacao` (m09) existe; campos bancários faltando. |
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
