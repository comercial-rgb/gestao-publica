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
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_RESERVADO,
} from "../modules/m01-core-contabil/roteiros.js";

import {
  CONTA_CONTROLE_DDR,
  CONTA_CREDITO_DISPONIVEL as _DISP,
  CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
  CONTA_CREDITO_RESERVADO as _RESERV,
  CONTA_DDR_COMPROMETIDA_EMPENHO,
  CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
  CONTA_DDR_DISPONIVEL,
  CONTA_DDR_UTILIZADA,
  CONTA_DOTACAO_ADICIONAL as _ADIC,
  CONTA_DOTACAO_INICIAL as _INIC,
} from "../modules/m01-core-contabil/roteiros.js";

/**
 * ⚠️ APELIDO COM CORREÇÃO DE CÓDIGO: era `6.2.2.1.3.00.00` (sintética); agora aponta
 * para a analítica oficial `6.2.2.1.3.01.00` (Crédito Empenhado a Liquidar).
 */
export const CONTA_CREDITO_EMPENHADO = CONTA_CREDITO_EMPENHADO_A_LIQUIDAR;

const CONTA_DOTACAO_INICIAL = _INIC;
const CONTA_DOTACAO_ADICIONAL = _ADIC;
const CONTA_CREDITO_DISPONIVEL = _DISP;
const CONTA_CREDITO_RESERVADO = _RESERV;

const CONTAS: readonly {
  codigo: string;
  nome: string;
  naturezaSaldo: "DEVEDORA" | "CREDORA";
}[] = [
  { codigo: CONTA_DOTACAO_INICIAL, nome: "Dotação inicial", naturezaSaldo: "DEVEDORA" },
  { codigo: CONTA_DOTACAO_ADICIONAL, nome: "Dotação adicional", naturezaSaldo: "DEVEDORA" },
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
  { codigo: CONTA_CONTROLE_DDR, nome: "Controle da Disponibilidade de Recursos", naturezaSaldo: "DEVEDORA" },
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
  debito: string;
  credito: string;
}[] = [
  { tipo: "DOTACAO_INICIAL", debito: CONTA_DOTACAO_INICIAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", debito: CONTA_DOTACAO_ADICIONAL, credito: CONTA_CREDITO_DISPONIVEL },
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
    await prisma.roteiroOrcamentario.upsert({
      where: { tipo: r.tipo },
      update: {},
      create: {
        tipo: r.tipo,
        contaDebitoId: ids.get(r.debito)!,
        contaCreditoId: ids.get(r.credito)!,
        criadoPor: "TESTE",
      },
    });
  }
}
