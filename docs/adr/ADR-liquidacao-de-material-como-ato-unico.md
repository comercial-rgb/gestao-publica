# ADR — A liquidação de material como ato único, com o gatilho pela natureza da operação

**Situação:** aceita, 2026-09-13 (sessão noturna V4, seção 6; achado A08 da auditoria de 77cbcc9).
Fecha a pendência `LIQUIDACAO-MATERIAL-ALMOXARIFADO` e incorpora o trabalho do stash `11b7892`.

## Contexto

O rol do M01 manda o elemento de material de consumo debitar ESTOQUE: a despesa não some, vira
ativo. O estoque tem dono (M10), e enquanto liquidar e dar entrada fossem atos separados, liquidar
material deixava o razão com estoque que nenhum movimento explicava — por isso a porta recusava
liquidar material. O stash trazia o ato composto, mas o gatilho era "existe uma `ClasseDeMaterial`
que declara a conta debitada": cadastro ausente desligava a integração em silêncio (A08), e o
critério fora escolhido para manter verdes doze suítes que liquidavam elemento 30 sem
almoxarifado — fixtures que não representavam operações válidas.

## Decisão

1. **O gatilho é a natureza da operação.** `elementoDebitaEstoque(codElemento)` — a resposta do rol
   do M01, a mesma que escolheu a perna de débito. Se o elemento liquida em estoque, a liquidação
   é de material. Ponto.
2. **A configuração é outra pergunta, e a ausência dela é impeditiva.** Cada entrada informa uma
   classe de material que tem de existir, estar ativa e declarar a conta que ESTA liquidação
   debitou; senão, `CONFIGURAÇÃO OBRIGATÓRIA AUSENTE`, nomeando o que falta, e nada é gravado.
   Sem o port do M10, `SEM O ALMOXARIFADO LIGADO`; sem entradas, `SEM A ENTRADA NO ALMOXARIFADO`.
3. **Restrição declarada:** uma liquidação é de UM elemento (empenho → ficha → natureza), logo é
   inteiramente de material ou não é. Documento fiscal misto são duas liquidações, uma por
   empenho; a soma das entradas fecha com a liquidação de material, nunca com o bruto do documento.
4. **Os fatos identificáveis do ato composto:** a liquidação (M05), a entrada contábil por classe
   (`MovimentoAlmoxarifado`, com `liquidacaoId`) e, quando informada, a entrada física
   (`MovimentoFisicoDeEstoque`, amarrada ao movimento contábil) — na mesma transação.
5. **Recebimento existente é relacionado, não duplicado.** A perna física pode citar
   `recebimentoDeItemId` (M11): mesmo material, e Σ(entradas vivas do recebimento) ≤ recebido
   (`MovimentoFisicoDeEstoque.recebimentoDeItemId`, coluna aditiva). Um recebimento que já gerou a
   sua entrada física pelo M11 não é consumido de novo. O documento fiscal continua no
   `RecebimentoDeOrdem.notaFiscal`; o atesto, na liquidação.
6. **Ordem dos locks:** o ato composto trava a liquidação uma vez (posto 6) antes das classes
   (posto 11); o composável `registrarEntradaAlmoxarifadoNaTx` recebe `liquidacaoJaTravada`.
7. **As fixtures passam a representar operações válidas:** suítes que liquidavam "material" com
   roteiro de serviço (M05 assinatura/consultas/anulação parcial, M09 lote, M12 superávit) passam
   ao elemento 39; o rollout do M16 liquida material COM a entrada, e o teste da UG da entrada
   passou a provar que a UG é a da liquidação.
8. **A tela** de liquidação abre as entradas quando o empenho é de material (`empenhoEhDeMaterial`
   pela natureza da lista de empenhos): uma linha por classe, com valor, perna física opcional e o
   recebimento a consumir.

## Consequências

- `registrarEntradaAlmoxarifado` (avulsa, após a liquidação) deixa de ter caso de uso na
  liquidação nova: o ato composto consome o valor liquidado inteiro. Continua servindo à
  anulação, ao ajuste e ao legado.
- A regressão é ampla por natureza (o gancho toca toda liquidação): a suíte completa roda uma
  vez nesta unidade, e o resultado fica registrado.
- Pendências: `LIQUIDACAO-MISTA-POR-DOCUMENTO` (o documento fiscal misto exige duas liquidações;
  uma tela que reparta o documento em dois empenhos é passo seguinte),
  `RECEBIMENTO-COM-ENTRADA-FISICA-PREVIA-NA-LIQUIDACAO` (o M11 que já deu entrada física não é
  religado à liquidação — a amarração contábil desse caso é passo seguinte).

## Provas

`modules/m10-patrimonial/m10-almoxarifado.test.ts` (t1, t2 com as recusas, t8/t8b cascata, t9/t10
elementos, t11 configuração impeditiva), `m10-estoque-fisico.test.ts` (o eixo físico no ato; o
recebimento consumido), `modules/m05-despesa/m05-anulacao-parcial.test.ts` (t6 cascata parcial),
`modules/m16-travamento/m16-rollout.test.ts` (UG da entrada = UG da liquidação; cascata na
anulação), e a suíte completa (`.registro-de-execucao/v4-liquidacao-test-tudo.txt`).
