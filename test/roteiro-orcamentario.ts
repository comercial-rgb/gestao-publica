import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * O ROTEIRO DO SUBSISTEMA ORÇAMENTÁRIO, para os testes.
 *
 * ⚠️ POR QUE ISTO É UM HELPER COMPARTILHADO, E NÃO UMA CÓPIA EM CADA FIXTURE.
 * A partir deste bloco, TODA ficha que nasce lança no razão (a dotação da LOA), e o
 * lançamento é FAIL-CLOSED: sem roteiro, a criação da ficha CAI. Isso alcança
 * praticamente todos os testes do repositório — e uma cópia do seed em cada um seria
 * quarenta lugares para esquecer de um.
 *
 * ═══ AS CONTAS DE CONTROLE (5 e 6) ═══
 * O PCASP põe o orçamento da despesa em duas mãos que se espelham:
 *
 *   5.2.2.1.1  DOTAÇÃO INICIAL              devedora   (o que a LOA fixou)
 *   5.2.2.1.2  DOTAÇÃO ADICIONAL            devedora   (o que os decretos acrescentaram)
 *   6.2.2.1.1  CRÉDITO DISPONÍVEL           credora    (o que ainda dá para gastar)
 *   6.2.2.1.2  CRÉDITO RESERVADO            credora
 *   6.2.2.1.3  CRÉDITO EMPENHADO            credora
 *
 * A classe 5 é o "de onde vem" e a 6 é o "em que estado está" — e cada movimento de
 * dotação é uma passagem de um estado ao outro. Daí os roteiros abaixo.
 *
 * ⚠️ ELAS NÃO TÊM `indicadorSuperavit`, e isso é CORRETO: "financeiro ou permanente" é
 * pergunta sobre saldo PATRIMONIAL (classes 1 e 2). Uma conta de controle não é ativo
 * nem passivo — ela não entra no superávit financeiro nem na MSC com a IC "FP".
 */

/**
 * ⚠️ AS CONTAS TÊM UM DONO, E ELE É O DOMÍNIO — `modules/m01-core-contabil/roteiros.ts`.
 *
 * Elas eram declaradas AQUI, num helper de teste, e o resto do projeto as copiava. Foi
 * assim que `6.2.2.1.3.00.00` (a SINTÉTICA "Crédito Empenhado") virou o de facto
 * "crédito empenhado" de todas as fixtures — uma conta de agregação recebendo partida.
 * O extrato oficial STN diz que a analítica é `6.2.2.1.3.01.00` (a Liquidar).
 *
 * Agora este arquivo RE-EXPORTA. Um dono; a fixture segue o domínio, não o contrário.
 */
export {
  CONTA_DOTACAO_INICIAL,
  CONTA_DOTACAO_ADICIONAL,
  CONTA_CREDITO_ADICIONAL_SUPLEMENTAR,
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_RESERVADO,
} from "../modules/m01-core-contabil/roteiros.js";

import {
  CONTAS_CONTROLE_DDR,
  CONTA_CREDITO_DISPONIVEL as _DISP,
  CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
  CONTA_CREDITO_RESERVADO as _RESERV,
  CONTA_DDR_COMPROMETIDA_EMPENHO,
  CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
  CONTA_DDR_DISPONIVEL,
  CONTA_DDR_UTILIZADA,
  CONTA_CREDITO_ADICIONAL_SUPLEMENTAR as _SUPL,
  CONTA_DOTACAO_ADICIONAL as _ADIC,
  CONTA_DOTACAO_INICIAL as _INIC,
} from "../modules/m01-core-contabil/roteiros.js";

