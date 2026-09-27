import type { Money } from "../../packages/contracts/index.js";
import type { Subsistema, TipoPartida } from "../../packages/ledger/index.js";

/**
 * OS ROTEIROS CONTÁBEIS DA EXECUÇÃO — a política, num dono só.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO CONSERTA ═══
 * Até a 7.1, o roteiro (quais contas o lançamento debita e credita) era
 * responsabilidade do CHAMADOR, e nenhum código de produção montava um: `ContaPcasp`
 * nascia em 55 arquivos, todos `*.test.ts`. Cada fixture escolhia as contas que
 * queria — e escolheu errado em 12 delas (ver GUARD-NATUREZA-INFORMACAO no
 * MODULO.md). As telas de escrita ficaram bloqueadas porque não havia de onde tirar
 * um roteiro que não fosse inventado na borda.
 *
 * ═══ ⚠️ POR QUE HARDCODED, E NÃO TABELA (decisão registrada) ═══
 * Este repositório trata roteiro como DADO: existem 9 tabelas (`RoteiroOrcamentario`,
 * `RoteiroPatrimonial`, `RoteiroAlmoxarifado`, `RoteiroDivida`, …), cada uma com FK
 * para `ContaPcasp`. O natural seria uma 10ª. Mas a tabela exige SCHEMA e MIGRAÇÃO, e
 * a 7.2 é aditiva. A decisão foi: a política da execução nasce em CÓDIGO, aqui, e
 * migra para tabela quando o PCASP completo chegar. Está registrado no MODULO.md do
 * M01 como `ROTEIRO-HARDCODED-VS-TABELA`.
 *
 * ═══ AS CONTAS ═══
 * Classe 6 e 5: extrato oficial STN/MCASP. Patrimoniais: o inventário das fixtures
 * (pendência `MAPA-ELEMENTO-CONTA` — o xlsx PCASP Estendido confirma ou corrige).
 */

/** A perna de um roteiro. Estruturalmente igual à de M04/M05/M07/M08. */
export interface PernaRoteiro {
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
  /**
   * ⚠️ O VALOR PRÓPRIO DA PERNA — opcional, e quase nenhum roteiro o usa (V16/C30).
   *
   * A regra de sempre continua: `comporPartidas(valor, roteiro)` aplica UM valor a TODAS as
   * pernas, porque no caso geral cada subsistema tem um débito e um crédito do mesmo montante.
   *
   * Ele existe para o fato que REPARTE o total entre pernas do mesmo lado — hoje, um só: a
   * arrecadação distribuída entre fontes, em que a classe 7 tem uma perna por natureza de fonte,
   * cada uma com a sua fatia, contra uma perna de classe 8 com o total.
   *
   * ⚠️ E ELE NÃO AFROUXA NADA: quem declara valor próprio continua passando pelo
   * `validarLancamento`, que exige ΣDÉBITO == ΣCRÉDITO DENTRO de cada subsistema. Fatias que não
   * somam o total derrubam o lançamento — é daí, e não de uma conferência escrita à mão, que vem
   * a garantia de que as parcelas somam a guia.
   */
  readonly valor?: Money;
}
export type RoteiroContabil = readonly PernaRoteiro[];

// ── CONTROLE ORÇAMENTÁRIO DA DESPESA (classe 6 — extrato oficial) ────────────

export const CONTA_CREDITO_DISPONIVEL = "6.2.2.1.1.00.00";
/** Nasce no empenho e morre na liquidação. */
export const CONTA_CREDITO_EMPENHADO_A_LIQUIDAR = "6.2.2.1.3.01.00";
/**
 * ⚠️ DORMENTE — `SEM-ESTAGIO-EM-LIQUIDACAO`. O MCASP dá o estágio "em liquidação"
 * (6.2.2.1.3.02) como de uso FACULTATIVO, e este sistema não o usa: a liquidação vai
 * direto de "a liquidar" para "liquidado a pagar". A constante existe para que a
 * decisão fique VISÍVEL — um dia alguém vai perguntar por que o .02 não aparece, e a
 * resposta tem de estar onde ele procurar, não só num MODULO.md.
 */
export const CONTA_CREDITO_EMPENHADO_EM_LIQUIDACAO = "6.2.2.1.3.02.00";
export const CONTA_CREDITO_LIQUIDADO_A_PAGAR = "6.2.2.1.3.03.00";
export const CONTA_CREDITO_LIQUIDADO_PAGO = "6.2.2.1.3.04.00";

// ── CONTROLE DA APROVAÇÃO / DA RECEITA (classes 5 e 6) ───────────────────────

/**
 * ⚠️ REPONTADA EM 2026-09-18, CONTRA A FONTE, E A MEDIÇÃO ESTÁ AQUI. Esta constante apontava para
 * `5.2.2.1.1.00.00`, que no PCASP oficial é **SINTÉTICA** — e conta sintética não recebe partida
 * (`INVARIANTE 5` do adapter). O efeito era um instalador que não termina: `seed:roteiro-orc`
 * recusava, nomeando, e a instalação limpa parava ali. Medido em banco novo e exclusivo:
 * `migrate exit=0`, `SQL manual exit=0`, `pcasp-oficial exit=0`, `roteiro exit=1`.
 *
 * **Fonte:** `Pcasp_2025.xlsx` do TCE-PB (`prisma/seed/oficial/procedencia.ts`), sha256
 * `52ae7c7336b27a5c2056f7e36947be8ca8c995b6fae74c891d88cab74c517ffb`, publicado em 2024-10-29,
 * o mesmo arquivo que `seed:pcasp-oficial` carrega. Ele particiona `5.2.2.1.1 DOTAÇÃO INICIAL`
 * em três ramos analíticos, e a partição é que decide — não a semelhança de nome:
 *
 *   · `5.2.2.1.1.01.00` CREDITO INICIAL            ← o crédito que a LOA fixa. É este.
 *   · `5.2.2.1.1.02.01` ANTECIPAÇÃO - LDO           (e `.02.09`, a anulação dela)
 *   · `5.2.2.1.1.99.00` DOTAÇÃO INICIAL - OUTRAS
 *
 * O movimento `DOTACAO_INICIAL` deste sistema é a LOA fixando a dotação — o crédito inicial. Os
 * outros dois ramos são fatos diferentes: antecipação pela LDO, e residual.
 */
