import {
  EVENTOS_DE_RESTOS,
  ROTULO_DO_EVENTO,
  publicarRoteiroRestosAPagar,
  roteiroVigenteDeRestos,
  type EventoDeRestos,
  type RoteiroDeRestosVigente,
} from "../../modules/m08-restos-a-pagar/servico-roteiro.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ O ROTEIRO DOS RESTOS A PAGAR NA TELA (V15) ═══
 *
 * ⚠️ POR QUE ESTA PORTA DESTRAVA A METADE QUE FALTAVA. A V14 entregou a LEITURA dos restos a
 * pagar (listagem e detalhe) e parou: as cinco operações de escrita do domínio recebem as contas
 * por parâmetro, e não havia de onde tirar o parâmetro. Configurar não é acessório aqui — é o que
 * transforma um domínio maduro em operação alcançável.
 *
 * ⚠️ E ELA NÃO ESCOLHE CONTA. Quem escolhe é o ente, com fundamento. O que esta camada faz é
 * oferecer o LUGAR, recusar o que não fecha e preservar a versão contra a qual cada fato foi
 * escriturado.
 */

/** O que a tela mostra por operação: o vigente, ou a ausência. */
export interface LinhaDeRoteiroDeRestos {
  readonly evento: EventoDeRestos;
  readonly rotulo: string;
  /** Se o par patrimonial se informa nesta operação, ou vem do próprio dado. */
  readonly patrimonialSeInforma: boolean;
  readonly vigente: RoteiroDeRestosVigente | null;
}

/**
 * ⚠️ NO PAGAMENTO O PAR PATRIMONIAL NÃO SE INFORMA, e a tela precisa dizer isso em vez de
 * mostrar dois campos vazios que o ente tentaria preencher. A obrigação a baixar é a que a
 * liquidação de origem criou, e a saída de caixa é a conta contábil da conta bancária do ato.
 */
const PATRIMONIAL_SE_INFORMA: Record<EventoDeRestos, boolean> = {
  LIQUIDACAO_NAO_PROCESSADO: true,
  PAGAMENTO: false,
  CANCELAMENTO_PROCESSADO: true,
  CANCELAMENTO_NAO_PROCESSADO: true,
};

export async function listarRoteirosDeRestos(): Promise<readonly LinhaDeRoteiroDeRestos[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const linhas: LinhaDeRoteiroDeRestos[] = [];
  for (const evento of EVENTOS_DE_RESTOS) {
    linhas.push({
      evento,
      rotulo: ROTULO_DO_EVENTO[evento],
      patrimonialSeInforma: PATRIMONIAL_SE_INFORMA[evento],
      vigente: await roteiroVigenteDeRestos(prisma, evento),
    });
  }
  return linhas;
}

/** O histórico de versões de uma operação — a resposta a "contra que roteiro isto foi feito?". */
export interface VersaoDeRoteiroDeRestos {
  readonly versao: number;
  readonly patrimonial: { readonly debito: string; readonly credito: string } | null;
  readonly controle: { readonly debito: string; readonly credito: string } | null;
  readonly fundamento: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export async function versoesDoRoteiroDeRestos(
  evento: EventoDeRestos
): Promise<readonly VersaoDeRoteiroDeRestos[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const linhas = await cliente().roteiroRestosAPagar.findMany({
    where: { evento: evento as never },
    orderBy: { versao: "desc" },
    select: {
      versao: true,
      fundamento: true,
      criadoEm: true,
      criadoPor: true,
      contaDebito: { select: { codigo: true } },
      contaCredito: { select: { codigo: true } },
      contaControleDebito: { select: { codigo: true } },
      contaControleCredito: { select: { codigo: true } },
    },
  });
  return linhas.map((l) => ({
    versao: l.versao,
    patrimonial:
      l.contaDebito !== null && l.contaCredito !== null
        ? { debito: l.contaDebito.codigo, credito: l.contaCredito.codigo }
        : null,
    controle:
      l.contaControleDebito !== null && l.contaControleCredito !== null
        ? { debito: l.contaControleDebito.codigo, credito: l.contaControleCredito.codigo }
        : null,
    fundamento: l.fundamento,
    criadoEm: l.criadoEm,
    criadoPor: l.criadoPor,
  }));
}

/**
 * As contas que o formulário oferece.
 *
 * ⚠️ O RECORTE É DECLARADO, e não é enfeite: um `select` com as 7.864 contas do plano é um
 * formulário bonito e inútil. Patrimoniais são as classes 1 a 4; o par de disponibilidade é a
 * classe 8, e só as ANALÍTICAS recebem partida.
 */
export async function contasParaRoteiroDeRestos(): Promise<{
  readonly patrimoniais: readonly { readonly codigo: string; readonly nome: string }[];
  readonly controle: readonly { readonly codigo: string; readonly nome: string }[];
}> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const [patrimoniais, controle] = await Promise.all([
    prisma.contaPcasp.findMany({
      where: {
        analitica: true,
        OR: ["1.", "2.", "3.", "4."].map((c) => ({ codigo: { startsWith: c } })),
      },
      orderBy: { codigo: "asc" },
      select: { codigo: true, nome: true },
    }),
    prisma.contaPcasp.findMany({
      // O ramo da DISPONIBILIDADE POR DESTINAÇÃO DE RECURSOS, não a classe 8 inteira: é o
      // controle que as operações de RP movem, e oferecer a classe toda esconderia o certo.
      where: { analitica: true, codigo: { startsWith: "8.2.1.1" } },
      orderBy: { codigo: "asc" },
      select: { codigo: true, nome: true },
    }),
  ]);
  return { patrimoniais, controle };
}

export async function publicarRoteiroDeRestos(input: {
  readonly evento: string;
  readonly contaDebitoCodigo: string | null;
  readonly contaCreditoCodigo: string | null;
  readonly contaControleDebitoCodigo: string | null;
  readonly contaControleCreditoCodigo: string | null;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR", (criadoPor) =>
    publicarRoteiroRestosAPagar(cliente(), {
      evento: input.evento as never,
      contaDebitoCodigo: input.contaDebitoCodigo,
      contaCreditoCodigo: input.contaCreditoCodigo,
      contaControleDebitoCodigo: input.contaControleDebitoCodigo,
      contaControleCreditoCodigo: input.contaControleCreditoCodigo,
      fundamento: input.fundamento,
      criadoPor,
    })
  );
  const pares = [
    input.contaDebitoCodigo === null
      ? null
      : `débito ${input.contaDebitoCodigo}, crédito ${input.contaCreditoCodigo}`,
    input.contaControleDebitoCodigo === null
      ? null
      : `disponibilidade ${input.contaControleDebitoCodigo} / ${input.contaControleCreditoCodigo}`,
  ]
    .filter((s): s is string => s !== null)
    .join("; ");
  return (
    `Contas publicadas na versão ${r.versao}: ${pares}.` +
    (r.anterior === null
      ? ""
      : " O que já foi escriturado continua como estava — a versão nova vale para o que vier.")
  );
}