/**
 * ═══ ⚠️ ESTAS DUAS SÃO FIXTURE, E **NÃO** SÃO A CLASSIFICAÇÃO DO CRÉDITO ESPECIAL ═══
 *
 * O plano oficial parte cada um destes ramos em TRÊS analíticas — ABERTOS, REABERTOS e
 * REABERTOS - SUPLEMENTAÇÃO — e qual delas vale depende de um fato que o sistema ainda não
 * registra (pendência `CREDITO-ESPECIAL-ABERTO-OU-REABERTO`, em
 * `modules/m01-core-contabil/roteiros.ts`). Por isso `roteiros.ts` NÃO exporta constante
 * para elas, e o seed de produção RECUSA estes dois roteiros.
 *
 * Uma fixture, porém, precisa de alguma conta para existir: sem roteiro de ESPECIAL, todo
 * teste que abre crédito especial cai antes de chegar ao que ele mede. As duas abaixo são
 * o ramo ABERTOS, escolhido porque o crédito de um teste nasce no exercício do próprio
 * teste — e o prefixo `FIXTURE_` está no nome para que uma cópia daqui para dentro de
 * `modules/` ou `prisma/seed/` se leia como errada na primeira vista.
 *
 * ⚠️ É EXATAMENTE ASSIM QUE `6.2.2.1.3.00.00` VIROU O "CRÉDITO EMPENHADO" DE FACTO DE TODO
 * O REPOSITÓRIO: uma conta declarada num helper de teste e copiada adiante. A diferença
 * aqui é que o dono (o domínio) se recusa a ter a constante, e o seed de produção recusa o
 * roteiro — a fixture não tem para onde vazar.
 */
const FIXTURE_CONTA_CREDITO_ESPECIAL = "5.2.2.1.2.02.01";
const FIXTURE_CONTA_CREDITO_EXTRAORDINARIO = "5.2.2.1.2.03.01";

/**
 * ⚠️ E DESDE A V8.8 A FIXTURE TEM AS DUAS ABERTURAS, NÃO POR ENFEITE.
 *
 * O roteiro ganhou a dimensão ABERTO/REABERTO (`ROTEIRO-SEM-DIMENSAO-DA-ABERTURA`), e uma fixture
 * que só semeasse o ramo ABERTOS deixaria o teste do REABERTO cair por falta de roteiro — e a
 * queda se leria como "a dimensão funciona", quando ela só estaria faltando. Com as duas
 * semeadas, um reaberto que caia na conta do aberto APARECE: as contas são diferentes.
 *
 * O ramo REABERTOS continua sendo fixture pelo mesmo motivo que o ABERTOS: qual das DUAS
 * analíticas de reabertura o ente usa (`.02` REABERTOS ou `.03` REABERTOS - SUPLEMENTAÇÃO) é
 * decisão dele, tomada na tela do roteiro. Pendência `REABERTO-COM-SUPLEMENTACAO-NAO-DISTINGUIDO`.
 */
const FIXTURE_CONTA_CREDITO_ESPECIAL_REABERTO = "5.2.2.1.2.02.02";
const FIXTURE_CONTA_CREDITO_EXTRAORDINARIO_REABERTO = "5.2.2.1.2.03.02";

/**
 * ⚠️ APELIDO COM CORREÇÃO DE CÓDIGO: era `6.2.2.1.3.00.00` (sintética); agora aponta
 * para a analítica oficial `6.2.2.1.3.01.00` (Crédito Empenhado a Liquidar).
 */
export const CONTA_CREDITO_EMPENHADO = CONTA_CREDITO_EMPENHADO_A_LIQUIDAR;

const CONTA_DOTACAO_INICIAL = _INIC;
const CONTA_DOTACAO_ADICIONAL = _ADIC;
const CONTA_CREDITO_ADICIONAL_SUPLEMENTAR = _SUPL;
const CONTA_CREDITO_DISPONIVEL = _DISP;
const CONTA_CREDITO_RESERVADO = _RESERV;