export const CONTA_DOTACAO_INICIAL = "5.2.2.1.1.01.00";

/**
 * O CRÉDITO ADICIONAL SUPLEMENTAR — e a pendência `ROTEIRO-CREDITO-ADICIONAL-POR-TIPO`
 * deixou de ser "uma conta que falta" para ser o que sempre foi: uma PARTIÇÃO (V11 V7.1).
 *
 * **Fonte:** `Pcasp_2025.xlsx` do TCE-PB (`prisma/seed/oficial/procedencia.ts`), sha256
 * `52ae7c7336b27a5c2056f7e36947be8ca8c995b6fae74c891d88cab74c517ffb`. O nome da sintética
 * diz sozinho o que ela faz:
 *
 *   `5.2.2.1.2.00.00` **DOTAÇÃO ADICIONAL POR TIPO DE CREDITO**
 *     · `.01.00`  CREDITO ADICIONAL - SUPLEMENTAR              ← analítica ÚNICA. É esta.
 *     · `.02.00`  CREDITO ADICIONAL - ESPECIAL        (sintética, três filhas)
 *     · `.03.00`  CREDITO ADICIONAL - EXTRAORDINÁRIO  (sintética, três filhas)
 *
 * A suplementar tem UMA analítica sob si, e o sistema sabe quando o crédito é suplementar
 * (`LeiCredito.tipoCredito`). Não há o que escolher: a partição do plano e o discriminador
 * do domínio são o mesmo eixo. `RoteiroOrcamentario` ganhou `tipoCredito` para carregá-lo.
 */
export const CONTA_CREDITO_ADICIONAL_SUPLEMENTAR = "5.2.2.1.2.01.00";

/**
 * ⚠️ SINTÉTICAS DE PROPÓSITO — e o que falta aqui NÃO é uma conta, é um FATO que o sistema
 * não registra. Pendência `CREDITO-ESPECIAL-ABERTO-OU-REABERTO`.
 *
 * O plano parte cada um destes dois ramos em TRÊS analíticas, e as três são o mesmo eixo:
 *
 *   `.02.01` CRÉDITOS ESPECIAIS ABERTOS          `.03.01` CRÉDITOS EXTRAORDINÁRIOS ABERTOS
 *   `.02.02` CRÉDITOS ESPECIAIS REABERTOS        `.03.02` ... REABERTOS
 *   `.02.03` ... REABERTOS - SUPLEMENTAÇÃO       `.03.03` ... REABERTOS - SUPLEMENTAÇÃO
 *
 * ABERTO é o crédito autorizado e aberto NESTE exercício; REABERTO é o saldo de um crédito
 * especial ou extraordinário aberto nos últimos quatro meses do exercício anterior, que a
 * CF art. 167 § 2º manda reabrir no seguinte pelo saldo remanescente. São exercícios
 * diferentes, e a distinção não é de nome: é de qual ato deu origem ao crédito.
 *
 * ⚠️ O SISTEMA PASSOU A SABER QUAL É (V11 V8.6 e V8.8) — e esta é a parte da pendência que
 * fechou. O vínculo que se dizia ausente existia: o decreto aponta para a lei, e cada um tem o
 * seu ano. `classificarAbertura` (M03) lê a diferença, `criarDecreto` recusa o que o § 2º não
 * alcança, e `RoteiroOrcamentario.abertura` carrega a dimensão até o razão — o reaberto e o
 * aberto não entram mais na mesma conta.
 *
 * ⚠️ O QUE CONTINUA SENDO DECISÃO DO ENTE, e por isso estas constantes continuam apontando para
 * a SINTÉTICA: qual analítica recebe um REABERTO. São duas — `.02` REABERTOS e `.03` REABERTOS -
 * SUPLEMENTAÇÃO —, e a diferença entre elas é de classificação contábil, não de fato derivável.
 * Pendência `REABERTO-COM-SUPLEMENTACAO-NAO-DISTINGUIDO`. O seed segue recusando e IMPRIMINDO as
 * candidatas lidas do plano que está no banco; quem decide publica em
 * `/contabilidade/roteiros-orcamentarios`, com fundamento e data.
 *
 * Estas constantes existem apontando para a SINTÉTICA justamente para que o seed recuse e
 * IMPRIMA as três candidatas lidas do plano que está no banco — quem for decidir precisa
 * vê-las da fonte, não de uma lista escrita num comentário.
 */
export const CONTA_CREDITO_ADICIONAL_ESPECIAL = "5.2.2.1.2.02.00";
export const CONTA_CREDITO_ADICIONAL_EXTRAORDINARIO = "5.2.2.1.2.03.00";

/**
 * ⚠️ SINTÉTICA, E AGORA SÓ A ANULAÇÃO A USA. Pendência renomeada em V7.1 para
 * `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`, porque a causa é outra: não é
 * partição por tipo de crédito, é HOMONÍMIA no plano.
 *
 * `ANULACAO_CREDITO` é a perna do decreto que REDUZ a dotação de outra ficha. No plano,
 * redução de dotação não mora em `5.2.2.1.2` — mora em dois lugares, com o MESMO nome e a
 * MESMA natureza (CREDORA, analítica):
 *
 *   `5.2.2.1.3.09.00` (-) CANCELAMENTO DE DOTAÇÕES
 *       sob `5.2.2.1.3 DOTAÇÃO ADICIONAL POR FONTE`, irmã de `.03.00 ANULAÇÃO DE DOTAÇÃO`
 *       (a FONTE do crédito novo: "esta suplementação sai da anulação de outra dotação").
 *   `5.2.2.1.9.04.00` (-) CANCELAMENTO DE DOTAÇÕES
 *       sob `5.2.2.1.9 CANCELAMENTO/REMANEJAMENTO DE DOTAÇÃO`, ao lado das alterações de
 *       QDD e de LOA, cada uma com o seu par ACRÉSCIMO / (-) REDUÇÃO.
 *
 * As duas leituras cabem: a anulação é a fonte do crédito adicional (ramo `.3`) e é também
 * um cancelamento de dotação (ramo `.9`). Decidir por semelhança de nome é escolher entre
 * dois nomes IDÊNTICOS — não há o que comparar. Falta o roteiro do MCASP ou a decisão
 * contábil do ente, com fundamento.
 *
 * ⚠️ E HÁ UMA PERGUNTA MAIOR ATRÁS DESTA, que também fica registrada: `5.2.2.1.2` (por tipo
 * de crédito) e `5.2.2.1.3` (por fonte) são IRMÃS sob `5.2.2.1 DOTAÇÃO ORÇAMENTÁRIA`. Se o
 * mesmo crédito fosse lançado nas duas, o total de `5.2.2.1` contaria o dobro; se for
 * lançado só numa, a outra visão fica vazia em qualquer demonstrativo que a leia. Qual das
 * duas o ente adota — ou como as concilia — é decisão do mesmo tamanho, e este sistema hoje
 * só lança na `.2`. Pendência `DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`.
 */
