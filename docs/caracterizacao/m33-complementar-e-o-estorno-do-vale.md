# Caracterização — o motor da complementar e o estorno do vale

> Medida na V13, antes de ampliar, como o regime de **profundidade** exige.
> **Nada construído.** Este documento existe porque a caracterização
> **desmentiu a decisão de produto** que já havia sido tomada, e o custo medido
> tem de sobreviver à sessão que o mediu.

## O caso

O vale foi pago, a folha mensal o abateu e **fechou**, e só então o pagamento do
vale foi anulado.

⚠️ **A direção da dívida é o contrário da intuição, e ela decide tudo.** Medido em
`m33-adiantamento-salarial-pago.test.ts`: a mensal descontou 1.200,00 por um
adiantamento cujo pagamento líquido hoje é **zero**. O servidor ficou com
1.500,00 e tinha direito a 2.700,00 — **o ente deve a ele**, não o contrário.

## O que o motor faz hoje

`calcularContrachequeComplementar` (`modules/m33-folha/complementar.ts:235-404`),
domínio puro. O delta é `correto − apurado` por rubrica
(`complementar.ts:262-264`), sobre a **união** das rubricas do recálculo com as
que só existem no já apurado (`complementar.ts:236-238`) — deliberado, para não
perder rubrica paga e removida do cadastro.

**Um único sítio decide sobre sinal**, e ele não olha o tipo:
`complementar.ts:266` — `if (delta.lt(0)) throw new DiferencaNegativaNaComplementarError(...)`.
O `rubrica.tipo` é lido **dentro da mensagem** (`complementar.ts:184-193`), nunca
na condição. Para PROVENTO, negativo significa "apurado a mais" e recusar é
certo. Para DESCONTO, negativo significa "retido a mais" e **o ente é quem
deve** — a guarda distingue os dois na redação e não na decisão.

Procurado: não há segundo sítio. O `delta.isZero()` de `complementar.ts:283`
decide "não gera linha", não "recusa".

## Os dois bloqueios que a tabela de custo não via

### 1. A complementar nunca chega àquele motor, neste caso

`calcularFolha` da complementar primeiro recalcula o "correto" por
`contrachequesMensaisDaCompetencia` (`servico.ts:504`, chamada em `:1009`), que
chama `abatimentoDoAdiantamentoSalarialNaCompetencia`
(`adiantamento-salarial-servico.ts:350`) no padrão `APLICAR` — e essa função
lança `ADIANTAMENTO-SALARIAL-NAO-PAGO` (`:505-520`) **antes de qualquer delta
ser calculado**.

Medido em `m33-adiantamento-salarial-pago.test.ts:601-614`: a recusa que aparece
é essa, não `COMPLEMENTAR-COM-DIFERENCA-NEGATIVA`, e `calculoDaFolha.count === 0`.

**Consequência:** mexer só em `complementar.ts` NÃO resolve o caso. Exigiria uma
segunda mudança coordenada em `adiantamento-salarial-servico.ts`, para que o
recálculo do "correto" **dentro de um contexto de complementar** trate o critério
não satisfeito como `ABATSAL = 0` em vez de abortar. A função hoje
(`:350-353`) não recebe nenhum parâmetro que diga "isto é recálculo para
correção": a distinção mensal-original vs. correto-da-complementar **não existe
no código**.

### 2. Desconto nunca vira empenho, por invariante

`apropriarFolha` só busca linhas `tipo: "PROVENTO"` (`apropriacao.ts:471`,
`:538`), e o cadastro do grupo de empenho **recusa** qualquer rubrica que não
seja provento — `RUBRICA-DE-DESCONTO-NO-GRUPO` (`apropriacao.ts:270-278`):
*"desconto não é despesa orçamentária, é retenção do pagamento"*.

Se o delta negativo em desconto passasse a ser aceito, o líquido do contracheque
subiria e **nenhum empenho corresponderia** a essa alta: o documento diria que o
ente deve mais dinheiro do que qualquer despesa orçamentária registra, e nada
acusaria. É o padrão de defeito que este módulo já nomeou três vezes.

## O que o banco e a aritmética já aceitam

- **Não há CHECK de sinal** em `LinhaDoContracheque`
  (`prisma/schema/m33-folha.prisma:562-586`; procurado em todas as migrations).
  Existe `Contracheque_liquido_chk` (identidade contábil) e existem
  `valor > 0` em OUTRAS tabelas (`LancamentoDaFolha`, `EmpenhoDaFolha`) — o banco
  aceitaria hoje um valor negativo aqui, se algum caminho o produzisse.