const CONTAS: readonly {
  codigo: string;
  nome: string;
  naturezaSaldo: "DEVEDORA" | "CREDORA";
}[] = [
  { codigo: CONTA_DOTACAO_INICIAL, nome: "Dotação inicial", naturezaSaldo: "DEVEDORA" },
  { codigo: CONTA_DOTACAO_ADICIONAL, nome: "Dotação adicional", naturezaSaldo: "DEVEDORA" },
  { codigo: CONTA_CREDITO_ADICIONAL_SUPLEMENTAR, nome: "Credito adicional - suplementar", naturezaSaldo: "DEVEDORA" },
  { codigo: FIXTURE_CONTA_CREDITO_ESPECIAL, nome: "Creditos especiais abertos", naturezaSaldo: "DEVEDORA" },
  { codigo: FIXTURE_CONTA_CREDITO_ESPECIAL_REABERTO, nome: "Creditos especiais reabertos", naturezaSaldo: "DEVEDORA" },
  { codigo: FIXTURE_CONTA_CREDITO_EXTRAORDINARIO, nome: "Creditos extraordinarios abertos", naturezaSaldo: "DEVEDORA" },
  { codigo: FIXTURE_CONTA_CREDITO_EXTRAORDINARIO_REABERTO, nome: "Creditos extraordinarios reabertos", naturezaSaldo: "DEVEDORA" },
  { codigo: CONTA_CREDITO_DISPONIVEL, nome: "Crédito disponível", naturezaSaldo: "CREDORA" },
  { codigo: CONTA_CREDITO_RESERVADO, nome: "Crédito reservado", naturezaSaldo: "CREDORA" },
  { codigo: CONTA_CREDITO_EMPENHADO, nome: "Crédito empenhado", naturezaSaldo: "CREDORA" },

  // ⚠️ A DDR (7.4) — e ela mora AQUI pelo mesmo motivo que os roteiros de dotação: a
  // partir desta fatia, TODO empenho/liquidação/pagamento move o controle de
  // disponibilidade, e `resolverContas` é fail-closed. Sem estas contas, 15 arquivos de
  // fixture cairiam com "Conta(s) inexistente(s) no plano PCASP" — e a cópia em cada um
  // seria, de novo, quarenta lugares para esquecer de um.
  //
  // A classe 7 entra junto: só a ARRECADAÇÃO a move (D 7.2.1.1 / C 8.2.1.1.1), mas
  // fixtures que arrecadam e empenham na mesma ficha precisam das duas.
  // ⚠️ AS CINCO, E NÃO O PAI (V11 V9.3). A fixture trazia `7.2.1.1.0.00.00`, o nó SINTÉTICO —
  // e como ela força `analitica: true` (abaixo), o plano de teste aceitava a partida que o
  // plano oficial recusa. Agora ela traz as folhas que o `Pcasp_2025.xlsx` traz, e a fixture
  // deixa de ser mais permissiva que a produção.
  ...CONTAS_CONTROLE_DDR.map((codigo) => ({
    codigo,
    nome: `Controle da Disponibilidade de Recursos ${codigo}`,
    naturezaSaldo: "DEVEDORA" as const,
  })),
  { codigo: CONTA_DDR_DISPONIVEL, nome: "DDR Disponível", naturezaSaldo: "CREDORA" },
  { codigo: CONTA_DDR_COMPROMETIDA_EMPENHO, nome: "DDR Comprometida por Empenho", naturezaSaldo: "CREDORA" },
  { codigo: CONTA_DDR_COMPROMETIDA_LIQUIDACAO, nome: "DDR Comprometida por Liquidação", naturezaSaldo: "CREDORA" },
  { codigo: CONTA_DDR_UTILIZADA, nome: "DDR Utilizada", naturezaSaldo: "CREDORA" },
];

/**
 * OS ROTEIROS, e a leitura de cada um em português:
 *
 *   DOTACAO_INICIAL    D dotação inicial   / C crédito disponível
 *     "a LOA fixou X, e X está disponível para gastar"
 *   CREDITO_ADICIONAL  D dotação adicional / C crédito disponível
 *     "o decreto acrescentou X, e X está disponível"
 *   ANULACAO_CREDITO   D crédito disponível / C dotação adicional
 *     "o decreto tirou X do disponível" (o inverso exato)
 *   RESERVA            D crédito disponível / C crédito reservado
 *     "X saiu do disponível e ficou reservado para a licitação"
 *   RESERVA_LIBERADA   D crédito reservado  / C crédito disponível
 *     "X voltou do reservado para o disponível"
 *
 * O EMPENHO e o EMPENHO_ANULADO **não estão aqui**: o M05 já os lança pelo roteiro que o
 * chamador passa (D crédito disponível / C crédito empenhado). Um roteiro paralelo os
 * lançaria DUAS vezes — a lição da ENTRADA do almoxarifado.
 */