export const CONTA_DOTACAO_ADICIONAL = "5.2.2.1.2.00.00";

/**
 * ═══ O RAMO IRMÃO: `5.2.2.1.3 DOTAÇÃO ADICIONAL POR FONTE` (V11 V8.9) ═══
 *
 * **Fonte:** o mesmo `Pcasp_2025.xlsx` do TCE-PB, lido do arquivo e não digitado de memória:
 *
 *   `5.2.2.1.3.00.00` DOTAÇÃO ADICIONAL POR FONTE            (sintética)
 *     · `.01.00`  SUPERAVIT FINANCEIRO DE EXERCÍCIO ANTERIOR
 *     · `.02.00`  EXCESSO DE ARRECADAÇÃO
 *     · `.03.00`  ANULAÇÃO DE DOTAÇÃO
 *     · `.04.00`  OPERAÇÕES DE CRÉDITO
 *     · `.05.00`  RESERVA DE CONTINGENCIA        ← o domínio não tem esta origem
 *     · `.06.00`  DOTAÇÃO TRANSFERIDA            ← nem esta
 *     · `.07.00`  RECURSOS SEM DESPESAS CORRESPONDENTES   ← nem esta
 *     · `.09.00`  (-) CANCELAMENTO DE DOTAÇÕES
 *     · `.99.00`  VALOR GLOBAL DA DOTAÇÃO ADICIONAL POR FONTE
 *
 * ⚠️ AS QUATRO PRIMEIRAS SÃO AS QUATRO DO `OrigemRecurso`, UMA A UMA, e não é semelhança de
 * nome: é o MESMO eixo. O domínio já pergunta de onde veio o dinheiro do decreto, e o plano
 * parte o ramo exatamente por essa pergunta. É o mesmo argumento que tornou a conta do crédito
 * suplementar semeável em V7.1 — uma analítica, um discriminador, nada a escolher.
 *
 * ⚠️ O QUE **NÃO** SE SEMEIA AQUI É O EIXO. Lançar na `.2` e na `.3` creditaria o crédito
 * disponível duas vezes pelo mesmo decreto; qual dos dois ramos o ente adota é decisão dele, e
 * ela mora em `PoliticaDaDotacaoAdicional`. Sem política, vale o que sempre valeu: a `.2`.
 *
 * ⚠️ AS TRÊS ORIGENS SEM PAR NO DOMÍNIO FICAM DE FORA, e isso é registro, não esquecimento:
 * reserva de contingência, dotação transferida e recursos sem despesa correspondente são fatos
 * que este sistema ainda não representa. Inventar um valor de enum para elas seria inventar o
 * fato junto.
 */
export const CONTA_DOTACAO_POR_FONTE_SUPERAVIT = "5.2.2.1.3.01.00";
export const CONTA_DOTACAO_POR_FONTE_EXCESSO = "5.2.2.1.3.02.00";
export const CONTA_DOTACAO_POR_FONTE_ANULACAO = "5.2.2.1.3.03.00";
export const CONTA_DOTACAO_POR_FONTE_OPERACAO_CREDITO = "5.2.2.1.3.04.00";

/**
 * ⚠️ SINTÉTICA NO PLANO OFICIAL, E O NOME DIVERGE. Pendência `ROTEIRO-RESERVA-SEM-CONTA`.
 *
 * Este sistema chama `6.2.2.1.2.00.00` de "crédito reservado"; no PCASP ela é **CREDITO
 * INDISPONÍVEL**, e as suas analíticas são `.01.00` BLOQUEIO DE CREDITO, `.02.00` CREDITO
 * PRE-EMPENHADO e `.99.00` OUTRAS INDISPONIBILIDADES. Qual delas corresponde à RESERVA de dotação
 * deste sistema é decisão contábil do ente, com fundamento — não inferência por nome parecido.
 * Enquanto não houver, `RESERVA` e `RESERVA_LIBERADA` ficam sem roteiro, e o domínio recusa o
 * movimento, que é o estado correto para uma classificação que ninguém decidiu.
 */
export const CONTA_CREDITO_RESERVADO = "6.2.2.1.2.00.00";
export const CONTA_RECEITA_A_REALIZAR = "6.2.1.1.0.00.00";
export const CONTA_RECEITA_REALIZADA = "6.2.1.2.0.00.00";

// ── PATRIMONIAIS (inventário das fixtures — MAPA-ELEMENTO-CONTA) ─────────────