- **A aritmética suporta** sem virar provento por acidente: `descontos` soma as
  linhas com `tipo === "DESCONTO"` (`complementar.ts:318`); um valor negativo
  **reduz** `descontos` e, como `liquido = proventos − descontos`
  (`:319`), **aumenta** o líquido. A classificação por tipo não muda.
- **A tela renderiza, e é aí que mente**: `ValorMonetario`
  (`components/ui/ValorMonetario.tsx:18-33`) sabe pintar negativo em vermelho,
  mas a linha apareceria sob o cabeçalho **"Desconto"** com **"-R$ 1.200,00"** —
  número negativo numa coluna cujo nome diz o oposto do que ele significa. Dois
  consumidores idênticos: `contracheque/[vinculoId]/page.tsx:137` e o espelho do
  portal do servidor, `:57`. Nem a tela nem `memoria-do-contracheque.ts` têm
  bloco que explique esse caso.

## O custo dos dois caminhos, medido

| | (a) DESCONTO negativo | (b) PROVENTO de restituição |
|---|---|---|
| `complementar.ts` | muda a condição de sinal | **não toca** |
| `adiantamento-salarial-servico.ts` | **muda também** (bloqueio anterior) | **não toca** |
| Apropriação | abre exceção a `RUBRICA-DE-DESCONTO-NO-GRUPO`, ou aceita que a diferença nunca vira despesa | **empenha pelo caminho normal** |
| Tela e documento | linha negativa sob rótulo "Desconto", sem teste protegendo | valores todos positivos |
| Recálculo do vale | necessário | **desnecessário**: a restituição é FATO NOVO |
| O que falta decidir | relaxar uma invariante contábil | qual rubrica/natureza carrega, e a incidência |

**(b) é menor**, medido pelos consumidores. Precedente estrutural já assentado no
módulo: `RESTITUICAO_A_PROVIDENCIAR` (`prisma/schema/m33-encargos.prisma:234`),
com o comentário na linha 240 — **"O VALOR É SEMPRE POSITIVO"**.

⚠️ E o precedente traz o aviso junto: `RESTITUICAO-DOS-ENCARGOS-SEM-ATO`
(`MODULO.md:313-314`) registra que, mesmo no caso análogo já construído, o **ato
de restituir não existe** — só o registro de que ela é devida. (b) precisa da
rubrica de provento (natureza `VALOR_INFORMADO`, que já existe e aceita
lançamento), de um `LancamentoDaFolha` na competência, e da decisão normativa de
**incidência**: a folha original já reteve sobre o valor cheio, então incidir de
novo tributaria duas vezes o mesmo rendimento. Pendência análoga a
`INCIDENCIA-NO-ADIANTAMENTO-SALARIAL` (`MODULO.md:1137-1142`).

## O que precisa continuar funcionando, e quem protege

| O que | Teste |
|---|---|
| PROVENTO negativo continua recusando | `m33-complementar-dominio.test.ts:183-221` |
| A recusa de DESCONTO negativo, hoje | `m33-complementar-dominio.test.ts:223-246` — afirma **texto literal** (`toContain("RETIDOS A MAIS")`), e o comentário da linha 224 diz que o caso **não é redundante**: foi escrito de propósito |
| Delta zero não vira linha | `m33-complementar.test.ts:241-266`, `m33-complementar-dominio.test.ts:167-179` |
| `VINCULO-APURADO-FORA-DO-RECALCULO` | `m33-complementar.test.ts:313-325` — guarda que **nasceu inerte** e só o teste a pegou |
| `COMPLEMENTAR-RUBRICA-SEM-IDENTIDADE` | `m33-complementar-dominio.test.ts:272-284` |
| O bloqueio de `ADIANTAMENTO-SALARIAL-NAO-PAGO` | `m33-adiantamento-salarial-pago.test.ts:548-615` — hoje rotulado **CARACTERIZAÇÃO**, e o único lugar que acusaria um conserto **incompleto** de (a) |

**Onde NÃO há teste, e é onde o conserto doeria:** nenhuma suíte exercita linha
de desconto negativa na tela nem no portal do servidor; e nada confere o que a
apropriação faz quando o líquido fica maior que o bruto por causa dela. São
exatamente os dois pontos onde uma correção apressada produziria *"documento
mostra dívida do ente, empenho não muda, ninguém acusa"*.

## Sobre a versão do motor

`VERSAO_DO_MOTOR_COMPLEMENTAR` (`complementar.ts:78`) marca corte prospectivo
quando a **redação** da memória muda. A mudança de (a) não altera a redação de
nenhum contracheque hoje gravado — ela faz um caso que hoje **nunca produz
registro** passar a produzir um. Nenhum sha256 antigo em risco. Se a memória
ganhar um bloco novo explicando "esta linha é devolução", **aí** é o momento do
bump.