const ROTEIROS: readonly {
  tipo:
    | "DOTACAO_INICIAL"
    | "CREDITO_ADICIONAL"
    | "ANULACAO_CREDITO"
    | "RESERVA"
    | "RESERVA_LIBERADA";
  tipoCredito?: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
  abertura?: "ABERTO" | "REABERTO";
  debito: string;
  credito: string;
}[] = [
  { tipo: "DOTACAO_INICIAL", debito: CONTA_DOTACAO_INICIAL, credito: CONTA_CREDITO_DISPONIVEL },
  // ⚠️ TRÊS LINHAS DESDE A V7.1 — o plano parte a dotação adicional POR TIPO DE CRÉDITO, e
  // com uma linha só todo especial e todo extraordinário virava suplementar.
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "SUPLEMENTAR", debito: CONTA_CREDITO_ADICIONAL_SUPLEMENTAR, credito: CONTA_CREDITO_DISPONIVEL },
  // ⚠️ QUATRO LINHAS DESDE A V8.8 — o especial e o extraordinário se partem em ABERTO e REABERTO,
  // e as contas são DIFERENTES de propósito: é assim que um reaberto lançado na conta do aberto
  // aparece num teste em vez de passar.
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", abertura: "ABERTO", debito: FIXTURE_CONTA_CREDITO_ESPECIAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", abertura: "REABERTO", debito: FIXTURE_CONTA_CREDITO_ESPECIAL_REABERTO, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "EXTRAORDINARIO", abertura: "ABERTO", debito: FIXTURE_CONTA_CREDITO_EXTRAORDINARIO, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "EXTRAORDINARIO", abertura: "REABERTO", debito: FIXTURE_CONTA_CREDITO_EXTRAORDINARIO_REABERTO, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "ANULACAO_CREDITO", debito: CONTA_CREDITO_DISPONIVEL, credito: CONTA_DOTACAO_ADICIONAL },
  { tipo: "RESERVA", debito: CONTA_CREDITO_DISPONIVEL, credito: CONTA_CREDITO_RESERVADO },
  { tipo: "RESERVA_LIBERADA", debito: CONTA_CREDITO_RESERVADO, credito: CONTA_CREDITO_DISPONIVEL },
];

/**
 * Idempotente: pode ser chamado por qualquer fixture, em qualquer ordem, e convive com
 * as contas que o teste já criou (o `upsert` é pelo CÓDIGO — o `id` de quem chegou
 * primeiro é preservado).
 */
export async function semearRoteiroOrcamentario(
  prisma: PrismaClient
): Promise<void> {
  const jaTem = await prisma.roteiroOrcamentario.count();
  if (jaTem >= ROTEIROS.length) return;

  const ids = new Map<string, string>();
  for (const c of CONTAS) {
    const conta = await prisma.contaPcasp.upsert({
      where: { codigo: c.codigo },
      update: {},
      create: {
        codigo: c.codigo,
        nome: c.nome,
        naturezaSaldo: c.naturezaSaldo,
        nivel: 5,
        analitica: true,
      },
      select: { id: true },
    });
    ids.set(c.codigo, conta.id);
  }

  for (const r of ROTEIROS) {
    // A chave é o PAR (tipo, tipoCredito), e o Prisma não aceita `null` dentro de chave
    // única composta — daí o findFirst em vez do upsert. Quem garante a unicidade é o banco.
    const ja = await prisma.roteiroOrcamentario.findFirst({
      where: { tipo: r.tipo, tipoCredito: r.tipoCredito ?? null, abertura: r.abertura ?? null },
      select: { id: true },
    });
    if (ja !== null) continue;
    // ⚠️ A VERSÃO É A SEQUÊNCIA DAS DECISÕES POR (tipo, tipoCredito) — o índice único é esse, e
    // as duas aberturas do mesmo tipo de crédito não podem repetir a versão 1.
    const ultima = await prisma.roteiroOrcamentario.aggregate({
      where: { tipo: r.tipo, tipoCredito: r.tipoCredito ?? null },
      _max: { versao: true },
    });
    await prisma.roteiroOrcamentario.create({
      data: {
        tipo: r.tipo,
        tipoCredito: r.tipoCredito ?? null,
        abertura: r.abertura ?? null,
        versao: (ultima._max.versao ?? 0) + 1,
        contaDebitoId: ids.get(r.debito)!,
        contaCreditoId: ids.get(r.credito)!,
        criadoPor: "TESTE",
      },
    });
  }
}