// ── CONTROLE DA DISPONIBILIDADE DE RECURSOS — a DDR (classes 7 e 8) ──────────
//
// ═══ ⚠️ O QUE A DDR RESPONDE, E POR QUE ELA NÃO É "MAIS UM CONTROLE" ═══
// O controle orçamentário (classe 6) responde "quanto do CRÉDITO já foi usado". A DDR
// responde outra coisa: "quanto DINHEIRO daquela fonte ainda está livre". São perguntas
// diferentes e podem divergir — há crédito disponível sem dinheiro (a receita não
// entrou) e dinheiro sem crédito (arrecadou-se além do previsto). É a DDR que impede
// empenhar contra dinheiro que não existe, e é ela que o RGF Anexo 5 publica.
//
// ═══ O PAR 7 × 8 ═══
// A classe 7 é o total sob controle; a 8 detalha o ESTADO em que ele está. Por isso só
// a arrecadação toca a 7 (é ela que traz dinheiro novo): D 7.2.1.1 / C 8.2.1.1.1. Dali
// em diante o dinheiro só muda de estado, dentro da 8:
//
//   arrecadação  D 7.2.1.1     / C 8.2.1.1.1     (entrou, e está disponível)
//   empenho      D 8.2.1.1.1   / C 8.2.1.1.2.01  (disponível → comprometido por empenho)
//   liquidação   D 8.2.1.1.2.01/ C 8.2.1.1.3.01  (→ comprometido por liquidação)
//   pagamento    D 8.2.1.1.3.01/ C 8.2.1.1.4.01  (→ utilizado: saiu)
//
// Cada crédito é o débito do seguinte — a mesma disciplina da cadeia orçamentária. E o
// saldo de cada fonte é `disponível − comprometida − utilizada` (ver `saldoDdrPorFonte`).
//
// ⚠️ A ANULAÇÃO NÃO TEM ROTEIRO PRÓPRIO: `gerarEstorno` inverte TODAS as pernas, então
// anular um empenho devolve a DDR ao disponível sozinho. Um roteiro de anulação seria a
// chance de ele divergir do fato que nega.

/**
 * Classe 7 — o par DEVEDOR. Só a arrecadação o move.
 *
 * ⚠️ RESOLVIDA EM 2026-09-24 (V11 V9.3). A pendência `CONTROLE-DDR-POR-NATUREZA-DA-FONTE`
 * viveu aqui como `CONTA_CONTROLE_DDR = "7.2.1.1.0.00.00"` — o nó SINTÉTICO de nível 4. Em
 * instalação limpa com o plano oficial, `roteiroArrecadacao` recusava
 * ("Conta sintética não recebe partida: 7.2.1.1.0.00.00") e **não havia arrecadação
 * nenhuma**, o que deixou três passos da jornada J9 não executados.
 *
 * ⚠️ E A MEDIÇÃO DIZ QUE A CAUSA ERA **FALTA DE DIMENSÃO NO SELETOR**, não conta errada. O
 * `Pcasp_2025.xlsx` do TCE-PB (sha256 `52ae7c73…`, o mesmo de `seed:pcasp-oficial`) particiona
 * `7.2.1.1 CONTROLE DA DISPONIBILIDADE DE RECURSOS` em CINCO analíticas — e a partição é pela
 * NATUREZA DA FONTE, não pelo estado do dinheiro:
 *
 *   · `7.2.1.1.1.00.00` RECURSOS ORDINÁRIOS
 *   · `7.2.1.1.2.00.00` RECURSOS VINCULADOS
 *   · `7.2.1.1.3.00.00` RECURSOS EXTRAORÇAMENTÁRIOS
 *   · `7.2.1.1.4.00.00` RECURSOS PARA COMPENSAÇÃO FINANCEIRA
 *   · `7.2.1.1.9.00.00` OUTROS CONTROLES DA DISPONIBILIDADE DE RECURSOS
 *
 * Nenhuma delas tem filha: são folhas, e o pai `7.2.1.1.0.00.00` é sintético por CONSTRUÇÃO,
 * não por carga malfeita. O roteiro não tinha por onde escolher entre as cinco porque não
 * recebia a fonte — embora o sistema a conheça em toda a cadeia (`saldoDdrPorFonte` agrupa
 * por `fonteId`). Escolher uma delas por conveniência — apontar a constante para ORDINÁRIOS —
 * classificaria saúde, educação e FUNDEB como ordinários, e o erro sairia no RGF Anexo 5 e na
 * remessa, não aqui. Por isso a perna passou a ser RESOLVIDA, e o discriminador é a natureza.
 *
 * ⚠️ O QUE ESTE MAPA **NÃO** DECIDE é de que natureza é a fonte 500 do município. Isso o plano
 * não diz e o corpus oficial deste repositório também não — é ATO DO ENTE, e mora em
 * `DeParaFonteNaturezaDdr`, fail-closed, declarado por tela com fundamento. Aqui só está a
 * correspondência natureza → conta, que é leitura do plano e não tem o que escolher.
 */
export type NaturezaDaFonteDdr =
  | "ORDINARIOS"
  | "VINCULADOS"
  | "EXTRAORCAMENTARIOS"
  | "COMPENSACAO_FINANCEIRA"
  | "OUTROS";

export const CONTA_CONTROLE_DDR_POR_NATUREZA: Readonly<Record<NaturezaDaFonteDdr, string>> = {
  ORDINARIOS: "7.2.1.1.1.00.00",
  VINCULADOS: "7.2.1.1.2.00.00",
  EXTRAORCAMENTARIOS: "7.2.1.1.3.00.00",
  COMPENSACAO_FINANCEIRA: "7.2.1.1.4.00.00",
  OUTROS: "7.2.1.1.9.00.00",
};

/** As cinco, para quem precisa do rol inteiro (seed do plano mínimo, fixtures, consultas). */
export const CONTAS_CONTROLE_DDR: readonly string[] = Object.values(
  CONTA_CONTROLE_DDR_POR_NATUREZA
);

/**
 * A conta de classe 7 da natureza — FAIL-CLOSED. Uma natureza fora do rol não vira conta:
 * vira recusa com o rol dito, porque o rol É a partição do plano.
 */
export function contaDeControleDaDdr(natureza: NaturezaDaFonteDdr): string {
  const conta = CONTA_CONTROLE_DDR_POR_NATUREZA[natureza];
  if (conta === undefined) {
    throw new Error(
      `NATUREZA DE FONTE DESCONHECIDA: "${String(natureza)}". O PCASP particiona 7.2.1.1 em ` +
        `${Object.keys(CONTA_CONTROLE_DDR_POR_NATUREZA).join(", ")} — e só nessas. Nada foi gravado.`
    );
  }
  return conta;
}

/**
 * ⚠️ REPONTADA EM 2026-09-19, DENTRO DO MESMO RAMO, E A MEDIÇÃO ESTÁ AQUI. Esta constante
 * apontava para `8.2.1.1.1.00.00`, que no PCASP oficial é **SINTÉTICA** — e sintética não
 * recebe partida (`INVARIANTE 5` do adapter). O efeito não aparecia porque os bancos de
 * trabalho nasciam clonados, com a `analitica` do plano MÍNIMO; em instalação limpa com o
 * plano oficial, `empenhar` recusa: "Conta sintética não recebe partida: 8.2.1.1.1.00.00".
 *
 * **Fonte:** `Pcasp_2025.xlsx` do TCE-PB, o mesmo arquivo de `seed:pcasp-oficial`. Ele
 * particiona `8.2.1.1.1 DISPONIBILIDADE POR DESTINAÇÃO DE RECURSOS` em três analíticas:
 *
 *   · `8.2.1.1.1.01.00` RECURSOS DISPONÍVEIS PARA O EXERCÍCIO   ← é esta.
 *   · `8.2.1.1.1.02.00` RECURSOS DE EXERCÍCIOS ANTERIORES
 *   · `8.2.1.1.1.99.00` OUTROS CONTROLES
 *
 * ⚠️ E NÃO É SEMELHANÇA DE NOME — são DUAS medidas que fecham a escolha:
 *
 * 1. **O circuito já está nas folhas.** As outras três pernas da DDR apontam para a
 *    analítica do seu ramo desde sempre — `.2.01.00` A LIQUIDAR, `.3.01.00` COMPROMETIDA
 *    POR LIQUIDAÇÃO, `.4.01.00` UTILIZADA COM EXECUÇÃO ORÇAMENTÁRIA (o M08 repete os três
 *    literalmente). Só a primeira perna parou no pai sintético.
 * 2. **Não existe ato que traga recurso de exercício anterior.** O único CRÉDITO a esta
 *    conta em todo o sistema é `roteiroArrecadacao` — medido: duas ocorrências da
 *    constante, o débito do empenho e este crédito. Abertura de exercício com superávit
 *    financeiro não está modelada; quando estiver, ela nasce com a sua própria perna em
 *    `.02.00`, e não reclassifica o que já foi arrecadado neste exercício.
 *
 * ⚠️ SALDO JÁ LANÇADO NÃO MIGRA SOZINHO. Em base que já operava com a conta antiga, mover
 * o acumulado é `repontarConta` (M01), que grava o lançamento e o registro `MigracaoDeConta`
 * explicando de onde, para onde e quanto. Pendência `DDR-DISPONIVEL-SALDO-A-REPONTAR`.
 */
export const CONTA_DDR_DISPONIVEL = "8.2.1.1.1.01.00";
export const CONTA_DDR_COMPROMETIDA_EMPENHO = "8.2.1.1.2.01.00";
export const CONTA_DDR_COMPROMETIDA_LIQUIDACAO = "8.2.1.1.3.01.00";
export const CONTA_DDR_UTILIZADA = "8.2.1.1.4.01.00";

/**
 * A obrigação com o fornecedor que a liquidação faz nascer e o pagamento extingue.
 *
 * ⚠️ REPONTADA EM 2026-09-19, E ELA ESTAVA TRIPLICADA FORA DAQUI. Este código vivia como
 * `const CONTA_FORNECEDORES` repetido em `lib/portas/liquidacao.ts`, `pagamento.ts` e
 * `execucao-do-contrato.ts`, apontando para `2.1.3.1.1.00.00` — o nó de CONSOLIDAÇÃO, que é
 * SINTÉTICO no PCASP oficial. Em instalação limpa a liquidação recusava no meio do percurso
 * da ponte contratual, depois de a medição e o recebimento já terem passado.
 *
 * **Fonte:** `Pcasp_2025.xlsx` do TCE-PB. O ramo `2.1.3.1.1` se desdobra em FORNECEDORES
 * NACIONAIS (`.01`), CONTAS A PAGAR CREDORES NACIONAIS (`.03`), precatórios (`.05` a `.08`)
 * e decisões judiciais (`.09`/`.10`); dentro de `.01`, em não parcelados (`.01.01`),
 * parcelados (`.01.02`), renegociação (`.01.03`) e demais (`.01.99`). A liquidação ordinária
 * de um contrato faz nascer obrigação com fornecedor NÃO PARCELADA — o parcelamento e a
 * renegociação são atos próprios, que o sistema não tem.
 *
 * ⚠️ E ISTO NÃO DEVERIA SER CONSTANTE. `roteiroLiquidacao` recebe `obrigacaoAPagar` por
 * PARÂMETRO justamente porque o credor pode não ser fornecedor (uma conta de energia é
 * `.03.01`). Hoje as três portas passam sempre a mesma conta, e a escolha do credor não
 * chega ao roteiro. Pendência `OBRIGACAO-A-PAGAR-POR-NATUREZA-DO-CREDOR`: enquanto ela
 * viver, toda liquidação nasce como obrigação com fornecedor.
 *
 * ⚠️ Saldo já lançado na conta antiga não migra sozinho — `repontarConta` do M01.
 * Pendência `FORNECEDORES-SALDO-A-REPONTAR`.
 */
export const CONTA_FORNECEDORES_A_PAGAR = "2.1.3.1.1.01.01";

/** Variação Patrimonial Diminutiva — a despesa incorrida que NÃO vira ativo. */
export const CONTA_VPD = "3.3.2.1.1.01.00";
/**
 * Almoxarifado — material de consumo entra como ATIVO, não como despesa.
 *
 * ⚠️ REPONTADA NO ENT05 (ITEM 3). Era `1.1.5.1.1.00.00`, que no PCASP oficial é
 * **MERCADORIAS PARA REVENDA OU DOAÇÃO** — estoque para ALIENAR ou DISTRIBUIR, não o
 * almoxarifado de consumo próprio. O saldo já lançado na conta antiga é movido pelo
 * `repontarConta`, com lançamento que explica a mudança; esta constante passa a apontar o
 * conceito certo daqui para a frente.
 */
export const CONTA_ESTOQUE = "1.1.5.6.1.01.00";
/**
 * Dívida fundada — o empenho do elemento 71 AMORTIZA passivo; não há VPD.
 *
 * ⚠️ REPONTADA NO ENT05 (ITEM 3). Era `2.2.1.1.1.00.00`, que no PCASP oficial é
 * **PESSOAL A PAGAR** — obrigação de folha. Empréstimo interno de longo prazo por
 * contrato é `2.2.2.1.1.02.98`.
 */
export const CONTA_DIVIDA_FUNDADA = "2.2.2.1.1.02.98";

/**
 * O ROL FECHADO DA PERNA DEVEDORA DA LIQUIDAÇÃO — e por que ele é fechado.
 *
 * ═══ A PERGUNTA QUE A LIQUIDAÇÃO FAZ ═══
 * "A despesa que acabou de ser incorrida virou o quê?" São três respostas possíveis,
 * e a natureza da despesa é quem decide:
 *   · serviço/pessoal → nada sobra: é VPD (a riqueza diminuiu).
 *   · material de consumo → vira ESTOQUE (a riqueza mudou de forma, não diminuiu).
 *   · amortização (elemento 71) → baixa o PASSIVO (a dívida encolheu).
 *
 * ⚠️ FECHADO E FAIL-CLOSED, e é isto que o torna útil. O rol cobre só os elementos
 * PROVADOS pelas fixtures (39, 30, 71). Os outros ~75 do Anexo II da Portaria
 * 163/2001 não têm regra aqui — e um `default: VPD` seria a pior escolha possível:
 * o empenho de equipamento (elemento 52) viraria despesa em vez de imobilizado, o
 * patrimônio nunca cresceria, e ninguém veria, porque o lançamento fecharia.
 * Melhor DERRUBAR nomeando o elemento e obrigar a decisão.
 *
 * Pendência: `MAPA-ELEMENTO-CONTA`. O xlsx PCASP Estendido fecha o rol.
 */
const CONTRAPARTIDA_DA_LIQUIDACAO: Readonly<Record<string, string>> = {
  "30": CONTA_ESTOQUE, // Material de Consumo
  "39": CONTA_VPD, // Outros Serviços de Terceiros — Pessoa Jurídica
  "71": CONTA_DIVIDA_FUNDADA, // Principal da Dívida Contratual Resgatado
};

/**
 * A NATUREZA DA OPERAÇÃO, pelo rol: este elemento liquida em ESTOQUE? (sessão noturna V4, §6)
 *
 * ⚠️ É a NATUREZA que decide se a liquidação é de material — não a existência de uma classe
 * de material cadastrada (a completude da parametrização é outra pergunta, e a ausência dela é
 * pendência IMPEDITIVA, não desligamento da integração). Não lança para elemento sem regra:
 * quem cobra o roteiro é `contrapartidaDaLiquidacao`; aqui a resposta é só "é estoque".
 */
export function elementoDebitaEstoque(codElemento: string): boolean {
  return CONTRAPARTIDA_DA_LIQUIDACAO[codElemento] === CONTA_ESTOQUE;
}

/** Os elementos com regra — para o teste de exaustividade e a mensagem de erro. */
export const ELEMENTOS_COM_ROTEIRO: readonly string[] = Object.keys(
  CONTRAPARTIDA_DA_LIQUIDACAO
);

/**
 * A conta que a liquidação DEBITA, decidida pelo elemento da natureza da despesa.
 * Lança nomeando o elemento quando não há regra — nunca chuta.
 */
export function contrapartidaDaLiquidacao(codElemento: string): string {
  const conta = CONTRAPARTIDA_DA_LIQUIDACAO[codElemento];
  if (conta === undefined) {
    throw new Error(
      `SEM ROTEIRO PARA O ELEMENTO ${codElemento}: a liquidação precisa saber em que ` +
        `a despesa incorrida se transformou (VPD? estoque? baixa de passivo?), e essa ` +
        `resposta é do PLANO DE CONTAS, não do sistema. Elementos com regra hoje: ` +
        `${ELEMENTOS_COM_ROTEIRO.join(", ")}. Um default aqui faria, por exemplo, um ` +
        `empenho de equipamento (52) virar despesa em vez de imobilizado — e o ` +
        `lançamento fecharia, então ninguém veria. Ver MAPA-ELEMENTO-CONTA no ` +
        `MODULO.md do M01.`
    );
  }
  return conta;
}

// ── OS ROTEIROS ──────────────────────────────────────────────────────────────

/**
 * EMPENHO — orçamentário + controle. Não há fato patrimonial: nada foi recebido ainda,
 * e a obrigação com o fornecedor só nasce na liquidação.
 *
 * ORÇAMENTÁRIO: D crédito disponível / C crédito empenhado a liquidar
 * CONTROLE:     D DDR disponível     / C DDR comprometida por empenho
 *
 * ⚠️ AS DUAS PERGUNTAS, NO MESMO ATO. O orçamentário diz "usei crédito"; o controle diz
 * "comprometi dinheiro daquela fonte". Empenhar sem a perna de controle deixaria o
 * mesmo dinheiro parecer livre para outro empenho — o crédito acabaria e o caixa,
 * duas vezes prometido, não.
 */
export function roteiroEmpenho(): RoteiroContabil {
  return [
    { conta: CONTA_CREDITO_DISPONIVEL, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    {
      conta: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    { conta: CONTA_DDR_DISPONIVEL, tipo: "DEBITO", subsistema: "CONTROLE" },
    {
      conta: CONTA_DDR_COMPROMETIDA_EMPENHO,
      tipo: "CREDITO",
      subsistema: "CONTROLE",
    },
  ];
}

/**
 * LIQUIDAÇÃO — o fato patrimonial nasce aqui: a despesa foi incorrida e a obrigação
 * existe.
 *
 * PATRIMONIAL:  D (VPD | estoque | passivo)      / C obrigação a pagar
 * ORÇAMENTÁRIO: D crédito empenhado a liquidar   / C crédito liquidado a pagar
 *
 * ⚠️ Pula o estágio `.02` (SEM-ESTAGIO-EM-LIQUIDACAO) — ele é facultativo no MCASP.
 *
 * `obrigacaoAPagar` vem do ATO (como a disponibilidade no pagamento): o credor pode
 * ser fornecedor, pessoal ou consignatário, e quem sabe qual é o chamador.
 */
export function roteiroLiquidacao(p: {
  readonly codElemento: string;
  readonly obrigacaoAPagar: string;
}): RoteiroContabil {
  return [
    {
      conta: contrapartidaDaLiquidacao(p.codElemento),
      tipo: "DEBITO",
      subsistema: "PATRIMONIAL",
    },
    { conta: p.obrigacaoAPagar, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    {
      conta: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
      tipo: "DEBITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_CREDITO_LIQUIDADO_A_PAGAR,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    // CONTROLE: o dinheiro passa de "comprometido por empenho" a "comprometido por
    // liquidação" — a obrigação agora é exigível, e a fila do art. 141 começa a contar.
    {
      conta: CONTA_DDR_COMPROMETIDA_EMPENHO,
      tipo: "DEBITO",
      subsistema: "CONTROLE",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
      tipo: "CREDITO",
      subsistema: "CONTROLE",
    },
  ];
}

/**
 * LIQUIDAÇÃO DA FOLHA (M33, V6.1) — as MESMAS seis pernas, com o par PATRIMONIAL declarado.
 *
 * ⚠️ POR QUE ELA EXISTE, e por que não é `roteiroLiquidacao` com um elemento a mais no rol.
 * `contrapartidaDaLiquidacao` responde "a despesa incorrida virou o quê?" por ELEMENTO, e o rol
 * cobre 30, 39 e 71. O elemento 11 (vencimentos e vantagens fixas) não está lá, e a conta que o
 * rol chama de VPD é `3.3.2.1.1.01.00` — VPD de SERVIÇOS DE TERCEIROS. Acrescentar "11" apontando
 * para ela lançaria a remuneração dos servidores como serviço contratado, e o lançamento
 * FECHARIA: ΣD = ΣC em cada subsistema, e ninguém veria.
 *
 * ⚠️ E UM MAPA POR ELEMENTO NÃO RESOLVERIA NEM COM A CONTA CERTA: vencimento, 13º e férias
 * dividem o elemento e creditam contas de "pessoal a pagar" distintas no PCASP. O par certo é
 * decisão do ENTE, por grupo de empenho — e é de lá que ele vem (`GrupoDeEmpenhoDaFolha`),
 * fail-closed. Aqui só o ORÇAMENTÁRIO e o CONTROLE permanecem canônicos, porque esses NÃO variam:
 * a DDR tem de sair de "comprometida por empenho" para "comprometida por liquidação", ou o
 * pagamento debitaria um comprometido que nunca foi creditado.
 */
export function roteiroLiquidacaoDaFolha(p: {
  readonly variacaoDiminutiva: string;
  readonly obrigacaoAPagar: string;
}): RoteiroContabil {
  return [
    { conta: p.variacaoDiminutiva, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: p.obrigacaoAPagar, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    {
      conta: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
      tipo: "DEBITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_CREDITO_LIQUIDADO_A_PAGAR,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_EMPENHO,
      tipo: "DEBITO",
      subsistema: "CONTROLE",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
      tipo: "CREDITO",
      subsistema: "CONTROLE",
    },
  ];
}

/**
 * PAGAMENTO — a obrigação é extinta e o dinheiro sai do caixa.
 *
 * PATRIMONIAL:  D obrigação a pagar          / C disponibilidade
 * ORÇAMENTÁRIO: D crédito liquidado a pagar  / C crédito liquidado pago
 *
 * CONTROLE:     D DDR comprometida por liq. / C DDR utilizada
 *
 * `disponibilidade` vem do ATO: é a conta bancária de onde o dinheiro saiu, e a TR
 * 5.23 já a amarra à fonte.
 *
 * ⚠️ COM RETENÇÃO, AS PERNAS DE CONTROLE FICAM NO **BRUTO** — e isso é uma decisão,
 * não um descuido. `comporPagamentoComRetencoes` (M07) dá o líquido a UMA perna só (a
 * do caixa, e ele recusa qualquer outra: "deduzir o orçamentário faria a retenção virar
 * desconto de despesa"). Então a DDR do pagamento retido registra que o dinheiro INTEIRO
 * saiu do comprometido, sem separar o que foi ao credor do que ficou retido.
 *
 * O espelho oficial (TCE-SC) refina isso com uma conta a mais — `8.2.1.1.3.02`
 * (comprometida por consignações): o retido creditaria `.3.02` em vez de `.4.01`, e o
 * pagamento da extra depois moveria `.3.02 → .4.01`. Implementar exigiria que a perna
 * de controle também se dividisse entre líquido e retido — ou seja, mudar
 * `comporPagamentoComRetencoes`, que é motor do M07 e não desta fatia.
 *
 * Pendência: **DDR-RETENCAO-CONSIGNACOES** (o espelho está no MODULO.md do M07).
 * Enquanto ela existir, a DDR utilizada inclui o retido — o que é conservador (o
 * dinheiro de fato saiu do comprometido) e nunca superestima o disponível.
 */
export function roteiroPagamento(p: {
  readonly obrigacaoAPagar: string;
  readonly disponibilidade: string;
}): RoteiroContabil {
  return [
    { conta: p.obrigacaoAPagar, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: p.disponibilidade, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    {
      conta: CONTA_CREDITO_LIQUIDADO_A_PAGAR,
      tipo: "DEBITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_CREDITO_LIQUIDADO_PAGO,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
      tipo: "DEBITO",
      subsistema: "CONTROLE",
    },
    { conta: CONTA_DDR_UTILIZADA, tipo: "CREDITO", subsistema: "CONTROLE" },
  ];
}

/**
 * ARRECADAÇÃO — o dinheiro entra e a previsão baixa.
 *
 * PATRIMONIAL:  D disponibilidade      / C variação aumentativa
 * ORÇAMENTÁRIO: D receita a realizar   / C receita realizada
 *
 * ⚠️ A VPA VEM DO ATO, e não do rol. A contrapartida patrimonial da receita depende
 * da natureza dela (VPA de impostos, de transferências, de contribuições…) e, na
 * operação COMPOSTA, nem VPA é: `arrecadarComVinculo` (M04×M10) passa o CRÉDITO A
 * RECEBER, porque a VPA já nasceu no reconhecimento pelo fato gerador — repeti-la
 * aqui contaria a mesma receita duas vezes. Um rol fechado nesta perna quebraria
 * exatamente esse caso. Pendência irmã: `MAPA-NATUREZA-CONTA`.
 */
export function roteiroArrecadacao(p: {
  readonly disponibilidade: string;
  readonly variacaoAumentativa: string;
  /**
   * ⚠️ A DIMENSÃO QUE FALTAVA (V11 V9.3), e ela é OBRIGATÓRIA de propósito. Um parâmetro
   * opcional com queda para uma conta padrão seria a escolha por conveniência de volta,
   * escondida atrás de um `??`. Quem chama tem de saber de que natureza é a fonte — e
   * quem não sabe tem de recusar, não supor.
   */
  readonly naturezaDaFonte: NaturezaDaFonteDdr;
}): RoteiroContabil {
  return [
    { conta: p.disponibilidade, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: p.variacaoAumentativa, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: CONTA_RECEITA_A_REALIZAR, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: CONTA_RECEITA_REALIZADA, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
    // ⚠️ A ÚNICA PERNA DE CLASSE 7 DO SISTEMA. É aqui que o dinheiro ENTRA sob controle:
    // a arrecadação é o único ato que traz recurso novo. Dali em diante ele só muda de
    // estado, dentro da classe 8 — por isso empenho, liquidação e pagamento são 8×8.
    //
    // ⚠️ E É A ÚNICA PERNA DA CADEIA QUE VARIA POR NATUREZA. As quatro da classe 8 seguem
    // fixas, e não é assimetria: a classe 8 mede o ESTADO do dinheiro (disponível,
    // comprometido, utilizado) e o plano a particiona por estado; a classe 7 mede a ORIGEM,
    // e o plano a particiona por natureza da fonte. `saldoDdrPorFonte` continua somando as
    // quatro de sempre — nenhuma segunda aritmética nasce daqui.
    { conta: contaDeControleDaDdr(p.naturezaDaFonte), tipo: "DEBITO", subsistema: "CONTROLE" },
    { conta: CONTA_DDR_DISPONIVEL, tipo: "CREDITO", subsistema: "CONTROLE" },
  ];
}

/**
 * ARRECADAÇÃO DISTRIBUÍDA ENTRE FONTES — V16/C30.
 *
 * ⚠️ POR QUE EXISTE O PAR, E POR QUE ELE NÃO DIVERGE. `roteiroArrecadacao` é o caso de UMA
 * fonte e continua sendo chamado por todo mundo. Este é o caso de várias — e a única diferença
 * entre os dois é a CLASSE 7: lá uma perna com o total, aqui uma perna POR NATUREZA de fonte,
 * cada uma com a sua fatia. As outras quatro pernas são idênticas, e `m01-roteiros.test.ts`
 * afirma essa identidade comparando os dois com N=1 — se alguém mexer num e esquecer o outro, o
 * teste acusa, em vez de o comentário prometer.
 *
 * ⚠️ A CONSERVAÇÃO É DO MOTOR. Σ das fatias de classe 7 tem de bater com o total da perna de
 * classe 8, e é `validarLancamento` que cobra isso (invariante (e): cada subsistema fecha
 * sozinho). Parcelas que não somam o total da guia NÃO produzem lançamento — logo não produzem
 * guia. Nenhuma conferência escrita à mão guarda esse número.
 *
 * ⚠️ UMA ENTRADA POR NATUREZA, CONSOLIDADA PELO CHAMADOR. Duas fontes VINCULADAS na mesma guia
 * são UMA perna de `7.2.1.1.2`, não duas — duas pernas idênticas no razão não se distinguem uma
 * da outra, e o detalhe por FONTE mora na `FonteDaArrecadacao`, que é onde ele é legível.
 * Natureza repetida aqui é erro de composição e recusa.
 */
export function roteiroArrecadacaoDistribuida(p: {
  readonly disponibilidade: string;
  readonly variacaoAumentativa: string;
  readonly porNaturezaDaFonte: readonly {
    readonly natureza: NaturezaDaFonteDdr;
    readonly valor: Money;
  }[];
}): RoteiroContabil {
  if (p.porNaturezaDaFonte.length === 0) {
    throw new Error(
      `ARRECADAÇÃO SEM DESTINAÇÃO: a guia distribuída não trouxe nenhuma fatia por natureza de ` +
        `fonte, e sem isso a classe 7 não tem o que debitar. Nada foi gravado.`
    );
  }
  const vistas = new Set<NaturezaDaFonteDdr>();
  for (const n of p.porNaturezaDaFonte) {
    if (vistas.has(n.natureza)) {
      throw new Error(
        `NATUREZA REPETIDA NA DISTRIBUIÇÃO: "${n.natureza}" aparece mais de uma vez. As fontes da ` +
          `mesma natureza somam UMA perna de controle — duas pernas idênticas no razão não se ` +
          `distinguem, e o detalhe por fonte fica na distribuição da guia. Nada foi gravado.`
      );
    }
    vistas.add(n.natureza);
  }

  return [
    { conta: p.disponibilidade, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: p.variacaoAumentativa, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: CONTA_RECEITA_A_REALIZAR, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: CONTA_RECEITA_REALIZADA, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
    ...p.porNaturezaDaFonte.map((n) => ({
      conta: contaDeControleDaDdr(n.natureza),
      tipo: "DEBITO" as const,
      subsistema: "CONTROLE" as const,
      // A FATIA daquela natureza — a única perna do sistema que não recebe o total do fato.
      valor: n.valor,
    })),
    { conta: CONTA_DDR_DISPONIVEL, tipo: "CREDITO", subsistema: "CONTROLE" },
  ];
}
